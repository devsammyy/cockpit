"use client";

import {
  AlertTriangle,
  Ban,
  Check,
  CircleDot,
  Coins,
  Pause,
  Play,
  RotateCw,
  ShieldCheck,
  Timer,
  Wrench,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import * as React from "react";

import { IoPanel } from "@/components/executions/io-panel";
import { JsonBlock } from "@/components/patterns/code-block";
import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorState } from "@/components/patterns/error-state";
import { Markdown } from "@/components/patterns/markdown";
import { PageSpinner, TableSkeleton } from "@/components/patterns/loading";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Timeline } from "@/components/patterns/timeline";
import type { TimelineItem } from "@/components/patterns/timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useDecideWorkflowApproval,
  useExecution,
  useExecutionControl,
  useExecutionEvents,
  useExecutionSteps,
  useWorkflowApprovals,
  useWorkflows,
} from "@/hooks/use-api";
import type { ExecutionEvent } from "@/lib/api/types";
import {
  formatCompact,
  formatCostMicroUsd,
  formatDateTime,
  formatDuration,
  formatRelative,
  shortId,
} from "@/lib/format";

const BuilderCanvas = dynamic(
  () => import("@/components/workflow/builder-canvas").then((mod) => mod.BuilderCanvas),
  { loading: () => <PageSpinner />, ssr: false },
);

const EVENT_TONE: Record<string, TimelineItem["tone"]> = {
  APPROVAL_DECIDED: "success",
  APPROVAL_ESCALATED: "warning",
  APPROVAL_REQUESTED: "warning",
  COMPENSATION_EXECUTED: "warning",
  EXECUTION_CANCELLED: "warning",
  EXECUTION_COMPLETED: "success",
  EXECUTION_FAILED: "destructive",
  EXECUTION_PAUSED: "warning",
  STEP_COMPLETED: "success",
  STEP_FAILED: "destructive",
  STEP_RETRIED: "warning",
  STEP_SKIPPED: "default",
  STEP_STARTED: "info",
};

function eventToTimelineItem(event: ExecutionEvent): TimelineItem {
  return {
    description: event.type.replaceAll("_", " ").toLowerCase(),
    id: event.id,
    timestamp: formatRelative(event.createdAt),
    title: event.message,
    tone: EVENT_TONE[event.type] ?? "default",
  };
}

export default function ExecutionDetailPage() {
  const params = useParams<{ id: string }>();
  const executionQuery = useExecution(params.id);
  const workflowsQuery = useWorkflows();

  const execution = executionQuery.data;
  const isLive =
    execution?.status === "RUNNING" ||
    execution?.status === "PENDING" ||
    execution?.status === "WAITING_APPROVAL";

  const stepsQuery = useExecutionSteps(params.id, isLive);
  const eventsQuery = useExecutionEvents(params.id, isLive);
  const approvalsQuery = useWorkflowApprovals();
  const decide = useDecideWorkflowApproval();
  const control = useExecutionControl();

  const workflow = (workflowsQuery.data ?? []).find((item) => item.id === execution?.workflowId);
  const definition = workflow?.definition;

  const timelineItems = React.useMemo<TimelineItem[]>(
    () => (eventsQuery.data ?? []).map(eventToTimelineItem),
    [eventsQuery.data],
  );

  const executionApprovals = (approvalsQuery.data ?? []).filter(
    (approval) => approval.executionId === params.id,
  );

  if (executionQuery.isLoading) {
    return <PageSpinner />;
  }

  if (executionQuery.isError || !execution) {
    return (
      <ErrorState error={executionQuery.error} onRetry={() => void executionQuery.refetch()} />
    );
  }

  const canPause = execution.status === "RUNNING" || execution.status === "PENDING";
  const canResume = execution.status === "PAUSED";
  const canCancel = !["COMPLETED", "FAILED", "CANCELLED"].includes(execution.status);
  const canRetry = execution.status === "FAILED";

  return (
    <>
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge className="text-sm" status={execution.status} />
            {canPause ? (
              <Button
                disabled={control.pause.isPending}
                onClick={() => {
                  control.pause.mutate(execution.id);
                }}
                size="sm"
                variant="outline"
              >
                <Pause /> Pause
              </Button>
            ) : null}
            {canResume ? (
              <Button
                disabled={control.resume.isPending}
                onClick={() => {
                  control.resume.mutate(execution.id);
                }}
                size="sm"
                variant="outline"
              >
                <Play /> Resume
              </Button>
            ) : null}
            {canRetry ? (
              <Button
                disabled={control.retry.isPending}
                onClick={() => {
                  control.retry.mutate(execution.id);
                }}
                size="sm"
                variant="outline"
              >
                <RotateCw /> Retry
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                disabled={control.cancel.isPending}
                onClick={() => {
                  control.cancel.mutate(execution.id);
                }}
                size="sm"
                variant="outline"
              >
                <Ban /> Cancel
              </Button>
            ) : null}
          </div>
        }
        description={
          typeof execution.input["goal"] === "string"
            ? `Goal: ${execution.input["goal"]}`
            : `Workflow run ${shortId(execution.id, 12)}`
        }
        title={`Execution ${shortId(execution.id)}`}
      />

      {execution.status === "WAITING_APPROVAL" && executionApprovals.length > 0 ? (
        <div className="space-y-3">
          {executionApprovals.map((approval) => {
            const message =
              typeof approval.payload["message"] === "string"
                ? approval.payload["message"]
                : `Approval required at step "${approval.stepId}".`;
            const approverRole =
              typeof approval.payload["approverRole"] === "string"
                ? approval.payload["approverRole"]
                : null;

            return (
              <div
                className="overflow-hidden rounded-xl border border-warning/40 bg-warning/[0.04] shadow-sm"
                key={approval.id}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/20 bg-warning/10 px-4 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning/20 text-warning">
                    <ShieldCheck aria-hidden className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Approval required</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Step <span className="font-medium text-foreground">{approval.stepId}</span>
                      {approverRole ? ` · ${approverRole}` : ""}
                    </p>
                  </div>
                  <Badge variant="warning">SLA {approval.slaMinutes}m</Badge>
                </div>

                <div className="max-h-88 overflow-y-auto px-4 py-4">
                  <Markdown content={message} />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-warning/20 bg-background/40 px-4 py-3">
                  <Button
                    disabled={decide.isPending}
                    onClick={() => {
                      decide.mutate({ action: "REJECT", id: approval.id });
                    }}
                    size="sm"
                    variant="outline"
                  >
                    <X /> Reject
                  </Button>
                  <Button
                    disabled={decide.isPending}
                    onClick={() => {
                      decide.mutate({ action: "APPROVE", id: approval.id });
                    }}
                    size="sm"
                  >
                    <Check /> Approve
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : isLive ? (
        <Alert>
          <Timer aria-hidden />
          <AlertTitle>Live execution</AlertTitle>
          <AlertDescription>
            This view refreshes automatically every few seconds while the run is in progress
            {execution.currentStepId ? ` — currently on step "${execution.currentStepId}".` : "."}
          </AlertDescription>
        </Alert>
      ) : null}

      {execution.status === "FAILED" && execution.errorMessage ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>
            Execution failed{execution.errorStepId ? ` at "${execution.errorStepId}"` : ""}
          </AlertTitle>
          <AlertDescription>{execution.errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hint={execution.startedAt ? `started ${formatDateTime(execution.startedAt)}` : undefined}
          icon={Timer}
          label="Duration"
          value={formatDuration(execution.totalDurationMs)}
        />
        <StatCard icon={Coins} label="Tokens" value={formatCompact(execution.totalTokensUsed)} />
        <StatCard
          icon={Wrench}
          label="Tool calls"
          value={formatCompact(execution.totalToolCalls)}
        />
        <StatCard
          hint={`attempt ${String(execution.attemptNumber)} of ${String(execution.maxAttempts)}`}
          icon={Coins}
          label="Estimated cost"
          value={formatCostMicroUsd(execution.totalCostEstimate)}
        />
      </div>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="steps">Steps</TabsTrigger>
          <TabsTrigger value="graph">Graph</TabsTrigger>
          <TabsTrigger value="variables">Variables</TabsTrigger>
          <TabsTrigger value="io">Input / Output</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Execution timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {eventsQuery.isLoading ? (
                <TableSkeleton rows={5} />
              ) : timelineItems.length === 0 ? (
                <EmptyState
                  className="border-0"
                  description="Timeline events are recorded as the engine executes each step."
                  icon={CircleDot}
                  title="No events yet"
                />
              ) : (
                <Timeline items={timelineItems} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="steps">
          <Card>
            <CardHeader>
              <CardTitle>Step executions</CardTitle>
            </CardHeader>
            <CardContent>
              {stepsQuery.isLoading ? (
                <TableSkeleton rows={5} />
              ) : (stepsQuery.data ?? []).length === 0 ? (
                <EmptyState
                  className="border-0"
                  description="Individual step records appear here as the run progresses."
                  icon={Wrench}
                  title="No steps recorded yet"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Step</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Duration</TableHead>
                      <TableHead className="hidden lg:table-cell">Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stepsQuery.data ?? []).map((step) => (
                      <TableRow key={step.id}>
                        <TableCell className="font-mono text-xs font-medium">
                          {step.stepId}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {step.stepType.replaceAll("_", " ").toLowerCase()}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={step.status} />
                        </TableCell>
                        <TableCell className="hidden text-sm tabular-nums sm:table-cell">
                          {formatDuration(step.durationMs ?? null)}
                        </TableCell>
                        <TableCell className="hidden max-w-[280px] lg:table-cell">
                          {step.errorMessage ? (
                            <span className="line-clamp-1 text-xs text-destructive">
                              {step.errorMessage}
                            </span>
                          ) : step.output ? (
                            <span className="line-clamp-1 text-xs text-muted-foreground">
                              {JSON.stringify(step.output)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="graph">
          {definition ? (
            <div className="h-[480px]">
              <BuilderCanvas className="h-full" definition={definition} readOnly />
            </div>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Workflow definition unavailable for graph rendering.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="variables">
          <Card>
            <CardHeader>
              <CardTitle>Execution variables</CardTitle>
            </CardHeader>
            <CardContent>
              <JsonBlock maxHeight={480} value={execution.variables} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="io">
          <IoPanel input={execution.input} isLive={isLive} output={execution.output} />
        </TabsContent>
      </Tabs>
    </>
  );
}
