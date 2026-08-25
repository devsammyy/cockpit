/**
 * API entity types mirroring the backend Prisma models and controller
 * response shapes. Every field here exists on the real API — no invented
 * data. Envelope: most endpoints return { success, data }.
 */

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
}

// ── Auth / Users / Organizations ──

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  activeOrgId: string;
  role: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  createdAt: string;
  memberships?: OrgMembership[];
}

export interface OrgMembership {
  id: string;
  status: string;
  organization: OrganizationSummary;
  role?: { id: string; name: string };
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
}

export interface OrganizationMember {
  id: string;
  status: string;
  createdAt?: string;
  user: { id: string; email: string; displayName: string };
  role?: { id: string; name: string };
}

// ── Workflows & Executions ──

export interface WorkflowStep {
  id: string;
  type: string; // START | AGENT_TASK | TOOL_CALL | CONDITION | APPROVAL | DELAY | WEBHOOK | MEMORY | END
  name: string;
  config: Record<string, unknown>;
}

export interface WorkflowConnection {
  fromStepId: string;
  toStepId: string;
  label?: string;
}

export interface WorkflowDefinition {
  steps: WorkflowStep[];
  connections: WorkflowConnection[];
}

export interface Workflow {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  slug: string;
  definition: WorkflowDefinition;
  triggerType: string;
  status: string;
  tags: string[];
  category?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type ExecutionStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface Execution {
  id: string;
  organizationId: string;
  workflowId: string;
  workflowVersionId: string;
  /** usually an ExecutionStatus, but the API does not constrain it */
  status: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  variables: Record<string, unknown>;
  currentStepId?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  errorStepId?: string | null;
  totalTokensUsed: number;
  totalToolCalls: number;
  totalDurationMs: number;
  totalCostEstimate: number;
  triggerType: string;
  attemptNumber: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanAndExecuteResponse {
  success: boolean;
  executionId: string;
  workflowId: string;
  status: string;
  plannedGraph: WorkflowDefinition;
}

export interface WorkflowEstimates {
  approvalRequired: boolean;
  estimatedCostMicroUsd: number;
  estimatedDurationMs: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  risks: string[];
}

export interface PlanResult {
  definition: WorkflowDefinition;
  estimates: WorkflowEstimates;
  issues: string[];
}

export interface StepExecution {
  id: string;
  executionId: string;
  stepId: string;
  stepType: string;
  status: string;
  output?: unknown;
  errorMessage?: string | null;
  durationMs?: number | null;
  sequenceNumber: number;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface ExecutionEvent {
  id: string;
  executionId: string;
  type: string;
  message: string;
  data?: Record<string, unknown> | null;
  createdAt: string;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  versionNumber: number;
  changelog: string;
  publishedAt: string;
}

export interface WorkflowApproval {
  id: string;
  executionId: string;
  stepId: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  reason?: string | null;
  requestedAt: string;
  slaMinutes: number;
  escalatedAt?: string | null;
}

// ── AI Provider ──

export interface ModelMetadata {
  provider: string;
  modelId: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsVision: boolean;
  supportsStructured: boolean;
  supportsEmbeddings: boolean;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  status: string;
}

export interface TokenQuota {
  id: string;
  organizationId: string;
  dailyLimit: number;
  monthlyLimit: number;
  dailyUsed: number;
  monthlyUsed: number;
  lastResetAt: string;
}

export interface SandboxResult {
  output: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  durationMs?: number;
  modelId?: string;
}

// ── Tools ──

export interface ToolCatalogItem {
  name: string;
  description: string;
  timeoutMs?: number;
  retryAttempts?: number;
}

export interface ToolExecutionRecord {
  id: string;
  organizationId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  output?: unknown;
  status: string; // PENDING | PENDING_APPROVAL | RUNNING | COMPLETED | FAILED | REJECTED
  error?: string | null;
  latencyMs?: number | null;
  runBy: string;
  createdAt: string;
}

// ── Memory ──

export interface KnowledgeItem {
  id: string;
  organizationId: string;
  title: string;
  content: string;
  tags: string[];
  source?: string | null;
  createdAt: string;
}

export interface SemanticSearchResult {
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface ReflectionRecord {
  id: string;
  organizationId: string;
  executionId: string;
  succeeded: boolean;
  toolsUsed: string[];
  feedback?: string | null;
  reflectionText: string;
  createdAt: string;
}

export interface MemoryExploreSummary {
  totalMemories: number;
  categories: { category: string; count: number }[];
}

// ── Health ──

export interface HealthResponse {
  dependencies: { postgres: "ok" | "error"; redis: "ok" | "error" };
  service: string;
  status: "ok" | "error";
  timestamp: string;
  uptimeSeconds: number;
  version: string;
}
