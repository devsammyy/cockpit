import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Queue } from "bullmq";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { ExecutionEventsService } from "./execution-events.service";
import { assertTransition, TERMINAL_STATUSES } from "./execution-state";
import { WORKFLOW_EXECUTIONS_QUEUE } from "./queue.constants";
import { WorkflowDefinition } from "./workflow-definition.schema";

/**
 * Public control surface for executions: start, and the human-in-the-loop
 * controls (pause / resume / cancel / retry). Actual DAG driving happens in
 * the queue processor via WorkflowExecutorService; this service only manages
 * state transitions and enqueues jobs, so controls work identically whether
 * an execution is mid-flight on a worker or checkpointed.
 */
@Injectable()
export class WorkflowLifecycleService {
  private readonly logger = new Logger(WorkflowLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ExecutionEventsService,
    @InjectQueue(WORKFLOW_EXECUTIONS_QUEUE) private readonly queue: Queue,
  ) {}

  /** Create a PENDING execution for a stored workflow and enqueue it. */
  async start(input: {
    workflowId: string;
    organizationId: string;
    userId: string;
    input?: Record<string, unknown>;
    triggerType?: string;
  }): Promise<{ executionId: string }> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: input.workflowId, organizationId: input.organizationId, deletedAt: null },
    });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${input.workflowId} not found`);
    }

    // Snapshot the definition into a version so the run is reproducible even if
    // the workflow is later edited.
    const versionId =
      workflow.currentVersionId ??
      (await this.snapshotVersion(
        workflow.id,
        workflow.definition as unknown as WorkflowDefinition,
        input.userId,
      ));

    const executionId = crypto.randomUUID();
    const seedInput = input.input ?? {};
    await this.prisma.execution.create({
      data: {
        id: executionId,
        input: seedInput as any,
        organizationId: input.organizationId,
        status: "PENDING",
        triggeredBy: input.userId,
        triggerType: input.triggerType ?? "MANUAL",
        // Namespace the run inputs under `input` so templates resolve
        // {{ input.field }}; the flat spread stays for {{ field }} compatibility.
        variables: { input: seedInput, ...seedInput } as any,
        workflowId: workflow.id,
        workflowVersionId: versionId,
      },
    });

    await this.queue.add("run", { executionId });
    this.logger.log(`Execution ${executionId} queued for workflow ${workflow.id}`);
    return { executionId };
  }

  /** Pause a running execution at the next checkpoint boundary. */
  async pause(executionId: string, organizationId: string): Promise<void> {
    const execution = await this.requireExecution(executionId, organizationId);
    if (execution.status !== "RUNNING" && execution.status !== "PENDING") {
      throw new BadRequestException(`Cannot pause an execution in status ${execution.status}`);
    }
    assertTransition(execution.status, "PAUSED");
    await this.prisma.execution.updateMany({
      data: { status: "PAUSED" },
      where: { id: executionId, status: execution.status },
    });
    await this.events.record(
      executionId,
      organizationId,
      "EXECUTION_PAUSED",
      "Execution paused by operator",
    );
  }

  /** Resume a paused execution (re-enqueues from its checkpoint). */
  async resume(executionId: string, organizationId: string): Promise<void> {
    const execution = await this.requireExecution(executionId, organizationId);
    if (execution.status !== "PAUSED") {
      throw new BadRequestException(`Cannot resume an execution in status ${execution.status}`);
    }
    assertTransition("PAUSED", "RUNNING");
    await this.prisma.execution.updateMany({
      data: { status: "RUNNING" },
      where: { id: executionId, status: "PAUSED" },
    });
    await this.events.record(
      executionId,
      organizationId,
      "EXECUTION_RESUMED",
      "Execution resumed by operator",
    );
    await this.queue.add("resume", { executionId, resume: true });
  }

  /** Cancel an execution (terminal). */
  async cancel(executionId: string, organizationId: string): Promise<void> {
    const execution = await this.requireExecution(executionId, organizationId);
    if (TERMINAL_STATUSES.has(execution.status)) {
      throw new BadRequestException(`Execution already ${execution.status}`);
    }
    await this.prisma.execution.updateMany({
      data: { failedAt: new Date(), status: "CANCELLED" },
      where: { id: executionId, status: { notIn: ["COMPLETED", "FAILED", "CANCELLED"] } },
    });
    // Also void any pending approvals.
    await this.prisma.approval.updateMany({
      data: { status: "EXPIRED" },
      where: { executionId, status: { in: ["PENDING", "ESCALATED"] } },
    });
    await this.events.record(
      executionId,
      organizationId,
      "EXECUTION_CANCELLED",
      "Execution cancelled by operator",
    );
  }

  /**
   * Retry a failed execution from the start with a fresh run. Preserves the
   * original input; increments the attempt counter for observability.
   */
  async retry(executionId: string, organizationId: string): Promise<{ executionId: string }> {
    const execution = await this.requireExecution(executionId, organizationId);
    if (execution.status !== "FAILED") {
      throw new BadRequestException(
        `Only failed executions can be retried (status ${execution.status})`,
      );
    }

    const retryId = crypto.randomUUID();
    const retryInput = (execution.input ?? {}) as Record<string, unknown>;
    await this.prisma.execution.create({
      data: {
        attemptNumber: execution.attemptNumber + 1,
        id: retryId,
        input: retryInput as any,
        maxAttempts: execution.maxAttempts,
        organizationId,
        parentExecutionId: execution.id,
        status: "PENDING",
        triggeredBy: execution.triggeredBy,
        triggerType: "RETRY",
        variables: { input: retryInput, ...retryInput } as any,
        workflowId: execution.workflowId,
        workflowVersionId: execution.workflowVersionId,
      },
    });
    await this.queue.add("run", { executionId: retryId });
    this.logger.log(`Retry ${retryId} queued for failed execution ${executionId}`);
    return { executionId: retryId };
  }

  private async snapshotVersion(
    workflowId: string,
    definition: WorkflowDefinition,
    userId: string,
  ): Promise<string> {
    const versionId = crypto.randomUUID();
    const count = await this.prisma.workflowVersion.count({ where: { workflowId } });
    await this.prisma.workflowVersion.create({
      data: {
        changelog: "auto-snapshot at execution start",
        definition: definition as any,
        id: versionId,
        publishedBy: userId,
        triggerConfig: {},
        versionNumber: count + 1,
        workflowId,
      },
    });
    return versionId;
  }

  private async requireExecution(executionId: string, organizationId: string) {
    const execution = await this.prisma.execution.findFirst({
      where: { id: executionId, organizationId },
    });
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }
    return execution;
  }
}
