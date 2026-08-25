/** BullMQ queue carrying workflow execution jobs (run / resume / scheduled). */
export const WORKFLOW_EXECUTIONS_QUEUE = "workflow-executions";

export interface ExecutionJobData {
  executionId: string;
  /** resume from checkpoint instead of starting fresh */
  resume?: boolean;
  /** approval step that unblocked this resume */
  approvedStepId?: string;
}

export interface ScheduledJobData {
  workflowId: string;
  organizationId: string;
  scheduled: true;
}

export type WorkflowJobData = ExecutionJobData | ScheduledJobData;
