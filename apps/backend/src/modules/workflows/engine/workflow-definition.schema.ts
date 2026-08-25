import { z } from "zod";

/**
 * Declarative workflow definition consumed by the execution orchestrator.
 *
 * Backwards compatible with phase-2 definitions (steps + connections with
 * START / AGENT_TASK / TOOL_CALL / CONDITION / END); this version adds
 * first-class node types (APPROVAL, DELAY, WEBHOOK, MEMORY, SUB_WORKFLOW),
 * per-step reliability policies (retry, timeout, failure strategy,
 * compensation), loop edges, and planner-produced estimates.
 */

export const STEP_TYPES = [
  "START",
  "AGENT_TASK",
  "TOOL_CALL",
  "CONDITION",
  "APPROVAL",
  "DELAY",
  "WEBHOOK",
  "MEMORY",
  "SUB_WORKFLOW",
  "END",
] as const;

export type StepType = (typeof STEP_TYPES)[number];

/** Edge label that creates an intentional cycle (bounded by loop.maxIterations). */
export const LOOP_EDGE_LABEL = "loop";

export const RetryPolicySchema = z.object({
  backoffFactor: z.number().min(1).max(10).default(2),
  initialDelayMs: z.number().int().min(0).max(60_000).default(500),
  maxAttempts: z.number().int().min(1).max(10).default(1),
});

export const CompensationSchema = z.object({
  arguments: z.record(z.string(), z.any()).default({}),
  toolName: z.string(),
});

export const WorkflowStepSchema = z.object({
  config: z.record(z.string(), z.any()),
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string(),
  // ── Reliability policies (all optional, engine-agnostic) ──
  /** Compensating action executed in reverse order when the run fails. */
  compensation: CompensationSchema.optional(),
  /** Bounded re-entry for loop edges targeting this step. */
  loop: z.object({ maxIterations: z.number().int().min(1).max(100).default(10) }).optional(),
  /** "fail" (default) aborts the run; "continue" records the error and proceeds. */
  onFailure: z.enum(["fail", "continue"]).optional(),
  retry: RetryPolicySchema.optional(),
  timeoutMs: z.number().int().min(100).max(600_000).optional(),
});

export const WorkflowConnectionSchema = z.object({
  fromStepId: z.string(),
  label: z.string().optional(),
  toStepId: z.string(),
});

export const WorkflowEstimatesSchema = z.object({
  approvalRequired: z.boolean().default(false),
  estimatedCostMicroUsd: z.number().int().min(0).default(0),
  estimatedDurationMs: z.number().int().min(0).default(0),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW"),
  risks: z.array(z.string()).default([]),
});

export const WorkflowDefinitionSchema = z.object({
  connections: z.array(WorkflowConnectionSchema),
  /** Planner-produced estimates; informational, not used for control flow. */
  metadata: WorkflowEstimatesSchema.optional(),
  steps: z.array(WorkflowStepSchema),
});

export type RetryPolicy = z.infer<typeof RetryPolicySchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowConnection = z.infer<typeof WorkflowConnectionSchema>;
export type WorkflowEstimates = z.infer<typeof WorkflowEstimatesSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  backoffFactor: 2,
  initialDelayMs: 500,
  maxAttempts: 1,
};

export const DEFAULT_STEP_TIMEOUT_MS = 120_000;
export const DEFAULT_LOOP_MAX_ITERATIONS = 10;
