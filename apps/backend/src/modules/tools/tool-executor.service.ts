import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as crypto from "crypto";

import { PrismaService } from "../../infrastructure/database/prisma.service";
import { MetricsService } from "../../observability/metrics.service";
import { CredentialManagerService } from "./credential-manager.service";
import { PolicyEngineService } from "./policy-engine.service";
import { ToolRegistryService } from "./tool-registry.service";
import { AuditPipelineService } from "./framework/audit-pipeline.service";
import { EventDispatcherService } from "./framework/event-dispatcher.service";
import { PermissionEngineService } from "./framework/permission-engine.service";
import { ToolSandboxService } from "./framework/tool-sandbox.service";
import { ToolApprovalService } from "./framework/tool-approval.service";
import { describeTool } from "./framework/tool-descriptor";
import type { ToolDescriptor } from "./framework/tool-descriptor";
import type { StageDenyCode } from "./framework/pipeline-stage.interface";
import type {
  ToolExecutionContext,
  ToolExecutionSource,
  ToolLogLevel,
} from "./framework/tool-execution-context";
import type { Tool } from "./tool.interface";

export interface ExecuteContext {
  orgId: string;
  userId: string;
  /** Origin of the call; WORKFLOW-sourced runs defer approval to the workflow engine. */
  source?: ToolExecutionSource;
}

export interface ExecuteResult {
  success: boolean;
  executionId: string;
  status: string;
  result: unknown;
  /** Set when the run paused on a durable approval. */
  approvalId?: string;
}

/**
 * The provider-independent tool execution pipeline. A single `execute` call
 * runs the canonical lifecycle:
 *
 *   permission → input validation → policy → approval → context →
 *   sandbox+invoke → output validation → audit → metrics → event
 *
 * The engine contains zero tool-specific logic — each stage delegates to a
 * dedicated, independently testable service. Approvals are durable and
 * non-blocking: an approval-gated run persists and returns PENDING_APPROVAL
 * immediately, then resumes in the background via the `tool.approval.resumed`
 * event when a decision is recorded.
 */
@Injectable()
export class ToolExecutorService implements OnModuleInit {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(
    private readonly registry: ToolRegistryService,
    private readonly policyEngine: PolicyEngineService,
    private readonly credentialManager: CredentialManagerService,
    private readonly prisma: PrismaService,
    private readonly permissionEngine: PermissionEngineService,
    private readonly sandbox: ToolSandboxService,
    private readonly audit: AuditPipelineService,
    private readonly events: EventDispatcherService,
    private readonly toolApproval: ToolApprovalService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  onModuleInit(): void {
    // Approved runs resume in the background; a restart between request and
    // decision is fine because the PENDING_APPROVAL row and its Approval persist.
    this.events.on("tool.approval.resumed", (payload) => {
      void this.resume(payload.executionId);
    });
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ExecuteContext,
  ): Promise<ExecuteResult> {
    const executionId = crypto.randomUUID();
    const startTime = Date.now();

    // ── Resolve the tool + its normalized descriptor ──
    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new NotFoundException(`Tool with name ${toolName} not found in registry`);
    }
    const descriptor = describeTool(tool.metadata);

    // ── Stage: Execution Context creation ──
    const abort = new AbortController();
    const ctx = this.buildContext(
      executionId,
      context,
      startTime + descriptor.timeoutMs,
      abort.signal,
    );

    this.events.emit("tool.execution.started", {
      executionId,
      organizationId: context.orgId,
      toolName,
      userId: context.userId,
      source: ctx.source,
    });

    // ── Stage: Permission validation ──
    const perm = await this.permissionEngine.check(
      context.orgId,
      context.userId,
      descriptor.permissions,
    );
    if (!perm.allowed) {
      await this.deny(
        executionId,
        descriptor,
        context,
        "PERMISSION_DENIED",
        `Missing permissions: ${perm.missing.join(", ")}`,
        startTime,
      );
    }

    // ── Stage: Input validation ──
    const parsed = descriptor.inputSchema.safeParse(args);
    if (!parsed.success) {
      await this.deny(
        executionId,
        descriptor,
        context,
        "INPUT_VALIDATION_FAILED",
        `Invalid input: ${parsed.error.message}`,
        startTime,
      );
    }
    // `inputSchema` is `ZodType<any>`; the annotation narrows the parsed data.
    const validatedInput: Record<string, unknown> = parsed.success ? parsed.data : args;

    // ── Stage: Policy evaluation ──
    const policy = await this.policyEngine.evaluateExecution({
      organizationId: context.orgId,
      userId: context.userId,
      toolName,
      riskLevel: descriptor.riskLevel,
    });
    if (!policy.allowed) {
      await this.deny(
        executionId,
        descriptor,
        context,
        policy.code ?? "POLICY_VIOLATION",
        policy.reason ?? "Blocked by policy",
        startTime,
      );
    }

    // WORKFLOW-sourced runs are approval-gated by the workflow engine, so the
    // tool executor never gates them a second time.
    const requiresApproval =
      (policy.requiresApproval || descriptor.requiresApproval) && ctx.source !== "WORKFLOW";

    // ── Persist the run record (auditable from here on) ──
    await this.tryWrite(() =>
      this.prisma.toolExecutionHistory.create({
        data: {
          id: executionId,
          organizationId: context.orgId,
          toolName,
          toolDefinitionId: null,
          arguments: validatedInput as Prisma.InputJsonValue,
          status: requiresApproval ? "PENDING_APPROVAL" : "RUNNING",
          source: ctx.source,
          riskLevel: descriptor.riskLevel,
          runBy: context.userId,
          runByType: "USER",
          startedAt: new Date(),
        },
      }),
    );

    // ── Stage: Approval check (durable, non-blocking) ──
    if (requiresApproval) {
      const { id: approvalId } = await this.toolApproval.request({
        organizationId: context.orgId,
        toolExecutionId: executionId,
        userId: context.userId,
        toolName,
        riskLevel: descriptor.riskLevel,
      });
      await this.tryWrite(() =>
        this.prisma.toolExecutionHistory.update({
          where: { id: executionId },
          data: { approvalId },
        }),
      );
      return { success: false, executionId, status: "PENDING_APPROVAL", result: null, approvalId };
    }

    // ── Stages: sandbox+invoke → output validation → audit/metrics/event ──
    const outcome = await this.performInvocation(
      executionId,
      tool,
      descriptor,
      validatedInput,
      ctx,
      policy.concurrencyLimit,
      context,
      toolName,
      startTime,
    );
    if (outcome.status === "FAILED") {
      throw new BadRequestException(`Tool invocation failed: ${outcome.error}`);
    }
    return { success: true, executionId, status: "COMPLETED", result: outcome.result };
  }

  /**
   * Resume an approved run in the background. Re-resolves the tool from its
   * persisted history row and runs the invocation stages; approval/policy were
   * already satisfied when the run was first requested.
   */
  async resume(executionId: string): Promise<void> {
    const row = await this.prisma.toolExecutionHistory
      .findUnique({ where: { id: executionId } })
      .catch(() => null);
    if (row?.status !== "RUNNING") return;

    const tool = this.registry.get(row.toolName);
    const context: ExecuteContext = {
      orgId: row.organizationId,
      userId: row.runBy,
      source: "DIRECT",
    };
    if (!tool) {
      await this.recordFailure(
        executionId,
        { name: row.toolName, riskLevel: "LOW" } as ToolDescriptor,
        context,
        row.toolName,
        "Tool no longer registered",
        Date.now(),
        0,
      );
      return;
    }

    const descriptor = describeTool(tool.metadata);
    const abort = new AbortController();
    const ctx = this.buildContext(
      executionId,
      context,
      Date.now() + descriptor.timeoutMs,
      abort.signal,
    );
    const input = (row.arguments ?? {}) as Record<string, unknown>;

    await this.performInvocation(
      executionId,
      tool,
      descriptor,
      input,
      ctx,
      null,
      context,
      row.toolName,
      Date.now(),
    );
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /** Invoke (sandbox+retry) → output validation → record. Never throws. */
  private async performInvocation(
    executionId: string,
    tool: Tool,
    descriptor: ToolDescriptor,
    input: Record<string, unknown>,
    ctx: ToolExecutionContext,
    concurrencyLimit: number | null,
    context: ExecuteContext,
    toolName: string,
    startTime: number,
  ): Promise<{ status: "COMPLETED" | "FAILED"; result?: unknown; error?: string }> {
    const runState = { attempts: 0 };
    try {
      const result = await this.invokeWithRetry(
        tool,
        descriptor,
        input,
        ctx,
        concurrencyLimit,
        context,
        toolName,
        runState,
      );
      if (descriptor.outputSchema) {
        const outParsed = descriptor.outputSchema.safeParse(result);
        if (!outParsed.success) {
          throw new Error(`Output validation failed: ${outParsed.error.message}`);
        }
      }
      await this.recordSuccess(
        executionId,
        descriptor,
        context,
        toolName,
        result,
        startTime,
        runState.attempts,
      );
      return { status: "COMPLETED", result };
    } catch (err) {
      const message = (err as Error).message;
      await this.recordFailure(
        executionId,
        descriptor,
        context,
        toolName,
        message,
        startTime,
        runState.attempts,
      );
      return { status: "FAILED", error: message };
    }
  }

  private buildContext(
    executionId: string,
    context: ExecuteContext,
    deadline: number,
    signal: AbortSignal,
  ): ToolExecutionContext {
    return {
      executionId,
      organizationId: context.orgId,
      userId: context.userId,
      actorType: "USER",
      source: context.source ?? "DIRECT",
      signal,
      deadline,
      metadata: {},
      getSecret: (key: string) => this.credentialManager.resolveSecret(context.orgId, key),
      log: (level: ToolLogLevel, message: string, data?: Record<string, unknown>) =>
        this.logRun(executionId, level, message, data),
    };
  }

  private async invokeWithRetry(
    tool: Tool,
    descriptor: ToolDescriptor,
    input: Record<string, unknown>,
    ctx: ToolExecutionContext,
    concurrencyLimit: number | null,
    context: ExecuteContext,
    toolName: string,
    runState: { attempts: number },
  ): Promise<unknown> {
    const { maxAttempts, initialDelayMs, backoffFactor } = descriptor.retryPolicy;
    const bucket = `${context.orgId}:${toolName}`;
    const concurrency = concurrencyLimit ?? Number.MAX_SAFE_INTEGER;
    let lastError: Error = new Error("Tool did not run");

    while (runState.attempts < maxAttempts) {
      runState.attempts += 1;
      try {
        return await this.sandbox.run(
          { bucket, concurrency, timeoutMs: descriptor.timeoutMs, signal: ctx.signal },
          (signal) => this.registry.invoke(tool, input, { ...ctx, signal }),
        );
      } catch (err) {
        lastError = err as Error;
        if (runState.attempts >= maxAttempts) break;
        const delay = initialDelayMs * Math.pow(backoffFactor, runState.attempts - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  /** Record a denial (permission/input/policy), emit + audit, and throw. */
  private async deny(
    executionId: string,
    descriptor: ToolDescriptor,
    context: ExecuteContext,
    code: StageDenyCode,
    reason: string,
    startTime: number,
  ): Promise<never> {
    await this.tryWrite(() =>
      this.prisma.toolExecutionHistory.create({
        data: {
          id: executionId,
          organizationId: context.orgId,
          toolName: descriptor.name,
          arguments: {},
          status: "REJECTED",
          source: context.source ?? "DIRECT",
          riskLevel: descriptor.riskLevel,
          error: reason,
          runBy: context.userId,
          runByType: "USER",
          startedAt: new Date(),
        },
      }),
    );

    this.metrics?.recordToolExecution(descriptor.name, "rejected", (Date.now() - startTime) / 1000);
    this.events.emit("tool.execution.rejected", {
      executionId,
      organizationId: context.orgId,
      toolName: descriptor.name,
      userId: context.userId,
      code,
      reason,
    });
    this.events.emit("tool.policy.violation", {
      organizationId: context.orgId,
      toolName: descriptor.name,
      userId: context.userId,
      code,
      reason,
    });
    await this.audit.record({
      organizationId: context.orgId,
      actorId: context.userId,
      actorType: "USER",
      action: "tool.rejected",
      resourceType: "tool",
      resourceId: descriptor.name,
      metadata: { executionId, code, reason },
    });

    throw this.toException(code, reason);
  }

  private async recordSuccess(
    executionId: string,
    descriptor: ToolDescriptor,
    context: ExecuteContext,
    toolName: string,
    result: unknown,
    startTime: number,
    attempts: number,
  ): Promise<void> {
    const latencyMs = Date.now() - startTime;
    this.metrics?.recordToolExecution(toolName, "completed", latencyMs / 1000);
    await this.tryWrite(() =>
      this.prisma.toolExecutionHistory.update({
        where: { id: executionId },
        data: {
          status: "COMPLETED",
          output: result as Prisma.InputJsonValue,
          latencyMs,
          attempts,
          completedAt: new Date(),
        },
      }),
    );
    this.events.emit("tool.execution.completed", {
      executionId,
      organizationId: context.orgId,
      toolName,
      userId: context.userId,
      latencyMs,
      attempts,
    });
    await this.audit.record({
      organizationId: context.orgId,
      actorId: context.userId,
      actorType: "USER",
      action: "tool.completed",
      resourceType: "tool",
      resourceId: toolName,
      metadata: { executionId, latencyMs, attempts, riskLevel: descriptor.riskLevel },
    });
  }

  private async recordFailure(
    executionId: string,
    descriptor: ToolDescriptor,
    context: ExecuteContext,
    toolName: string,
    error: string,
    startTime: number,
    attempts: number,
  ): Promise<void> {
    const latencyMs = Date.now() - startTime;
    this.metrics?.recordToolExecution(toolName, "failed", latencyMs / 1000);
    await this.tryWrite(() =>
      this.prisma.toolExecutionHistory.update({
        where: { id: executionId },
        data: { status: "FAILED", error, latencyMs, attempts, completedAt: new Date() },
      }),
    );
    this.events.emit("tool.execution.failed", {
      executionId,
      organizationId: context.orgId,
      toolName,
      userId: context.userId,
      error,
      attempts,
    });
    await this.audit.record({
      organizationId: context.orgId,
      actorId: context.userId,
      actorType: "USER",
      action: "tool.failed",
      resourceType: "tool",
      resourceId: toolName,
      metadata: { executionId, error, attempts, riskLevel: descriptor.riskLevel },
    });
  }

  private toException(code: StageDenyCode, reason: string): Error {
    switch (code) {
      case "INPUT_VALIDATION_FAILED":
      case "OUTPUT_VALIDATION_FAILED":
        return new BadRequestException(reason);
      case "TOOL_NOT_FOUND":
        return new NotFoundException(reason);
      default:
        return new ForbiddenException(reason);
    }
  }

  private logRun(
    executionId: string,
    level: ToolLogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const line = `[${executionId}] ${message}`;
    if (level === "error") this.logger.error(line, data);
    else if (level === "warn") this.logger.warn(line);
    else this.logger.log(line);
  }

  /** Run a persistence side-effect, swallowing errors (e.g. missing DB in tests). */
  private async tryWrite(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch {
      // History/audit writes are best-effort; never fail a run on a logging error.
    }
  }
}
