import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Queue } from "bullmq";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { ExecutionEventsService } from "./execution-events.service";
import { WORKFLOW_EXECUTIONS_QUEUE } from "./queue.constants";

export type ApprovalType = "PRE_EXECUTION" | "DURING_EXECUTION" | "POST_EXECUTION";

const DEFAULT_SLA_MINUTES = 60;

/**
 * Durable human-in-the-loop coordination.
 *
 * Unlike the phase-3 in-memory tool approvals (which block a worker on a
 * promise), workflow approvals are persisted rows: the execution checkpoints
 * and terminates its job, and the approve decision enqueues a fresh resume
 * job. Approvals therefore survive process restarts and scale horizontally.
 *
 * SLA handling: listPending() opportunistically escalates overdue approvals
 * (status → ESCALATED + timeline event) so breaches surface without a
 * dedicated scheduler.
 */
@Injectable()
export class ApprovalCoordinatorService {
  private readonly logger = new Logger(ApprovalCoordinatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ExecutionEventsService,
    @InjectQueue(WORKFLOW_EXECUTIONS_QUEUE) private readonly queue: Queue,
  ) {}

  async request(input: {
    executionId: string;
    organizationId: string;
    stepId: string;
    type?: ApprovalType;
    payload: Record<string, unknown>;
    slaMinutes?: number;
  }): Promise<{ id: string }> {
    const approval = await this.prisma.approval.create({
      data: {
        executionId: input.executionId,
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        payload: input.payload as any,
        slaMinutes: input.slaMinutes ?? DEFAULT_SLA_MINUTES,
        stepId: input.stepId,
        type: input.type ?? "DURING_EXECUTION",
      },
    });

    await this.events.record(
      input.executionId,
      input.organizationId,
      "APPROVAL_REQUESTED",
      `Approval requested at step "${input.stepId}" (SLA ${String(approval.slaMinutes)}m)`,
      { approvalId: approval.id, stepId: input.stepId },
    );

    this.logger.log(`Approval ${approval.id} requested for execution ${input.executionId}`);
    return { id: approval.id };
  }

  /**
   * Decide an approval. APPROVE resumes the suspended execution through the
   * queue; REJECT finalizes it as FAILED.
   */
  async decide(
    approvalId: string,
    organizationId: string,
    userId: string,
    action: "APPROVE" | "REJECT",
    reason?: string,
  ): Promise<void> {
    const approval = await this.prisma.approval.findFirst({
      where: { id: approvalId, organizationId, subjectType: "WORKFLOW_STEP" },
    });
    if (!approval) {
      throw new NotFoundException(`Approval ${approvalId} not found`);
    }
    if (approval.status !== "PENDING" && approval.status !== "ESCALATED") {
      throw new BadRequestException(`Approval already decided: ${approval.status}`);
    }
    const executionId = approval.executionId ?? "";

    const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
    await this.prisma.approval.update({
      data: { decidedAt: new Date(), decidedBy: userId, reason, status },
      where: { id: approvalId },
    });

    await this.events.record(
      executionId,
      organizationId,
      "APPROVAL_DECIDED",
      `Approval at step "${approval.stepId}" ${status.toLowerCase()} by user`,
      { action, approvalId, reason, stepId: approval.stepId },
    );

    if (action === "APPROVE") {
      await this.queue.add("resume", {
        approvedStepId: approval.stepId,
        executionId,
        resume: true,
      });
      this.logger.log(`Approval ${approvalId} approved — resume job enqueued`);
    } else {
      await this.prisma.execution.updateMany({
        data: {
          errorMessage: `Rejected at approval step "${approval.stepId}"${reason ? `: ${reason}` : ""}`,
          errorStepId: approval.stepId,
          failedAt: new Date(),
          status: "FAILED",
        },
        where: { id: executionId, status: "WAITING_APPROVAL" },
      });
      await this.prisma.stepExecution.updateMany({
        data: { completedAt: new Date(), errorMessage: reason ?? "Rejected", status: "FAILED" },
        where: { executionId, stepId: approval.stepId },
      });
      await this.events.record(
        executionId,
        organizationId,
        "EXECUTION_FAILED",
        `Execution rejected at approval step "${approval.stepId}"`,
        { approvalId },
      );
    }
  }

  /** Pending approvals for the organization, escalating any past their SLA. */
  async listPending(organizationId: string): Promise<unknown[]> {
    await this.escalateOverdue(organizationId);
    return this.prisma.approval.findMany({
      orderBy: { requestedAt: "asc" },
      where: {
        organizationId,
        subjectType: "WORKFLOW_STEP",
        status: { in: ["PENDING", "ESCALATED"] },
      },
    });
  }

  async listForExecution(executionId: string): Promise<unknown[]> {
    return this.prisma.approval.findMany({
      orderBy: { requestedAt: "asc" },
      where: { executionId, subjectType: "WORKFLOW_STEP" },
    });
  }

  private async escalateOverdue(organizationId: string): Promise<void> {
    try {
      const pending = await this.prisma.approval.findMany({
        where: { organizationId, subjectType: "WORKFLOW_STEP", status: "PENDING" },
      });
      const now = Date.now();

      for (const approval of pending) {
        const deadline = approval.requestedAt.getTime() + approval.slaMinutes * 60_000;
        if (now > deadline) {
          await this.prisma.approval.update({
            data: { escalatedAt: new Date(), status: "ESCALATED" },
            where: { id: approval.id },
          });
          await this.events.record(
            approval.executionId ?? "",
            organizationId,
            "APPROVAL_ESCALATED",
            `Approval at step "${approval.stepId}" breached its ${String(approval.slaMinutes)}m SLA`,
            { approvalId: approval.id },
          );
        }
      }
    } catch (error) {
      this.logger.warn(`SLA escalation sweep failed: ${(error as Error).message}`);
    }
  }
}
