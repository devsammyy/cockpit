/** Who initiated a tool run — drives audit attribution and policy checks. */
export type ToolActorType = "USER" | "AGENT" | "SYSTEM";

/** Where a tool run originated — direct API call, workflow step, agent turn, schedule. */
export type ToolExecutionSource = "DIRECT" | "WORKFLOW" | "AGENT" | "SCHEDULED";

/** Structured, secret-redacting logger handed to tool handlers. */
export type ToolLogLevel = "debug" | "info" | "warn" | "error";

/**
 * The runtime context threaded through every stage of the execution pipeline
 * and into the tool/connector `execute` method.
 *
 * It is deliberately provider-independent and carries no tool-specific logic.
 * Secret access is *mediated* via {@link getSecret} so handlers never read raw
 * credentials from the store directly — this keeps secret resolution auditable
 * and lets the sandbox enforce which keys a tool may read.
 */
export interface ToolExecutionContext {
  /** Unique id of THIS tool run (the `ToolExecutionHistory` row id). */
  readonly executionId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly actorType: ToolActorType;
  readonly source: ToolExecutionSource;

  /** Correlates the run to a broader unit of work (e.g. a workflow execution). */
  readonly correlationId?: string;
  readonly workflowExecutionId?: string;
  readonly stepExecutionId?: string;

  /** Aborts in-flight work when the run is cancelled or times out. */
  readonly signal: AbortSignal;
  /** Absolute epoch-ms deadline after which the run must stop. */
  readonly deadline: number;

  /** Arbitrary caller-supplied context (never contains secrets). */
  readonly metadata: Record<string, unknown>;

  /**
   * Resolve a credential by its logical key for THIS organization/user,
   * honoring environment overrides and scope precedence. Returns null when
   * absent. Never logs the value.
   */
  getSecret(key: string): Promise<string | null>;

  /** Emit a structured, secret-redacting log line scoped to this run. */
  log(level: ToolLogLevel, message: string, data?: Record<string, unknown>): void;
}

/** The immutable description of what to run, before the pipeline processes it. */
export interface ToolExecutionRequest {
  toolName: string;
  args: Record<string, unknown>;
  context: ToolExecutionContext;
}

/** The terminal outcome of a full pipeline run. */
export interface ToolExecutionResult {
  executionId: string;
  toolName: string;
  /** COMPLETED | FAILED | REJECTED | PENDING_APPROVAL | CANCELLED */
  status: string;
  success: boolean;
  output?: unknown;
  error?: string;
  /** Present when the run paused on a human approval gate. */
  approvalId?: string;
  latencyMs: number;
  attempts: number;
}
