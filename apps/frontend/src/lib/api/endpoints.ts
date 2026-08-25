import { apiClient } from "./client";
import type {
  ApiEnvelope,
  Execution,
  ExecutionEvent,
  HealthResponse,
  KnowledgeItem,
  MemoryExploreSummary,
  ModelMetadata,
  OrganizationMember,
  PlanAndExecuteResponse,
  PlanResult,
  ReflectionRecord,
  SandboxResult,
  SemanticSearchResult,
  SessionUser,
  StepExecution,
  TokenQuota,
  ToolCatalogItem,
  ToolExecutionRecord,
  UserProfile,
  Workflow,
  WorkflowApproval,
  WorkflowDefinition,
  WorkflowVersion,
} from "./types";

function unwrap<T>(payload: ApiEnvelope<T>): T {
  return payload.data;
}

// ── Auth ──

export interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}

export const authApi = {
  // The API names the credential field `passwordHash` (hashed server-side).
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const res = await apiClient.post<ApiEnvelope<LoginResponse>>("/auth/login", {
      email,
      passwordHash: password,
    });
    return unwrap(res.data);
  },
  register: async (input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<LoginResponse> => {
    const res = await apiClient.post<ApiEnvelope<LoginResponse>>("/auth/register", {
      displayName: input.displayName,
      email: input.email,
      passwordHash: input.password,
    });
    return unwrap(res.data);
  },
};

// ── Users / Organizations ──

export const usersApi = {
  me: async (): Promise<UserProfile> => {
    const res = await apiClient.get<ApiEnvelope<UserProfile>>("/users/me");
    return unwrap(res.data);
  },
  updateMe: async (input: { displayName?: string }): Promise<UserProfile> => {
    const res = await apiClient.patch<ApiEnvelope<UserProfile>>("/users/me", input);
    return unwrap(res.data);
  },
};

export const organizationsApi = {
  members: async (): Promise<OrganizationMember[]> => {
    const res = await apiClient.get<ApiEnvelope<OrganizationMember[]>>("/organizations/members");
    return unwrap(res.data);
  },
  invite: async (input: { email: string; roleName?: string }): Promise<unknown> => {
    const res = await apiClient.post<ApiEnvelope<unknown>>("/organizations/invite", input);
    return unwrap(res.data);
  },
  switch: async (orgId: string): Promise<{ accessToken: string }> => {
    const res = await apiClient.post<ApiEnvelope<{ accessToken: string }>>(
      "/organizations/switch",
      { orgId },
    );
    return unwrap(res.data);
  },
  updateSettings: async (input: { name?: string }): Promise<unknown> => {
    const res = await apiClient.patch<ApiEnvelope<unknown>>("/organizations/settings", input);
    return unwrap(res.data);
  },
};

// ── Workflows & Executions ──

export const workflowsApi = {
  templates: async (): Promise<Workflow[]> => {
    const res = await apiClient.get<ApiEnvelope<Workflow[]>>("/workflows/templates");
    return unwrap(res.data);
  },
  get: async (id: string): Promise<Workflow> => {
    const res = await apiClient.get<ApiEnvelope<Workflow>>(`/workflows/${id}`);
    return unwrap(res.data);
  },
  create: async (input: {
    name: string;
    description?: string;
    definition: WorkflowDefinition;
    triggerType?: string;
    triggerConfig?: Record<string, unknown>;
    tags?: string[];
    category?: string;
  }): Promise<Workflow> => {
    const res = await apiClient.post<ApiEnvelope<Workflow>>("/workflows", input);
    return unwrap(res.data);
  },
  update: async (
    id: string,
    input: {
      name?: string;
      description?: string;
      definition?: WorkflowDefinition;
      status?: string;
      changelog?: string;
    },
  ): Promise<Workflow> => {
    const res = await apiClient.patch<ApiEnvelope<Workflow>>(`/workflows/${id}`, input);
    return unwrap(res.data);
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/workflows/${id}`);
  },
  versions: async (id: string): Promise<WorkflowVersion[]> => {
    const res = await apiClient.get<ApiEnvelope<WorkflowVersion[]>>(`/workflows/${id}/versions`);
    return unwrap(res.data);
  },
  rollback: async (id: string, versionNumber: number): Promise<Workflow> => {
    const res = await apiClient.post<ApiEnvelope<Workflow>>(`/workflows/${id}/rollback`, {
      versionNumber,
    });
    return unwrap(res.data);
  },
  seedTemplates: async (): Promise<{ count: number }> => {
    const res = await apiClient.post<{ success: boolean; count: number }>(
      "/workflows/templates/seed",
    );
    return { count: res.data.count };
  },
  plan: async (goal: string, execute = false): Promise<PlanResult | PlanAndExecuteResponse> => {
    const res = await apiClient.post<ApiEnvelope<PlanResult | PlanAndExecuteResponse>>(
      "/workflows/plan",
      { execute, goal },
    );
    return unwrap(res.data);
  },
  planAndExecute: async (goal: string): Promise<PlanAndExecuteResponse> => {
    const res = await apiClient.post<PlanAndExecuteResponse>("/workflows/plan-and-execute", {
      goal,
    });
    return res.data;
  },
  start: async (
    workflowId: string,
    input?: Record<string, unknown>,
  ): Promise<{ executionId: string }> => {
    const res = await apiClient.post<ApiEnvelope<{ executionId: string; status: string }>>(
      `/workflows/${workflowId}/execute`,
      { input },
    );
    return { executionId: unwrap(res.data).executionId };
  },
  executions: async (): Promise<Execution[]> => {
    const res = await apiClient.get<ApiEnvelope<Execution[]>>("/workflows/executions/list");
    return unwrap(res.data);
  },
  execution: async (id: string): Promise<Execution> => {
    const res = await apiClient.get<ApiEnvelope<Execution>>(`/workflows/executions/${id}`);
    return unwrap(res.data);
  },
  steps: async (id: string): Promise<StepExecution[]> => {
    const res = await apiClient.get<ApiEnvelope<StepExecution[]>>(
      `/workflows/executions/${id}/steps`,
    );
    return unwrap(res.data);
  },
  events: async (id: string): Promise<ExecutionEvent[]> => {
    const res = await apiClient.get<ApiEnvelope<ExecutionEvent[]>>(
      `/workflows/executions/${id}/events`,
    );
    return unwrap(res.data);
  },
  pause: async (id: string): Promise<void> => {
    await apiClient.post(`/workflows/executions/${id}/pause`);
  },
  resume: async (id: string): Promise<void> => {
    await apiClient.post(`/workflows/executions/${id}/resume`);
  },
  cancel: async (id: string): Promise<void> => {
    await apiClient.post(`/workflows/executions/${id}/cancel`);
  },
  retry: async (id: string): Promise<{ executionId: string }> => {
    const res = await apiClient.post<ApiEnvelope<{ executionId: string }>>(
      `/workflows/executions/${id}/retry`,
    );
    return unwrap(res.data);
  },
};

export const workflowApprovalsApi = {
  listPending: async (): Promise<WorkflowApproval[]> => {
    const res = await apiClient.get<ApiEnvelope<WorkflowApproval[]>>("/workflow-approvals");
    return unwrap(res.data);
  },
  decide: async (id: string, action: "APPROVE" | "REJECT", reason?: string): Promise<void> => {
    await apiClient.post(`/workflow-approvals/${id}/decide`, { action, reason });
  },
};

export type { WorkflowDefinition };

// ── AI Provider ──

export const aiApi = {
  models: async (): Promise<ModelMetadata[]> => {
    const res = await apiClient.get<ApiEnvelope<ModelMetadata[]>>("/ai/models");
    return unwrap(res.data);
  },
  quotas: async (): Promise<TokenQuota> => {
    const res = await apiClient.get<ApiEnvelope<TokenQuota>>("/ai/quotas");
    return unwrap(res.data);
  },
  sandbox: async (input: {
    modelId: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<SandboxResult> => {
    const res = await apiClient.post<ApiEnvelope<SandboxResult>>("/ai/sandbox", input);
    return unwrap(res.data);
  },
};

// ── Tools ──

export const toolsApi = {
  catalog: async (): Promise<ToolCatalogItem[]> => {
    const res = await apiClient.get<ApiEnvelope<ToolCatalogItem[]>>("/tools/catalog");
    return unwrap(res.data);
  },
  history: async (): Promise<ToolExecutionRecord[]> => {
    const res = await apiClient.get<ApiEnvelope<ToolExecutionRecord[]>>("/tools/history");
    return unwrap(res.data);
  },
  approvals: async (): Promise<ToolExecutionRecord[]> => {
    const res = await apiClient.get<ApiEnvelope<ToolExecutionRecord[]>>("/tools/approvals");
    return unwrap(res.data);
  },
  decideApproval: async (id: string, action: "APPROVE" | "REJECT"): Promise<void> => {
    await apiClient.post(`/tools/approvals/${id}/decide`, { action });
  },
  execute: async (toolName: string, args: Record<string, unknown>): Promise<unknown> => {
    const res = await apiClient.post<ApiEnvelope<unknown>>("/tools/execute", {
      toolName,
      arguments: args,
    });
    return unwrap(res.data);
  },
  storeCredential: async (input: {
    name: string;
    key: string;
    value: string;
  }): Promise<{ id: string; name: string; key: string }> => {
    const res = await apiClient.post<ApiEnvelope<{ id: string; name: string; key: string }>>(
      "/tools/credentials",
      input,
    );
    return unwrap(res.data);
  },
};

// ── Memory ──

export const memoryApi = {
  knowledge: async (): Promise<KnowledgeItem[]> => {
    const res = await apiClient.get<ApiEnvelope<KnowledgeItem[]>>("/memory/knowledge");
    return unwrap(res.data);
  },
  addKnowledge: async (input: {
    title: string;
    content: string;
    tags?: string[];
    source?: string;
  }): Promise<KnowledgeItem> => {
    const res = await apiClient.post<ApiEnvelope<KnowledgeItem>>("/memory/knowledge", input);
    return unwrap(res.data);
  },
  search: async (text: string): Promise<SemanticSearchResult[]> => {
    const res = await apiClient.post<ApiEnvelope<SemanticSearchResult[]>>("/memory/search", {
      text,
    });
    return unwrap(res.data);
  },
  reflections: async (): Promise<ReflectionRecord[]> => {
    const res = await apiClient.get<ApiEnvelope<ReflectionRecord[]>>("/memory/reflections");
    return unwrap(res.data);
  },
  explore: async (): Promise<MemoryExploreSummary> => {
    const res = await apiClient.get<ApiEnvelope<MemoryExploreSummary>>("/memory/explore");
    return unwrap(res.data);
  },
};

// ── Health (served outside the auth guard) ──

export const healthApi = {
  check: async (): Promise<HealthResponse> => {
    const res = await apiClient.get<HealthResponse>("/health", {
      // health returns 503 with a body when a dependency is down — still useful
      validateStatus: (status) => status === 200 || status === 503,
    });
    return res.data;
  },
};
