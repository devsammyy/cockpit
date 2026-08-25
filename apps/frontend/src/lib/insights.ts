import { format, parseISO, subDays } from "date-fns";

import type { Execution, ToolExecutionRecord } from "@/lib/api/types";

/**
 * Client-side analytics over the execution and tool history collections.
 * Pure functions — unit tested and shared by the Overview and Analytics
 * dashboards so both always agree.
 */

export interface ExecutionAggregates {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
  successRate: number; // 0..1 over terminal executions
  totalTokens: number;
  totalCostMicroUsd: number;
  totalToolCalls: number;
  avgDurationMs: number;
}

export function aggregateExecutions(executions: Execution[]): ExecutionAggregates {
  const completed = executions.filter((e) => e.status === "COMPLETED").length;
  const failed = executions.filter((e) => e.status === "FAILED").length;
  const running = executions.filter((e) => e.status === "RUNNING").length;
  const pending = executions.filter((e) => e.status === "PENDING").length;
  const terminal = completed + failed;

  const durations = executions
    .map((e) => e.totalDurationMs)
    .filter((duration) => typeof duration === "number" && duration > 0);

  return {
    avgDurationMs:
      durations.length > 0
        ? durations.reduce((sum, value) => sum + value, 0) / durations.length
        : 0,
    completed,
    failed,
    pending,
    running,
    successRate: terminal > 0 ? completed / terminal : 1,
    total: executions.length,
    totalCostMicroUsd: executions.reduce((sum, e) => sum + (e.totalCostEstimate || 0), 0),
    totalTokens: executions.reduce((sum, e) => sum + (e.totalTokensUsed || 0), 0),
    totalToolCalls: executions.reduce((sum, e) => sum + (e.totalToolCalls || 0), 0),
  };
}

export interface DailyPoint {
  label: string;
  completed: number;
  failed: number;
  tokens: number;
  costMicroUsd: number;
  [key: string]: string | number;
}

/** Bucket executions into the last `days` calendar days (oldest first). */
export function dailyExecutionSeries(executions: Execution[], days = 14): DailyPoint[] {
  const buckets = new Map<string, DailyPoint>();
  const today = new Date();

  for (let offset = days - 1; offset >= 0; offset--) {
    const day = subDays(today, offset);
    const key = format(day, "yyyy-MM-dd");
    buckets.set(key, {
      completed: 0,
      costMicroUsd: 0,
      failed: 0,
      label: format(day, "MMM d"),
      tokens: 0,
    });
  }

  for (const execution of executions) {
    const iso = execution.startedAt ?? execution.createdAt;
    let key: string;
    try {
      key = format(parseISO(iso), "yyyy-MM-dd");
    } catch {
      continue;
    }
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (execution.status === "COMPLETED") bucket.completed += 1;
    if (execution.status === "FAILED") bucket.failed += 1;
    bucket.tokens += execution.totalTokensUsed || 0;
    bucket.costMicroUsd += execution.totalCostEstimate || 0;
  }

  return Array.from(buckets.values());
}

export interface ToolUsageStat {
  name: string;
  value: number;
}

/** Tool invocation counts, descending, capped to the top N (+ "other"). */
export function toolUsageBreakdown(history: ToolExecutionRecord[], topN = 5): ToolUsageStat[] {
  const counts = new Map<string, number>();
  for (const record of history) {
    counts.set(record.toolName, (counts.get(record.toolName) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  if (sorted.length <= topN) return sorted;

  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN).reduce((sum, item) => sum + item.value, 0);
  return [...top, { name: "other", value: rest }];
}

/** Average tool latency per tool name (ms), for latency tables. */
export function toolLatencyStats(
  history: ToolExecutionRecord[],
): { name: string; avgMs: number; count: number; failures: number }[] {
  const groups = new Map<
    string,
    { totalMs: number; count: number; failures: number; withLatency: number }
  >();

  for (const record of history) {
    const group = groups.get(record.toolName) ?? {
      count: 0,
      failures: 0,
      totalMs: 0,
      withLatency: 0,
    };
    group.count += 1;
    if (record.status === "FAILED" || record.status === "REJECTED") group.failures += 1;
    if (typeof record.latencyMs === "number") {
      group.totalMs += record.latencyMs;
      group.withLatency += 1;
    }
    groups.set(record.toolName, group);
  }

  return Array.from(groups.entries())
    .map(([name, group]) => ({
      avgMs: group.withLatency > 0 ? group.totalMs / group.withLatency : 0,
      count: group.count,
      failures: group.failures,
      name,
    }))
    .sort((a, b) => b.count - a.count);
}
