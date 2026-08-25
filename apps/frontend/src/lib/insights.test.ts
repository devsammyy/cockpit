import { describe, expect, test } from "vitest";

import type { Execution, ToolExecutionRecord } from "./api/types";
import { aggregateExecutions, dailyExecutionSeries, toolUsageBreakdown } from "./insights";

function makeExecution(overrides: Partial<Execution>): Execution {
  return {
    attemptNumber: 1,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    input: {},
    maxAttempts: 3,
    organizationId: "org",
    status: "COMPLETED",
    totalCostEstimate: 0,
    totalDurationMs: 0,
    totalTokensUsed: 0,
    totalToolCalls: 0,
    triggerType: "MANUAL",
    updatedAt: new Date().toISOString(),
    variables: {},
    workflowId: "wf",
    workflowVersionId: "wfv",
    ...overrides,
  };
}

describe("aggregateExecutions", () => {
  test("computes success rate over terminal executions only", () => {
    // Arrange
    const executions = [
      makeExecution({ status: "COMPLETED" }),
      makeExecution({ status: "COMPLETED" }),
      makeExecution({ status: "FAILED" }),
      makeExecution({ status: "RUNNING" }),
    ];

    // Act
    const result = aggregateExecutions(executions);

    // Assert
    expect(result.total).toBe(4);
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.running).toBe(1);
    expect(result.successRate).toBeCloseTo(2 / 3);
  });

  test("sums tokens, cost, and tool calls", () => {
    const executions = [
      makeExecution({ totalCostEstimate: 100, totalTokensUsed: 500, totalToolCalls: 2 }),
      makeExecution({ totalCostEstimate: 300, totalTokensUsed: 1500, totalToolCalls: 1 }),
    ];

    const result = aggregateExecutions(executions);

    expect(result.totalTokens).toBe(2000);
    expect(result.totalCostMicroUsd).toBe(400);
    expect(result.totalToolCalls).toBe(3);
  });

  test("returns 100% success rate when nothing terminal has run", () => {
    expect(aggregateExecutions([]).successRate).toBe(1);
  });
});

describe("dailyExecutionSeries", () => {
  test("buckets executions into the requested day window", () => {
    // Arrange
    const today = new Date().toISOString();
    const executions = [
      makeExecution({ startedAt: today, status: "COMPLETED", totalTokensUsed: 100 }),
      makeExecution({ startedAt: today, status: "FAILED" }),
    ];

    // Act
    const series = dailyExecutionSeries(executions, 7);

    // Assert
    expect(series).toHaveLength(7);
    const lastBucket = series.at(-1);
    expect(lastBucket?.completed).toBe(1);
    expect(lastBucket?.failed).toBe(1);
    expect(lastBucket?.tokens).toBe(100);
  });

  test("ignores executions outside the window", () => {
    const executions = [
      makeExecution({ startedAt: "2001-01-01T00:00:00.000Z", status: "COMPLETED" }),
    ];

    const series = dailyExecutionSeries(executions, 7);

    expect(series.every((point) => point.completed === 0)).toBe(true);
  });
});

describe("toolUsageBreakdown", () => {
  function makeRecord(toolName: string): ToolExecutionRecord {
    return {
      arguments: {},
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      organizationId: "org",
      runBy: "user",
      status: "COMPLETED",
      toolName,
    };
  }

  test("counts and sorts by usage, collapsing the tail into other", () => {
    // Arrange
    const history = [
      ...Array.from({ length: 5 }, () => makeRecord("a")),
      ...Array.from({ length: 3 }, () => makeRecord("b")),
      makeRecord("c"),
      makeRecord("d"),
      makeRecord("e"),
    ];

    // Act
    const breakdown = toolUsageBreakdown(history, 2);

    // Assert
    expect(breakdown[0]).toEqual({ name: "a", value: 5 });
    expect(breakdown[1]).toEqual({ name: "b", value: 3 });
    expect(breakdown[2]).toEqual({ name: "other", value: 3 });
  });
});
