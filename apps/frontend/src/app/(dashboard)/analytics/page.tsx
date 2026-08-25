"use client";

import { BarChart3, CircleDollarSign, Coins, Timer } from "lucide-react";
import * as React from "react";

import { CategoryBar, ChartCard, Donut, TimeSeriesArea } from "@/components/patterns/charts";
import { ErrorState } from "@/components/patterns/error-state";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useExecutions, useQuotas, useToolHistory } from "@/hooks/use-api";
import {
  formatCompact,
  formatCostMicroUsd,
  formatDuration,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import {
  aggregateExecutions,
  dailyExecutionSeries,
  toolLatencyStats,
  toolUsageBreakdown,
} from "@/lib/insights";

export default function AnalyticsPage() {
  const executionsQuery = useExecutions({ live: false });
  const toolHistoryQuery = useToolHistory();
  const quotasQuery = useQuotas();

  const executions = React.useMemo(() => executionsQuery.data ?? [], [executionsQuery.data]);
  const toolHistory = React.useMemo(() => toolHistoryQuery.data ?? [], [toolHistoryQuery.data]);

  const aggregates = React.useMemo(() => aggregateExecutions(executions), [executions]);
  const series = React.useMemo(() => dailyExecutionSeries(executions, 30), [executions]);
  const toolUsage = React.useMemo(() => toolUsageBreakdown(toolHistory), [toolHistory]);
  const toolLatency = React.useMemo(() => toolLatencyStats(toolHistory), [toolHistory]);

  const isLoading = executionsQuery.isLoading;
  const isEmpty = !isLoading && executions.length === 0;

  if (executionsQuery.isError) {
    return (
      <>
        <PageHeader title="Analytics" />
        <ErrorState error={executionsQuery.error} onRetry={() => void executionsQuery.refetch()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        description="Trends across executions, AI spend, token consumption, and tool performance for this organization."
        title="Analytics"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hint={`${String(aggregates.completed)} completed / ${String(aggregates.failed)} failed`}
          icon={BarChart3}
          isLoading={isLoading}
          label="Success rate"
          value={`${String(Math.round(aggregates.successRate * 100))}%`}
        />
        <StatCard
          icon={Coins}
          isLoading={isLoading}
          label="Total tokens"
          value={formatCompact(aggregates.totalTokens)}
        />
        <StatCard
          icon={CircleDollarSign}
          isLoading={isLoading}
          label="Estimated spend"
          value={formatCostMicroUsd(aggregates.totalCostMicroUsd)}
        />
        <StatCard
          hint="mean end-to-end"
          icon={Timer}
          isLoading={isLoading}
          label="Avg execution time"
          value={formatDuration(aggregates.avgDurationMs)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          description="Completed vs failed executions per day"
          isEmpty={isEmpty}
          isLoading={isLoading}
          title="Workflow outcomes — 30 days"
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

        <ChartCard
          description="Qwen token consumption per day"
          isEmpty={isEmpty}
          isLoading={isLoading}
          title="Token consumption — 30 days"
        >
          <CategoryBar
            data={series}
            series={[{ color: "hsl(var(--chart-2))", key: "tokens", name: "Tokens" }]}
            valueFormatter={(value) => formatCompact(value)}
          />
        </ChartCard>

        <ChartCard
          description="Estimated cost per day (micro-USD aggregated)"
          isEmpty={isEmpty}
          isLoading={isLoading}
          title="AI spend — 30 days"
        >
          <CategoryBar
            data={series}
            series={[{ color: "hsl(var(--chart-3))", key: "costMicroUsd", name: "Cost" }]}
            valueFormatter={(value) => formatCostMicroUsd(value)}
          />
        </ChartCard>

        <ChartCard
          description="Share of tool invocations by tool"
          isEmpty={!toolHistoryQuery.isLoading && toolUsage.length === 0}
          isLoading={toolHistoryQuery.isLoading}
          title="Tool usage"
        >
          <Donut data={toolUsage} />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tool performance</CardTitle>
          <CardDescription>
            Invocation counts, failure rates, and mean latency per registered tool.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {toolLatency.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tool executions recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead className="text-right">Invocations</TableHead>
                  <TableHead className="text-right">Failure rate</TableHead>
                  <TableHead className="text-right">Avg latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {toolLatency.map((stat) => (
                  <TableRow key={stat.name}>
                    <TableCell className="font-mono text-xs font-medium">{stat.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(stat.count)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPercent(stat.failures, stat.count)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDuration(stat.avgMs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization usage</CardTitle>
          <CardDescription>Quota utilization for the current billing windows.</CardDescription>
        </CardHeader>
        <CardContent>
          {quotasQuery.data ? (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Daily tokens used</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatCompact(quotasQuery.data.dailyUsed)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Daily utilization</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatPercent(quotasQuery.data.dailyUsed, quotasQuery.data.dailyLimit)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Monthly tokens used</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatCompact(quotasQuery.data.monthlyUsed)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Monthly utilization</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatPercent(quotasQuery.data.monthlyUsed, quotasQuery.data.monthlyLimit)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Quota data unavailable.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
