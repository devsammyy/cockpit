import type { ToolDescriptor } from "./tool-descriptor";
import type { ToolExecutionRequest } from "./tool-execution-context";

/**
 * A stage's verdict. Stages are pure decision units: they either let the run
 * proceed, deny it with a machine-readable code, or pause it on a durable
 * approval. The executor turns `deny`/`pause` into the appropriate result or
 * exception — no stage throws for control flow.
 */
export type StageDecision =
  | { kind: "continue" }
  | { kind: "deny"; code: StageDenyCode; reason: string }
  | { kind: "pause"; approvalId: string; reason: string };

/** Machine-readable denial reasons, mapped to HTTP statuses by the executor. */
export type StageDenyCode =
  | "PERMISSION_DENIED"
  | "INPUT_VALIDATION_FAILED"
  | "OUTPUT_VALIDATION_FAILED"
  | "POLICY_VIOLATION"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "CONCURRENCY_LIMITED"
  | "OUTSIDE_BUSINESS_HOURS"
  | "RISK_CEILING_EXCEEDED"
  | "APPROVAL_REJECTED"
  | "TOOL_NOT_FOUND"
  | "CANCELLED";

export const CONTINUE: StageDecision = { kind: "continue" };

/**
 * Mutable state passed down the stage chain. Earlier stages annotate it
 * (validated input, policy verdict, output) for later stages and for the
 * audit/metrics/event tail. Kept as one object so the pipeline stays a simple,
 * ordered list of independently testable stages.
 */
export interface ToolPipelineState {
  readonly request: ToolExecutionRequest;
  readonly descriptor: ToolDescriptor;
  /** Monotonic start time (epoch ms) for latency accounting. */
  readonly startedAt: number;
  /** Number of invocation attempts made (set by the invoke stage). */
  attempts: number;
  /** Input after schema validation/coercion (set by the input stage). */
  validatedInput: Record<string, unknown> | null;
  /** Raw tool output (set by the invoke stage; checked by the output stage). */
  output: unknown;
  /** Whether the invocation ran inside the sandbox boundary. */
  sandboxed: boolean;
  /** Stage-scoped scratch space, keyed by stage name. */
  readonly annotations: Record<string, unknown>;
}

/**
 * One step of the execution pipeline. Implementations are stateless NestJS
 * providers; all run-specific state lives in {@link ToolPipelineState}, so the
 * engine contains zero tool- or connector-specific logic.
 */
export interface ToolPipelineStage {
  /** Stable identifier, e.g. "permission", "policy", "invoke". */
  readonly name: string;
  run(state: ToolPipelineState): Promise<StageDecision>;
}
