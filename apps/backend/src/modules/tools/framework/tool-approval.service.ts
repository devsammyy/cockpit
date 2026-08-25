import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as crypto from "crypto";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { EventDispatcherService } from "./event-dispatcher.service";

const DEFAULT_SLA_MINUTES = 60;

export interface ToolApprovalRequestInput {
  organizationId: string;
  /** The `tool_execution_history` row id this approval gates. */
  toolExecutionId: string;
  userId: string;
  toolName: string;
  riskLevel: string;
  slaMinutes?: number;
}

/**
 * Durable approvals for standalone tool executions. Unlike the retired
 * in-memory promise map, a pending approval is a persisted row — the HTTP call
 * that triggered it returns immediately (PENDING_APPROVAL) and the run resumes
 * later via an event, so approvals survive restarts and never block a request.
 *
 * It shares the `approvals` table with workflow approvals but is isolated by
 * `subjectType = TOOL_EXECUTION`, and supports SLA escalation, expiration,
 * delegation, and a full decision audit trail.
 */
@Injectable()
export class ToolApprovalService {
  private readonly logger = new Logger(ToolApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventDispatcherService,
  ) {}

  async request(input: ToolApprovalRequestInput): Promise<{ id: string }> {
    const sla = input.slaMinutes ?? DEFAULT_SLA_MINUTES;
    const approval = await this.prisma.approval.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        subjectType: "TOOL_EXECUTION",
        toolExecutionId: input.toolExecutionId,
        stepId: input.toolName,
        type: "PRE_EXECUTION",
        payload: {
          toolName: input.toolName,
          riskLevel: input.riskLevel,
          requestedBy: input.userId,
        },
        slaMinutes: sla,
        expiresAt: new Date(Date.now() + sla * 60_000),
      },
    });
    this.events.emit("tool.approval.requested", {
      executionId: input.toolExecutionId,
      organizationId: input.organizationId,
      toolName: input.toolName,
      userId: input.userId,
      approvalId: approval.id,
    });
    this.logger.log(
      `Tool approval ${approval.id} requested for execution ${input.toolExecutionId}`,
    );
    return { id: approval.id };
  }

  /** Pending tool executions awaiting approval (as history rows for the UI). */
  async listPendingExecutions(organizationId: string): Promise<unknown[]> {
    await this.escalateOverdue(organizationId);
    const approvals = await this.prisma.approval.findMany({
      where: {
        organizationId,
        subjectType: "TOOL_EXECUTION",
        status: { in: ["PENDING", "ESCALATED"] },
      },
    });
    const ids = approvals
      .map((approval) => approval.toolExecutionId)
      .filter((id): id is string => id !== null);
    if (ids.length === 0) return [];
    return this.prisma.toolExecutionHistory.findMany({
      where: { organizationId, id: { in: ids } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Decide a pending tool approval by its execution id. APPROVE marks the run
   * RUNNING and emits a resume event; REJECT finalizes it as REJECTED.
   */
  async decide(
    toolExecutionId: string,
    organizationId: string,
    userId: string,
    action: "APPROVE" | "REJECT",
    reason?: string,
  ): Promise<void> {
    const approval = await this.prisma.approval.findFirst({
      where: {
        toolExecutionId,
        organizationId,
        subjectType: "TOOL_EXECUTION",
        status: { in: ["PENDING", "ESCALATED"] },
      },
    });
    if (!approval) {
      throw new NotFoundException(`No pending approval for tool execution ${toolExecutionId}`);
    }

    const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
    await this.prisma.approval.update({
      where: { id: approval.id },
      data: { status, decidedAt: new Date(), decidedBy: userId, reason },
    });

    if (action === "APPROVE") {
      await this.prisma.toolExecutionHistory.updateMany({
        where: { id: toolExecutionId },
        data: { status: "RUNNING" },
      });
      const payload = (approval.payload ?? {}) as { toolName?: string };
      this.events.emit("tool.approval.resumed", {
        organizationId,
        executionId: toolExecutionId,
        toolName: payload.toolName ?? "",
      });
      this.logger.log(`Tool approval for ${toolExecutionId} approved — resume dispatched`);
    } else {
      await this.prisma.toolExecutionHistory.updateMany({
        where: { id: toolExecutionId },
        data: { status: "REJECTED", error: reason ?? "Rejected by approver" },
      });
    }
  }

  private async escalateOverdue(organizationId: string): Promise<void> {
    try {
      const pending = await this.prisma.approval.findMany({
        where: { organizationId, subjectType: "TOOL_EXECUTION", status: "PENDING" },
      });
      const now = Date.now();
      for (const approval of pending) {
        const deadline = approval.requestedAt.getTime() + approval.slaMinutes * 60_000;
        if (now > deadline) {
          await this.prisma.approval.update({
            where: { id: approval.id },
            data: { status: "ESCALATED", escalatedAt: new Date() },
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Tool approval SLA sweep failed: ${(err as Error).message}`);
    }
  }
}
