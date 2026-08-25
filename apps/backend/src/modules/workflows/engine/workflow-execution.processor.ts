import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { WorkflowLifecycleService } from "./workflow-lifecycle.service";
import {
  ExecutionJobData,
  ScheduledJobData,
  WORKFLOW_EXECUTIONS_QUEUE,
  WorkflowJobData,
} from "./queue.constants";
import { WorkflowExecutorService } from "./workflow-executor.service";

/**
 * BullMQ worker that drives executions off the main request path. Jobs:
 *   - "run"       : start / continue an execution to completion or pause
 *   - "resume"    : continue a checkpointed run (after approval or operator resume)
 *   - "scheduled" : materialize an execution for a scheduled workflow, then run it
 *
 * Concurrency is bounded so a burst of workflows queues rather than
 * overwhelming the API, Qwen quota, or the database (backpressure).
 */
@Processor(WORKFLOW_EXECUTIONS_QUEUE, { concurrency: 5 })
export class WorkflowExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowExecutionProcessor.name);

  constructor(
    private readonly executor: WorkflowExecutorService,
    private readonly lifecycle: WorkflowLifecycleService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<WorkflowJobData>): Promise<void> {
    if (job.name === "scheduled") {
      await this.handleScheduled(job.data as ScheduledJobData);
      return;
    }

    const data = job.data as ExecutionJobData;
    this.logger.log(`Processing ${job.name} job for execution ${data.executionId}`);
    await this.executor.runExecution(data.executionId, {
      approvedStepId: data.approvedStepId,
      resume: data.resume,
    });
  }

  private async handleScheduled(data: ScheduledJobData): Promise<void> {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: data.workflowId,
        organizationId: data.organizationId,
        deletedAt: null,
        status: "ACTIVE",
      },
    });
    if (!workflow) {
      this.logger.warn(`Scheduled workflow ${data.workflowId} not found or inactive; skipping`);
      return;
    }
    const { executionId } = await this.lifecycle.start({
      organizationId: data.organizationId,
      triggerType: "SCHEDULED",
      userId: workflow.createdBy,
      workflowId: workflow.id,
    });
    this.logger.log(`Scheduled workflow ${workflow.id} materialized as execution ${executionId}`);
  }
}
