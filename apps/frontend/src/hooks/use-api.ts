"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiErrorMessage } from "@/lib/api/client";
import {
  aiApi,
  healthApi,
  memoryApi,
  organizationsApi,
  toolsApi,
  usersApi,
  workflowApprovalsApi,
  workflowsApi,
} from "@/lib/api/endpoints";
import type { Execution } from "@/lib/api/types";

/**
 * All server-state access for the console lives here as TanStack Query hooks.
 * Live surfaces (executions, approvals) poll on an interval — the transport
 * can later be swapped for SSE/WebSocket without touching any consumer.
 */

const LIVE_POLL_MS = 4000;
const SLOW_POLL_MS = 30000;

export const queryKeys = {
  approvals: ["approvals"] as const,
  execution: (id: string) => ["executions", id] as const,
  executionEvents: (id: string) => ["executions", id, "events"] as const,
  executions: ["executions"] as const,
  executionSteps: (id: string) => ["executions", id, "steps"] as const,
  health: ["health"] as const,
  knowledge: ["memory", "knowledge"] as const,
  members: ["organizations", "members"] as const,
  memoryExplore: ["memory", "explore"] as const,
  models: ["ai", "models"] as const,
  profile: ["users", "me"] as const,
  quotas: ["ai", "quotas"] as const,
  reflections: ["memory", "reflections"] as const,
  toolCatalog: ["tools", "catalog"] as const,
  toolHistory: ["tools", "history"] as const,
  workflow: (id: string) => ["workflows", id] as const,
  workflowApprovals: ["workflow-approvals"] as const,
  workflows: ["workflows"] as const,
  workflowVersions: (id: string) => ["workflows", id, "versions"] as const,
};

// ── Users / Organizations ──

export function useProfile() {
  return useQuery({ queryFn: usersApi.me, queryKey: queryKeys.profile });
}

export function useMembers() {
  return useQuery({ queryFn: organizationsApi.members, queryKey: queryKeys.members });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: organizationsApi.invite,
    onError: (error) => toast.error(apiErrorMessage(error)),
    onSuccess: () => {
      toast.success("Invitation sent");
      void queryClient.invalidateQueries({ queryKey: queryKeys.members });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: usersApi.updateMe,
    onError: (error) => toast.error(apiErrorMessage(error)),
    onSuccess: () => {
      toast.success("Profile updated");
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}

// ── Workflows & Executions ──

export function useWorkflows() {
  return useQuery({ queryFn: workflowsApi.templates, queryKey: queryKeys.workflows });
}

export function useSeedTemplates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workflowsApi.seedTemplates,
    onError: (error) => toast.error(apiErrorMessage(error)),
    onSuccess: ({ count }) => {
      toast.success(
        count > 0 ? `Seeded ${String(count)} workflow templates` : "Templates already present",
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
    },
  });
}

export function usePlanAndExecute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workflowsApi.planAndExecute,
    onError: (error) => toast.error(apiErrorMessage(error)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.executions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
    },
  });
}

function hasLiveExecutions(executions: Execution[] | undefined): boolean {
  return (executions ?? []).some((e) => e.status === "RUNNING" || e.status === "PENDING");
}

export function useExecutions(options?: { live?: boolean }) {
  return useQuery({
    queryFn: workflowsApi.executions,
    queryKey: queryKeys.executions,
    refetchInterval: (query) =>
      options?.live === false
        ? false
        : hasLiveExecutions(query.state.data)
          ? LIVE_POLL_MS
          : SLOW_POLL_MS,
  });
}

function isLive(status: string | undefined): boolean {
  return status === "RUNNING" || status === "PENDING" || status === "WAITING_APPROVAL";
}

export function useExecution(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => workflowsApi.execution(id ?? ""),
    queryKey: queryKeys.execution(id ?? "none"),
    refetchInterval: (query) => (isLive(query.state.data?.status) ? LIVE_POLL_MS : false),
  });
}

export function useExecutionSteps(id: string | null, live: boolean) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => workflowsApi.steps(id ?? ""),
    queryKey: queryKeys.executionSteps(id ?? "none"),
    refetchInterval: live ? LIVE_POLL_MS : false,
  });
}

export function useExecutionEvents(id: string | null, live: boolean) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => workflowsApi.events(id ?? ""),
    queryKey: queryKeys.executionEvents(id ?? "none"),
    refetchInterval: live ? LIVE_POLL_MS : false,
  });
}

export function useWorkflow(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => workflowsApi.get(id ?? ""),
    queryKey: queryKeys.workflow(id ?? "none"),
  });
}

export function useWorkflowVersions(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => workflowsApi.versions(id ?? ""),
    queryKey: queryKeys.workflowVersions(id ?? "none"),
  });
}

export function useSaveWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof workflowsApi.create>[0] & { id?: string }) =>
      input.id
        ? workflowsApi.update(input.id, {
            changelog: "Edited in builder",
            definition: input.definition,
            description: input.description,
            name: input.name,
          })
        : workflowsApi.create(input),
    onError: (error) => toast.error(apiErrorMessage(error)),
    onSuccess: () => {
      toast.success("Workflow saved");
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
    },
  });
}

export function useStartWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, input }: { workflowId: string; input?: Record<string, unknown> }) =>
      workflowsApi.start(workflowId, input),
    onError: (error) => toast.error(apiErrorMessage(error)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.executions });
    },
  });
}

/** Execution lifecycle controls (pause/resume/cancel/retry). */
export function useExecutionControl() {
  const queryClient = useQueryClient();
  const invalidate = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.execution(id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.executions });
  };
  return {
    cancel: useMutation({
      mutationFn: workflowsApi.cancel,
      onError: (error) => toast.error(apiErrorMessage(error)),
      onSuccess: (_data, id) => {
        toast.success("Execution cancelled");
        invalidate(id);
      },
    }),
    pause: useMutation({
      mutationFn: workflowsApi.pause,
      onError: (error) => toast.error(apiErrorMessage(error)),
      onSuccess: (_data, id) => {
        toast.success("Execution paused");
        invalidate(id);
      },
    }),
    resume: useMutation({
      mutationFn: workflowsApi.resume,
      onError: (error) => toast.error(apiErrorMessage(error)),
      onSuccess: (_data, id) => {
        toast.success("Execution resumed");
        invalidate(id);
      },
    }),
    retry: useMutation({
      mutationFn: workflowsApi.retry,
      onError: (error) => toast.error(apiErrorMessage(error)),
      onSuccess: (result, id) => {
        toast.success("Retry started");
        invalidate(id);
        void queryClient.invalidateQueries({ queryKey: queryKeys.execution(result.executionId) });
      },
    }),
  };
}

// ── Workflow approvals (durable) ──

export function useWorkflowApprovals() {
  return useQuery({
    queryFn: workflowApprovalsApi.listPending,
    queryKey: queryKeys.workflowApprovals,
    refetchInterval: LIVE_POLL_MS,
  });
}

export function useDecideWorkflowApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: "APPROVE" | "REJECT";
      reason?: string;
    }) => workflowApprovalsApi.decide(id, action, reason),
    onError: (error) => toast.error(apiErrorMessage(error)),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.workflowApprovals });
      const previous = queryClient.getQueryData(queryKeys.workflowApprovals);
      queryClient.setQueryData(
        queryKeys.workflowApprovals,
        (old: { id: string }[] | undefined) => old?.filter((item) => item.id !== id) ?? [],
      );
      return { previous };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflowApprovals });
      void queryClient.invalidateQueries({ queryKey: queryKeys.executions });
    },
    onSuccess: (_data, { action }) => {
      toast.success(action === "APPROVE" ? "Approved — execution resuming" : "Rejected");
    },
  });
}

// ── AI ──

export function useModels() {
  return useQuery({ queryFn: aiApi.models, queryKey: queryKeys.models, staleTime: 60000 });
}

export function useQuotas() {
  return useQuery({ queryFn: aiApi.quotas, queryKey: queryKeys.quotas });
}

export function useSandbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: aiApi.sandbox,
    onError: (error) => toast.error(apiErrorMessage(error)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotas });
    },
  });
}

// ── Tools ──

export function useToolCatalog() {
  return useQuery({ queryFn: toolsApi.catalog, queryKey: queryKeys.toolCatalog, staleTime: 60000 });
}

export function useToolHistory() {
  return useQuery({
    queryFn: toolsApi.history,
    queryKey: queryKeys.toolHistory,
    refetchInterval: SLOW_POLL_MS,
  });
}

export function useApprovals() {
  return useQuery({
    queryFn: toolsApi.approvals,
    queryKey: queryKeys.approvals,
    refetchInterval: LIVE_POLL_MS,
  });
}

export function useDecideApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "APPROVE" | "REJECT" }) =>
      toolsApi.decideApproval(id, action),
    onError: (error) => toast.error(apiErrorMessage(error)),
    // Optimistic: drop the approval from the queue immediately
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.approvals });
      const previous = queryClient.getQueryData(queryKeys.approvals);
      queryClient.setQueryData(
        queryKeys.approvals,
        (old: { id: string }[] | undefined) => old?.filter((item) => item.id !== id) ?? [],
      );
      return { previous };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.approvals });
      void queryClient.invalidateQueries({ queryKey: queryKeys.toolHistory });
    },
    onSuccess: (_data, { action }) => {
      toast.success(action === "APPROVE" ? "Execution approved" : "Execution rejected");
    },
  });
}

export function useExecuteTool() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ toolName, args }: { toolName: string; args: Record<string, unknown> }) =>
      toolsApi.execute(toolName, args),
    onError: (error) => toast.error(apiErrorMessage(error)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.toolHistory });
    },
  });
}

export function useStoreCredential() {
  return useMutation({
    mutationFn: toolsApi.storeCredential,
    onError: (error) => toast.error(apiErrorMessage(error)),
    onSuccess: (data) => toast.success(`Credential "${data.name}" stored securely`),
  });
}

// ── Memory ──

export function useKnowledge() {
  return useQuery({ queryFn: memoryApi.knowledge, queryKey: queryKeys.knowledge });
}

export function useAddKnowledge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: memoryApi.addKnowledge,
    onError: (error) => toast.error(apiErrorMessage(error)),
    onSuccess: () => {
      toast.success("Document indexed into knowledge base");
      void queryClient.invalidateQueries({ queryKey: queryKeys.knowledge });
      void queryClient.invalidateQueries({ queryKey: queryKeys.memoryExplore });
    },
  });
}

export function useMemorySearch() {
  return useMutation({
    mutationFn: memoryApi.search,
    onError: (error) => toast.error(apiErrorMessage(error)),
  });
}

export function useReflections() {
  return useQuery({ queryFn: memoryApi.reflections, queryKey: queryKeys.reflections });
}

export function useMemoryExplore() {
  return useQuery({ queryFn: memoryApi.explore, queryKey: queryKeys.memoryExplore });
}

// ── Health ──

export function useHealth() {
  return useQuery({
    queryFn: healthApi.check,
    queryKey: queryKeys.health,
    refetchInterval: 15000,
    retry: false,
  });
}
