"use client";

import {
  Activity,
  ArrowRight,
  CircleDollarSign,
  Coins,
  ListTree,
  Plus,
  Workflow as WorkflowIcon,
  Zap,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { ChartCard, TimeSeriesArea } from "@/components/patterns/charts";
import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorState } from "@/components/patterns/error-state";
import { StatGridSkeleton } from "@/components/patterns/loading";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Timeline } from "@/components/patterns/timeline";
import type { TimelineItem } from "@/components/patterns/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useExecutions, useQuotas, useWorkflows } from "@/hooks/use-api";
import {
  formatCompact,
  formatCostMicroUsd,
  formatDuration,
  formatPercent,
  formatRelative,
  percentOf,
  shortId,
} from "@/lib/format";
import { aggregateExecutions, dailyExecutionSeries } from "@/lib/insights";
import { useAuthStore } from "@/state/auth-store";

export default function OverviewPage() {
  const user = useAuthStore((state) => state.user);
  const executionsQuery = useExecutions();
  const quotasQuery = useQuotas();
  const workflowsQuery = useWorkflows();

  const executions = React.useMemo(() => executionsQuery.data ?? [], [executionsQuery.data]);
  const aggregates = React.useMemo(() => aggregateExecutions(executions), [executions]);
  const series = React.useMemo(() => dailyExecutionSeries(executions), [executions]);
  const isLoading = executionsQuery.isLoading;

  const activity = React.useMemo<TimelineItem[]>(
    () =>
      executions.slice(0, 8).map((execution) => ({
        description: execution.errorMessage ?? undefined,
        icon: execution.status === "FAILED" ? Zap : ListTree,
        id: execution.id,
        timestamp: formatRelative(execution.startedAt ?? execution.createdAt),
        title: `Execution ${shortId(execution.id)} · ${execution.status.toLowerCase()}`,
        tone:
          execution.status === "COMPLETED"
            ? "success"
            : execution.status === "FAILED"
              ? "destructive"
              : "info",
      })),
    [executions],
  );

  return (
    <>
      <PageHeader
        actions={
          <Button asChild>
            <Link href="/workflows?run=1">
              <Plus /> Run a goal
            </Link>
          </Button>
        }
        description={`Welcome back${user?.displayName ? `, ${user.displayName}` : ""}. Here is what your autonomous agents have been doing.`}
        title="Overview"
      />

      {executionsQuery.isError ? (
        <ErrorState error={executionsQuery.error} onRetry={() => void executionsQuery.refetch()} />
      ) : (
        <>
          {isLoading ? (
            <StatGridSkeleton />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                hint={`${String(aggregates.running)} running now`}
                icon={ListTree}
                label="Executions"
                value={formatCompact(aggregates.total)}
              />
              <StatCard
                hint={`${String(aggregates.failed)} failed`}
                icon={Activity}
                label="Success rate"
                value={`${String(Math.round(aggregates.successRate * 100))}%`}
              />
              <StatCard
                hint="across all executions"
                icon={Coins}
                label="Tokens consumed"
                value={formatCompact(aggregates.totalTokens)}
              />
              <StatCard
                hint={`avg run ${formatDuration(aggregates.avgDurationMs)}`}
                icon={CircleDollarSign}
                label="Estimated cost"
                value={formatCostMicroUsd(aggregates.totalCostMicroUsd)}
              />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartCard
                description="Completed vs failed executions per day"
                isEmpty={!isLoading && aggregates.total === 0}
                isLoading={isLoading}
                title="Execution volume — last 14 days"
              >
                <TimeSeriesArea
                  data={series}
                  series={[
                    { color: "hsl(var(--chart-1))", key: "completed", name: "Completed" },
                    { color: "hsl(var(--chart-5))", key: "failed", name: "Failed" },
                  ]}
                  stacked
                />
              </ChartCard>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Token quota</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {quotasQuery.isLoading ? (
                  <>
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </>
                ) : quotasQuery.data ? (
                  <>
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between text-sm">
                        <span className="text-muted-foreground">Daily</span>
                        <span className="font-medium tabular-nums">
                          {formatCompact(quotasQuery.data.dailyUsed)} /{" "}
                          {formatCompact(quotasQuery.data.dailyLimit)}
                        </span>
                      </div>
                      <Progress
                        aria-label={`Daily token quota ${formatPercent(quotasQuery.data.dailyUsed, quotasQuery.data.dailyLimit)} used`}
                        value={percentOf(quotasQuery.data.dailyUsed, quotasQuery.data.dailyLimit)}
                      />
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between text-sm">
                        <span className="text-muted-foreground">Monthly</span>
                        <span className="font-medium tabular-nums">
                          {formatCompact(quotasQuery.data.monthlyUsed)} /{" "}
                          {formatCompact(quotasQuery.data.monthlyLimit)}
                        </span>
                      </div>
                      <Progress
                        aria-label={`Monthly token quota ${formatPercent(quotasQuery.data.monthlyUsed, quotasQuery.data.monthlyLimit)} used`}
                        value={percentOf(
                          quotasQuery.data.monthlyUsed,
                          quotasQuery.data.monthlyLimit,
                        )}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Quotas cap Qwen token consumption per organization. Manage in{" "}
                      <Link
                        className="text-primary underline-offset-2 hover:underline"
                        href="/agents"
                      >
                        Agents &amp; Models
                      </Link>
                      .
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Quota data unavailable.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Recent activity</CardTitle>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/executions">
                    View all <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton className="h-12 w-full" key={index} />
                    ))}
                  </div>
                ) : activity.length === 0 ? (
                  <EmptyState
                    action={
                      <Button asChild size="sm">
                        <Link href="/workflows?run=1">Run your first goal</Link>
                      </Button>
                    }
                    className="border-0"
                    description="Executions will appear here as agents start working."
                    icon={ListTree}
                    title="No activity yet"
                  />
                ) : (
                  <Timeline items={activity} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Workflows</CardTitle>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/workflows">
                    All <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-1">
                {workflowsQuery.isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton className="h-10 w-full" key={index} />
                  ))
                ) : (workflowsQuery.data ?? []).length === 0 ? (
                  <EmptyState
                    className="border-0 py-8"
                    description="Seed the template library from the Workflows page."
                    icon={WorkflowIcon}
                    title="No workflows yet"
                  />
                ) : (
                  (workflowsQuery.data ?? []).slice(0, 5).map((workflow) => (
                    <Link
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent"
                      href="/workflows"
                      key={workflow.id}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{workflow.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {workflow.definition.steps.length} steps
                        </span>
                      </span>
                      <StatusBadge status={workflow.status} />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
