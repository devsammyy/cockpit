import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

import type { EnvironmentVariables } from "../config/env.schema";
import { REDIS_CLIENT } from "../infrastructure/redis/redis.constants";

const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const AI_DURATION_BUCKETS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120];
const WORKFLOW_DURATION_BUCKETS = [0.5, 1, 5, 10, 30, 60, 120, 300, 600];
const TOOL_DURATION_BUCKETS = [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 30, 60];
const QUEUE_SCAN_BATCH_SIZE = 100;

/**
 * Central Prometheus metrics registry for the platform.
 *
 * Exposes counters, histograms, and gauges covering the HTTP layer, AI provider
 * calls, workflow executions, tool invocations, and BullMQ queue depths. The
 * queue gauge discovers queues at scrape time from Redis so new queues are
 * picked up without code changes.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestsTotal: Counter;
  readonly httpRequestDuration: Histogram;
  readonly aiRequestsTotal: Counter;
  readonly aiRequestDuration: Histogram;
  readonly aiTokensTotal: Counter;
  readonly workflowExecutionsTotal: Counter;
  readonly workflowExecutionDuration: Histogram;
  readonly workflowStepsTotal: Counter;
  readonly toolExecutionsTotal: Counter;
  readonly toolExecutionDuration: Histogram;
  readonly queueJobsGauge: Gauge;

  private readonly isEnabled: boolean;

  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {
    this.isEnabled = config.get("METRICS_ENABLED", { infer: true });
    this.registry.setDefaultLabels({
      service: config.get("APP_NAME", { infer: true }),
      version: config.get("APP_VERSION", { infer: true }),
    });

    if (this.isEnabled) {
      collectDefaultMetrics({ register: this.registry });
    }

    this.httpRequestsTotal = new Counter({
      help: "Total number of HTTP requests processed",
      labelNames: ["method", "route", "status_code"],
      name: "http_requests_total",
      registers: [this.registry],
    });
    this.httpRequestDuration = new Histogram({
      buckets: HTTP_DURATION_BUCKETS,
      help: "HTTP request duration in seconds",
      labelNames: ["method", "route", "status_code"],
      name: "http_request_duration_seconds",
      registers: [this.registry],
    });
    this.aiRequestsTotal = new Counter({
      help: "Total number of AI provider requests",
      labelNames: ["model", "status"],
      name: "ai_requests_total",
      registers: [this.registry],
    });
    this.aiRequestDuration = new Histogram({
      buckets: AI_DURATION_BUCKETS,
      help: "AI provider request duration in seconds",
      labelNames: ["model"],
      name: "ai_request_duration_seconds",
      registers: [this.registry],
    });
    this.aiTokensTotal = new Counter({
      help: "Total AI tokens consumed, labelled by model and organization",
      labelNames: ["model", "organization"],
      name: "ai_tokens_total",
      registers: [this.registry],
    });
    this.workflowExecutionsTotal = new Counter({
      help: "Total number of workflow executions by terminal status",
      labelNames: ["status"],
      name: "workflow_executions_total",
      registers: [this.registry],
    });
    this.workflowExecutionDuration = new Histogram({
      buckets: WORKFLOW_DURATION_BUCKETS,
      help: "Workflow execution duration in seconds",
      labelNames: ["status"],
      name: "workflow_execution_duration_seconds",
      registers: [this.registry],
    });
    this.workflowStepsTotal = new Counter({
      help: "Total number of workflow steps executed by type and status",
      labelNames: ["type", "status"],
      name: "workflow_steps_total",
      registers: [this.registry],
    });
    this.toolExecutionsTotal = new Counter({
      help: "Total number of tool executions by tool and status",
      labelNames: ["tool", "status"],
      name: "tool_executions_total",
      registers: [this.registry],
    });
    this.toolExecutionDuration = new Histogram({
      buckets: TOOL_DURATION_BUCKETS,
      help: "Tool execution duration in seconds",
      labelNames: ["tool"],
      name: "tool_execution_duration_seconds",
      registers: [this.registry],
    });

    this.queueJobsGauge = new Gauge({
      collect: async () => {
        await this.collectQueueMetrics(this.queueJobsGauge);
      },
      help: "Number of BullMQ jobs per queue and state, sampled at scrape time",
      labelNames: ["queue", "state"],
      name: "bullmq_queue_jobs",
      registers: [this.registry],
    });
  }

  get enabled(): boolean {
    return this.isEnabled;
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = { method, route, status_code: String(statusCode) };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, durationSeconds);
  }

  recordAiRequest(model: string, status: "success" | "error", durationSeconds: number): void {
    this.aiRequestsTotal.inc({ model, status });
    this.aiRequestDuration.observe({ model }, durationSeconds);
  }

  recordAiTokens(model: string, organization: string, tokens: number): void {
    this.aiTokensTotal.inc({ model, organization }, tokens);
  }

  recordWorkflowExecution(status: "completed" | "failed", durationSeconds: number): void {
    this.workflowExecutionsTotal.inc({ status });
    this.workflowExecutionDuration.observe({ status }, durationSeconds);
  }

  recordWorkflowStep(type: string, status: "success" | "error"): void {
    this.workflowStepsTotal.inc({ status, type });
  }

  recordToolExecution(
    tool: string,
    status: "completed" | "failed" | "rejected",
    durationSeconds: number,
  ): void {
    this.toolExecutionsTotal.inc({ status, tool });
    this.toolExecutionDuration.observe({ tool }, durationSeconds);
  }

  /**
   * Discover BullMQ queues from Redis key space and report job counts per state.
   * Scrape failures are swallowed so a Redis outage never breaks /metrics.
   */
  private async collectQueueMetrics(gauge: Gauge): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      const queueNames = await this.scanQueueNames();

      for (const queue of queueNames) {
        const [waiting, active, delayed, failed, completed] = await Promise.all([
          this.redis.llen(`bull:${queue}:wait`),
          this.redis.llen(`bull:${queue}:active`),
          this.redis.zcard(`bull:${queue}:delayed`),
          this.redis.zcard(`bull:${queue}:failed`),
          this.redis.zcard(`bull:${queue}:completed`),
        ]);

        gauge.set({ queue, state: "waiting" }, waiting);
        gauge.set({ queue, state: "active" }, active);
        gauge.set({ queue, state: "delayed" }, delayed);
        gauge.set({ queue, state: "failed" }, failed);
        gauge.set({ queue, state: "completed" }, completed);
      }
    } catch {
      // Queue metrics are best-effort; never fail the scrape.
    }
  }

  private async scanQueueNames(): Promise<string[]> {
    if (!this.redis) {
      return [];
    }

    const names = new Set<string>();
    let cursor = "0";

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        "bull:*:meta",
        "COUNT",
        QUEUE_SCAN_BATCH_SIZE,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const queueName = key.slice("bull:".length, -":meta".length);
        if (queueName.length > 0) {
          names.add(queueName);
        }
      }
    } while (cursor !== "0");

    return Array.from(names);
  }
}
