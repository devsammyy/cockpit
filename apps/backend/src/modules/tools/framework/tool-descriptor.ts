import type { ZodType } from "zod";

import type { ApprovalType, RiskLevel, ToolMetadata, ToolRetryPolicy } from "../tool.interface";

/**
 * Framework-wide defaults. Kept here (not scattered as magic numbers) so the
 * whole execution pipeline agrees on the same fallbacks.
 */
export const DEFAULT_TOOL_TIMEOUT_MS = 120_000;
export const DEFAULT_TOOL_CATEGORY = "general";
export const DEFAULT_TOOL_VERSION = "1.0.0";
export const DEFAULT_RISK_LEVEL: RiskLevel = "LOW";
export const DEFAULT_APPROVAL_TYPE: ApprovalType = "PRE_EXECUTION";

export const DEFAULT_RETRY_POLICY: ToolRetryPolicy = {
  maxAttempts: 1,
  initialDelayMs: 500,
  backoffFactor: 2,
};

/** Ascending danger order used for risk-ceiling comparisons in policies. */
const RISK_ORDER: readonly RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** Numeric rank (0..3) of a risk level; higher is more dangerous. */
export function riskLevelRank(level: RiskLevel): number {
  const rank = RISK_ORDER.indexOf(level);
  return rank === -1 ? 0 : rank;
}

/** True when `level` is strictly more dangerous than `ceiling`. */
export function exceedsRisk(level: RiskLevel, ceiling: RiskLevel): boolean {
  return riskLevelRank(level) > riskLevelRank(ceiling);
}

/**
 * A fully-resolved, defaulted view of a tool's contract. Every field is
 * populated (no optionals) so downstream stages never re-apply defaults.
 * This is the single normalized shape the registry, manager, executor,
 * catalog, and audit pipeline all consume.
 */
export interface ToolDescriptor {
  name: string;
  description: string;
  category: string;
  version: string;
  owner: string | null;
  permissions: string[];
  inputSchema: ZodType<any>;
  outputSchema: ZodType<any> | null;
  timeoutMs: number;
  retryPolicy: ToolRetryPolicy;
  idempotent: boolean;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  approvalType: ApprovalType;
  supportedProviders: string[];
  documentation: string | null;
  tags: string[];
}

/**
 * Normalize a tool's declared {@link ToolMetadata} into a fully-defaulted
 * {@link ToolDescriptor}. The legacy `retryAttempts` hint is honored when no
 * structured `retryPolicy` is supplied, preserving existing tool behavior.
 */
export function describeTool(metadata: ToolMetadata): ToolDescriptor {
  const retryPolicy =
    metadata.retryPolicy ??
    (metadata.retryAttempts !== undefined
      ? { ...DEFAULT_RETRY_POLICY, maxAttempts: Math.max(1, metadata.retryAttempts) }
      : DEFAULT_RETRY_POLICY);

  return {
    name: metadata.name,
    description: metadata.description,
    category: metadata.category ?? DEFAULT_TOOL_CATEGORY,
    version: metadata.version ?? DEFAULT_TOOL_VERSION,
    owner: metadata.owner ?? null,
    permissions: metadata.permissions ?? [],
    inputSchema: metadata.inputSchema,
    outputSchema: metadata.outputSchema ?? null,
    timeoutMs: metadata.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    retryPolicy,
    idempotent: metadata.idempotent ?? false,
    riskLevel: metadata.riskLevel ?? DEFAULT_RISK_LEVEL,
    requiresApproval: metadata.requiresApproval ?? false,
    approvalType: metadata.approvalType ?? DEFAULT_APPROVAL_TYPE,
    supportedProviders: metadata.supportedProviders ?? [],
    documentation: metadata.documentation ?? null,
    tags: metadata.tags ?? [],
  };
}
