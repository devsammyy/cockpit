import type { ZodType } from "zod";

/** Ordered from least to most dangerous; see {@link riskLevelRank}. */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** When in the tool lifecycle a human approval gate applies. */
export type ApprovalType = "PRE_EXECUTION" | "DURING_EXECUTION" | "POST_EXECUTION";

/** Bounded exponential-backoff retry policy for a single tool invocation. */
export interface ToolRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  backoffFactor: number;
}

/**
 * The declarative contract every tool exposes. The original four fields
 * (name/description/inputSchema/outputSchema) plus the legacy timeout/retry
 * hints are unchanged; the remaining fields are OPTIONAL governance and
 * discovery metadata so existing tools keep compiling. {@link describeTool}
 * normalizes this into a fully-populated {@link ToolDescriptor} with defaults.
 */
export interface ToolMetadata {
  name: string;
  description: string;
  inputSchema: ZodType<any>;
  outputSchema?: ZodType<any>;
  permissions?: string[];
  timeoutMs?: number;
  retryAttempts?: number;

  // ── Extended governance & discovery metadata (all optional) ──
  /** Grouping for catalog/discovery, e.g. "communication", "vcs", "finance". */
  category?: string;
  /** Semantic version of the tool's contract, e.g. "1.0.0". */
  version?: string;
  /** Owning team or individual, for accountability. */
  owner?: string;
  /** Default risk classification; policies can raise the effective gate. */
  riskLevel?: RiskLevel;
  /** Whether repeating the call with the same input is side-effect-free. */
  idempotent?: boolean;
  /** Force a human approval gate regardless of policy. */
  requiresApproval?: boolean;
  /** Lifecycle position of the approval gate. */
  approvalType?: ApprovalType;
  /** Structured retry policy; supersedes the legacy `retryAttempts` hint. */
  retryPolicy?: ToolRetryPolicy;
  /** AI providers this tool is compatible with; empty ⇒ provider-agnostic. */
  supportedProviders?: string[];
  /** Long-form docs / usage notes surfaced in the catalog. */
  documentation?: string;
  /** Free-form discovery tags. */
  tags?: string[];
}

export abstract class Tool {
  abstract readonly metadata: ToolMetadata;

  /**
   * Execute the underlying tool logic. Input is validated by the registry
   * before this runs; `context` is a {@link import("./framework/tool-execution-context").ToolExecutionContext}
   * at runtime (typed loosely here to preserve the existing tool contract).
   */
  abstract execute(input: any, context?: any): Promise<any>;
}
