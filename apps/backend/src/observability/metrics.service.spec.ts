import type { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";

import type { EnvironmentVariables } from "../config/env.schema";
import { MetricsService } from "./metrics.service";

function createConfigMock(
  overrides: Partial<Record<string, unknown>> = {},
): ConfigService<EnvironmentVariables, true> {
  const values: Record<string, unknown> = {
    APP_NAME: "test-service",
    APP_VERSION: "0.0.0-test",
    METRICS_ENABLED: true,
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

describe("MetricsService", () => {
  test("exposes default process metrics when enabled", async () => {
    // Arrange
    const service = new MetricsService(createConfigMock());

    // Act
    const output = await service.getMetrics();

    // Assert
    expect(service.enabled).toBe(true);
    expect(output).toContain("process_cpu_user_seconds_total");
  });

  test("skips default process metrics when disabled", async () => {
    // Arrange
    const service = new MetricsService(createConfigMock({ METRICS_ENABLED: false }));

    // Act
    const output = await service.getMetrics();

    // Assert
    expect(service.enabled).toBe(false);
    expect(output).not.toContain("process_cpu_user_seconds_total");
  });

  test("records HTTP request count and duration with route labels", async () => {
    // Arrange
    const service = new MetricsService(createConfigMock());

    // Act
    service.recordHttpRequest("GET", "/api/v1/users/:id", 200, 0.05);
    service.recordHttpRequest("GET", "/api/v1/users/:id", 200, 0.15);
    const output = await service.getMetrics();

    // Assert
    expect(output).toContain(
      'http_requests_total{method="GET",route="/api/v1/users/:id",status_code="200"',
    );
    expect(output).toContain("http_request_duration_seconds_bucket");
  });

  test("records AI request metrics and token consumption per organization", async () => {
    // Arrange
    const service = new MetricsService(createConfigMock());

    // Act
    service.recordAiRequest("qwen-max", "success", 1.2);
    service.recordAiTokens("qwen-max", "org-42", 512);
    const output = await service.getMetrics();

    // Assert
    expect(output).toContain('ai_requests_total{model="qwen-max",status="success"');
    expect(output).toContain('ai_tokens_total{model="qwen-max",organization="org-42"');
  });

  test("records workflow execution and step metrics", async () => {
    // Arrange
    const service = new MetricsService(createConfigMock());

    // Act
    service.recordWorkflowExecution("completed", 12.5);
    service.recordWorkflowStep("AGENT_TASK", "success");
    const output = await service.getMetrics();

    // Assert
    expect(output).toContain('workflow_executions_total{status="completed"');
    expect(output).toMatch(/workflow_steps_total\{[^}]*type="AGENT_TASK"/);
    expect(output).toMatch(/workflow_steps_total\{[^}]*status="success"/);
  });

  test("records tool execution metrics", async () => {
    // Arrange
    const service = new MetricsService(createConfigMock());

    // Act
    service.recordToolExecution("http-request", "completed", 0.4);
    const output = await service.getMetrics();

    // Assert
    expect(output).toMatch(/tool_executions_total\{[^}]*tool="http-request"/);
    expect(output).toMatch(/tool_executions_total\{[^}]*status="completed"/);
  });

  test("discovers BullMQ queues from redis and reports per-state job counts", async () => {
    // Arrange
    const redisMock = {
      llen: jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(1),
      scan: jest.fn().mockResolvedValue(["0", ["bull:executions:meta"]]),
      zcard: jest.fn().mockResolvedValue(0),
    } as unknown as Redis;
    const service = new MetricsService(createConfigMock(), redisMock);

    // Act
    const output = await service.getMetrics();

    // Assert
    expect(output).toContain('queue="executions"');
    expect(output).toContain('state="waiting"');
    expect(output).toContain('state="active"');
  });

  test("survives redis scrape failures without breaking the metrics output", async () => {
    // Arrange
    const redisMock = {
      llen: jest.fn(),
      scan: jest.fn().mockRejectedValue(new Error("redis down")),
      zcard: jest.fn(),
    } as unknown as Redis;
    const service = new MetricsService(createConfigMock(), redisMock);

    // Act
    const output = await service.getMetrics();

    // Assert
    expect(output).toContain("http_requests_total");
  });
});
