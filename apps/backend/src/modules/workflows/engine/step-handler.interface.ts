import type { WorkflowStep } from "./workflow-definition.schema";

/**
 * Contract every node type implements. The orchestrator core contains zero
 * workflow-type-specific logic — adding a node type means adding a handler
 * and registering it in the module; the engine, planner schema, and console
 * builder pick it up without core changes.
 */

export interface StepExecutionContext {
  executionId: string;
  organizationId: string;
  userId: string;
  /** live variable bag (outputs of prior steps keyed by step id + input) */
  variables: Record<string, any>;
  /** sub-workflow nesting depth (root = 0) */
  depth: number;
  /** loop iteration for this step (1 for first pass) */
  iteration: number;
}

export interface StepPauseSignal {
  reason: "APPROVAL";
  approvalId: string;
}

export interface StepResult {
  output: Record<string, unknown>;
  /** CONDITION handlers return the selected branch label ("true" | "false" | custom). */
  branchLabel?: string;
  /** Suspend the run (checkpointed); a resume job continues it later. */
  pause?: StepPauseSignal;
  /** Usage accounting for observability rollups. */
  tokensUsed?: number;
  costMicroUsd?: number;
  toolCalls?: number;
}

export interface StepHandler {
  /** WorkflowStep.type this handler executes. */
  readonly type: string;
  execute(step: WorkflowStep, context: StepExecutionContext): Promise<StepResult>;
}

/** Multi-provider token: the registry collects every bound handler. */
export const STEP_HANDLERS = "WORKFLOW_STEP_HANDLERS";
