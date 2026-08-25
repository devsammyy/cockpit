import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { ReflectionEngineService } from "../../memory/reflection-engine.service";
import { DecisionEngineService } from "./decision-engine.service";
import {
  buildGraph,
  createInitialState,
  fireStep,
  Graph,
  isDrained,
  currentIteration,
  markCompleted,
  SchedulerState,
  takeReadySteps,
} from "./dependency-resolver";
import { ExecutionEventsService } from "./execution-events.service";
import { assertTransition, ExecutionStatus, TERMINAL_STATUSES } from "./execution-state";
import { CompensationEntry, RecoveryManagerService } from "./recovery-manager.service";
import { StepExecutionContext, StepResult } from "./step-handler.interface";
import { StepHandlerRegistry } from "./step-handler.registry";
import {
  DEFAULT_STEP_TIMEOUT_MS,
  WorkflowDefinition,
  WorkflowStep,
} from "./workflow-definition.schema";

/** Reserved variable-bag key holding checkpointed engine state. */
const ENGINE_KEY = "__engine";
/** Global safety bound on total step activations per run. */
const MAX_STEP_ACTIVATIONS = 500;

interface EngineCheckpoint {
  scheduler: SchedulerState;
  pausedSteps: string[];
  compensations: { stepId: string }[];
  accounting: { tokens: number; cost: number; toolCalls: number };
  failureCount: number;
}

export interface InlineRunInput {
  workflowId: string;
  workflowName: string;
  definition: WorkflowDefinition;
  input: Record<string, any>;
  organizationId: string;
  userId: string;
  depth: number;
  parentExecutionId?: string;
}

export interface InlineRunResult {
  executionId: string;
  status: ExecutionStatus;
  variables: Record<string, any>;
  tokensUsed: number;
  costMicroUsd: number;
}

/**
 * The execution orchestrator core.
 *
 * Drives a workflow definition to completion using the token-based dependency
 * resolver, persisting a full checkpoint after every wave so a run survives
 * process restarts, approval pauses, and manual pause/resume. Contains no
 * node-type-specific logic — each step is dispatched to its handler via the
 * registry. Failure handling (retry, compensation) and runtime gating
 * (decision engine) are delegated to their respective services.
 */
@Injectable()
export class WorkflowExecutorService {
  private readonly logger = new Logger(WorkflowExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: StepHandlerRegistry,
    private readonly decisionEngine: DecisionEngineService,
    private readonly recovery: RecoveryManagerService,
    private readonly events: ExecutionEventsService,
    private readonly reflection: ReflectionEngineService,
  ) {}

  /**
   * Drive a persisted execution (queue entry point). Loads state, runs until
   * the graph drains, an approval pauses it, or it is cancelled.
   */
  async runExecution(
    executionId: string,
    options: { resume?: boolean; approvedStepId?: string } = {},
  ): Promise<void> {
    const execution = await this.prisma.execution.findUnique({ where: { id: executionId } });
    if (!execution) {
      this.logger.error(`Execution ${executionId} not found`);
      return;
    }
    if (TERMINAL_STATUSES.has(execution.status)) {
      this.logger.warn(`Execution ${executionId} already terminal (${execution.status})`);
      return;
    }

    const workflow = await this.prisma.workflow.findUnique({ where: { id: execution.workflowId } });
    if (!workflow) {
      await this.fail(
        executionId,
        execution.organizationId,
        "start",
        "Workflow definition missing",
      );
      return;
    }

    const definition = workflow.definition as unknown as WorkflowDefinition;
    let graph: Graph;
    try {
      graph = buildGraph(definition);
    } catch (error) {
      await this.fail(executionId, execution.organizationId, "start", (error as Error).message);
      return;
    }

    const variables = (execution.variables as Record<string, any> | null) ?? {};
    const checkpoint = this.loadCheckpoint(variables, graph);

    const context = {
      definition,
      depth: 0,
      executionId,
      graph,
      organizationId: execution.organizationId,
      userId: execution.triggeredBy ?? "system",
      variables,
    };

    if (options.resume) {
      const resumed = await this.applyResume(context, checkpoint, options.approvedStepId);
      if (!resumed) return; // still waiting on other approvals
    } else if (execution.startedAt === null) {
      await this.transition(executionId, execution.status, "RUNNING");
      await this.prisma.execution.update({
        data: { startedAt: new Date() },
        where: { id: executionId },
      });
      await this.events.record(
        executionId,
        execution.organizationId,
        "EXECUTION_STARTED",
        `Execution started for workflow "${workflow.name}"`,
      );
    } else {
      await this.transition(executionId, execution.status, "RUNNING");
    }

    await this.drive(context, checkpoint, workflow.name);
  }

  /**
   * Synchronous inline run used by sub-workflows and integration tests.
   * Approval pauses are not permitted inline — an APPROVAL step inside a
   * sub-workflow fails fast rather than deadlocking the parent.
   */
  async runInline(input: InlineRunInput): Promise<InlineRunResult> {
    const executionId = crypto.randomUUID();
    const versionId = crypto.randomUUID();

    await this.prisma.workflowVersion
      .create({
        data: {
          changelog: "inline sub-workflow run",
          definition: input.definition as any,
          id: versionId,
          publishedBy: input.userId,
          triggerConfig: {},
          versionNumber: 1,
          workflowId: input.workflowId,
        },
      })
      .catch(() => undefined);

    await this.prisma.execution.create({
      data: {
        id: executionId,
        input: input.input as any,
        organizationId: input.organizationId,
        parentExecutionId: input.parentExecutionId,
        startedAt: new Date(),
        status: "RUNNING",
        triggeredBy: input.userId,
        triggerType: "SUB_WORKFLOW",
        // `input` namespace so {{ input.field }} resolves; flat spread kept too.
        variables: { input: input.input, ...input.input },
        workflowId: input.workflowId,
        workflowVersionId: versionId,
      },
    });

    const graph = buildGraph(input.definition);
    const variables: Record<string, any> = { input: input.input, ...input.input };
    const checkpoint = this.loadCheckpoint(variables, graph);

    const context = {
      definition: input.definition,
      depth: input.depth,
      executionId,
      graph,
      organizationId: input.organizationId,
      userId: input.userId,
      variables,
    };

    await this.drive(context, checkpoint, input.workflowName, { inline: true });

    const finalExecution = await this.prisma.execution.findUnique({ where: { id: executionId } });
    return {
      costMicroUsd: checkpoint.accounting.cost,
      executionId,
      status: (finalExecution?.status as ExecutionStatus | undefined) ?? "FAILED",
      tokensUsed: checkpoint.accounting.tokens,
      variables: this.publicVariables(variables),
    };
  }

  // ── Core drive loop ──

  private async drive(
    context: DriveContext,
    checkpoint: EngineCheckpoint,
    workflowName: string,
    options: { inline?: boolean } = {},
  ): Promise<void> {
    const compensationEntries: CompensationEntry[] = [];
    let activations = 0;

    try {
      while (!isDrained(checkpoint.scheduler)) {
        const wave = takeReadySteps(checkpoint.scheduler);
        const pausedThisWave: string[] = [];

        for (const stepId of wave) {
          const step = context.graph.stepsById.get(stepId);
          if (!step) continue;

          activations += 1;
          if (activations > MAX_STEP_ACTIVATIONS) {
            throw new Error(`Execution exceeded ${String(MAX_STEP_ACTIVATIONS)} step activations`);
          }

          if (step.type === "START" || step.type === "END") {
            markCompleted(checkpoint.scheduler, stepId);
            fireStep(context.graph, checkpoint.scheduler, stepId);
            continue;
          }

          const outcome = await this.runStep(context, checkpoint, step, compensationEntries);
          if (outcome.kind === "paused") {
            pausedThisWave.push(stepId);
            continue;
          }
          if (outcome.kind === "failed") {
            await this.handleRunFailure(
              context,
              checkpoint,
              compensationEntries,
              step,
              workflowName,
              outcome.error,
            );
            return;
          }
        }

        await this.checkpoint(context, checkpoint);

        if (pausedThisWave.length > 0 && !options.inline) {
          checkpoint.pausedSteps = [...new Set([...checkpoint.pausedSteps, ...pausedThisWave])];
          await this.checkpoint(context, checkpoint);
          await this.transition(context.executionId, "RUNNING", "WAITING_APPROVAL");
          await this.events.record(
            context.executionId,
            context.organizationId,
            "EXECUTION_PAUSED",
            `Execution waiting on ${String(pausedThisWave.length)} approval(s)`,
          );
          return;
        }
        if (pausedThisWave.length > 0 && options.inline) {
          throw new Error("Approval steps are not permitted inside inline sub-workflows");
        }
      }

      await this.complete(context, checkpoint, workflowName);
    } catch (error) {
      this.logger.error(`Execution ${context.executionId} crashed: ${(error as Error).message}`);
      await this.handleRunFailure(
        context,
        checkpoint,
        compensationEntries,
        undefined,
        workflowName,
        error as Error,
      );
    }
  }

  /** Execute one step: decision gate → retry-wrapped handler → fire edges. */
  private async runStep(
    context: DriveContext,
    checkpoint: EngineCheckpoint,
    step: WorkflowStep,
    compensationEntries: CompensationEntry[],
  ): Promise<StepOutcome> {
    const stepContext: StepExecutionContext = {
      depth: context.depth,
      executionId: context.executionId,
      iteration: currentIteration(checkpoint.scheduler, step.id),
      organizationId: context.organizationId,
      userId: context.userId,
      variables: context.variables,
    };

    await this.prisma.execution.update({
      data: { currentStepId: step.id },
      where: { id: context.executionId },
    });

    // 1. Runtime decision gate
    const decision = await this.decisionEngine.evaluate(step, {
      failureCount: checkpoint.failureCount,
      organizationId: context.organizationId,
      userId: context.userId,
      variables: context.variables,
    });
    await this.events.record(
      context.executionId,
      context.organizationId,
      "DECISION_EVALUATED",
      `Step "${step.name}": ${decision.action} (risk ${decision.riskScore.toFixed(2)})`,
      {
        action: decision.action,
        confidence: decision.confidence,
        reasons: decision.reasons,
        stepId: step.id,
      },
    );

    if (decision.action === "BLOCK") {
      await this.recordStep(
        context,
        step,
        stepContext.iteration,
        "FAILED",
        null,
        decision.reasons.join("; "),
      );
      return {
        error: new Error(decision.reasons.join("; ") || "Blocked by decision engine"),
        kind: "failed",
      };
    }

    // 2. Insert a synthetic approval gate when the decision demands one and the
    //    step is not itself an approval node.
    if (decision.action === "REQUIRE_APPROVAL" && step.type !== "APPROVAL") {
      const pauseResult = await this.runApprovalGate(context, step);
      await this.recordStep(
        context,
        step,
        stepContext.iteration,
        "WAITING_APPROVAL",
        pauseResult.output,
        null,
      );
      return { kind: "paused" };
    }

    const handler = this.registry.get(step.type);
    if (!handler) {
      await this.recordStep(
        context,
        step,
        stepContext.iteration,
        "FAILED",
        null,
        `No handler for "${step.type}"`,
      );
      return { error: new Error(`No handler for "${step.type}"`), kind: "failed" };
    }

    const startedAt = Date.now();
    await this.events.record(
      context.executionId,
      context.organizationId,
      "STEP_STARTED",
      `Step "${step.name}" (${step.type}) started`,
      { iteration: stepContext.iteration, stepId: step.id },
    );

    let result: StepResult;
    try {
      result = await this.recovery.withRetry(
        step,
        () =>
          this.withTimeout(
            handler.execute(step, stepContext),
            step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
            step.name,
          ),
        async (error, attempt, nextDelay) => {
          await this.events.record(
            context.executionId,
            context.organizationId,
            "STEP_RETRIED",
            `Step "${step.name}" attempt ${String(attempt)} failed: ${error.message} — retrying in ${String(nextDelay)}ms`,
            { attempt, stepId: step.id },
          );
        },
      );
    } catch (error) {
      checkpoint.failureCount += 1;
      const message = (error as Error).message;
      await this.recordStep(
        context,
        step,
        stepContext.iteration,
        "FAILED",
        null,
        message,
        Date.now() - startedAt,
      );
      await this.events.record(
        context.executionId,
        context.organizationId,
        "STEP_FAILED",
        `Step "${step.name}" failed: ${message}`,
        { stepId: step.id },
      );
      if (step.onFailure === "continue") {
        // Graceful degradation: record the error and keep going.
        context.variables[step.id] = { error: message, failed: true };
        markCompleted(checkpoint.scheduler, step.id);
        fireStep(context.graph, checkpoint.scheduler, step.id);
        return { kind: "completed" };
      }
      return { error: error as Error, kind: "failed" };
    }

    // 3. Approval pause returned by the handler
    if (result.pause) {
      context.variables[step.id] = result.output;
      await this.recordStep(
        context,
        step,
        stepContext.iteration,
        "WAITING_APPROVAL",
        result.output,
        null,
        Date.now() - startedAt,
      );
      return { kind: "paused" };
    }

    // 4. Success — accumulate accounting, register compensation, fire edges
    context.variables[step.id] = result.output;
    checkpoint.accounting.tokens += result.tokensUsed ?? 0;
    checkpoint.accounting.cost += result.costMicroUsd ?? 0;
    checkpoint.accounting.toolCalls += result.toolCalls ?? 0;

    if (step.compensation) {
      compensationEntries.push({ context: stepContext, step });
    }

    await this.recordStep(
      context,
      step,
      stepContext.iteration,
      "COMPLETED",
      result.output,
      null,
      Date.now() - startedAt,
      { tokensUsed: result.tokensUsed, toolCalls: result.toolCalls },
    );
    await this.events.record(
      context.executionId,
      context.organizationId,
      "STEP_COMPLETED",
      `Step "${step.name}" completed`,
      { branchLabel: result.branchLabel, stepId: step.id },
    );

    markCompleted(checkpoint.scheduler, step.id);
    const fired = fireStep(context.graph, checkpoint.scheduler, step.id, {
      branchLabel: result.branchLabel,
    });
    for (const skippedId of fired.skipped) {
      await this.markSkipped(context, skippedId);
    }
    if (fired.loopLimitExceeded.length > 0) {
      await this.events.record(
        context.executionId,
        context.organizationId,
        "STEP_SKIPPED",
        `Loop bound reached for step(s): ${fired.loopLimitExceeded.join(", ")}`,
      );
    }
    return { kind: "completed" };
  }

  private async runApprovalGate(context: DriveContext, step: WorkflowStep): Promise<StepResult> {
    // Delegates to the APPROVAL handler's coordinator by reusing the handler.
    const approvalHandler = this.registry.get("APPROVAL");
    if (!approvalHandler) {
      throw new Error("Decision engine required approval but no APPROVAL handler is registered");
    }
    const syntheticStep: WorkflowStep = {
      ...step,
      config: {
        approverRole: "ADMIN",
        message: `Runtime policy requires approval before "${step.name}"`,
        type: "PRE_EXECUTION",
      },
    };
    return approvalHandler.execute(syntheticStep, {
      depth: context.depth,
      executionId: context.executionId,
      iteration: 1,
      organizationId: context.organizationId,
      userId: context.userId,
      variables: context.variables,
    });
  }

  // ── Resume / completion / failure ──

  private async applyResume(
    context: DriveContext,
    checkpoint: EngineCheckpoint,
    approvedStepId?: string,
  ): Promise<boolean> {
    if (approvedStepId) {
      checkpoint.pausedSteps = checkpoint.pausedSteps.filter((id) => id !== approvedStepId);
      markCompleted(checkpoint.scheduler, approvedStepId);
      const step = context.graph.stepsById.get(approvedStepId);
      if (step) {
        await this.recordStep(context, step, 1, "COMPLETED", { approved: true }, null);
        fireStep(context.graph, checkpoint.scheduler, approvedStepId);
      }
    }

    // Still waiting on other approvals in the same wave.
    if (checkpoint.pausedSteps.length > 0) {
      await this.checkpoint(context, checkpoint);
      return false;
    }

    await this.transition(context.executionId, "WAITING_APPROVAL", "RUNNING");
    await this.events.record(
      context.executionId,
      context.organizationId,
      "EXECUTION_RESUMED",
      "Execution resumed after approval",
    );
    return true;
  }

  private async complete(
    context: DriveContext,
    checkpoint: EngineCheckpoint,
    workflowName: string,
  ): Promise<void> {
    const publicVars = this.publicVariables(context.variables);
    await this.transition(context.executionId, "RUNNING", "COMPLETED");
    await this.prisma.execution.update({
      data: {
        completedAt: new Date(),
        output: publicVars as any,
        totalCostEstimate: checkpoint.accounting.cost,
        totalToolCalls: checkpoint.accounting.toolCalls,
        totalTokensUsed: checkpoint.accounting.tokens,
        variables: context.variables as any,
      },
      where: { id: context.executionId },
    });
    await this.finalizeDuration(context.executionId);
    await this.events.record(
      context.executionId,
      context.organizationId,
      "EXECUTION_COMPLETED",
      `Workflow "${workflowName}" completed successfully`,
      { cost: checkpoint.accounting.cost, tokens: checkpoint.accounting.tokens },
    );
    await this.reflect(context, true, checkpoint);
  }

  private async handleRunFailure(
    context: DriveContext,
    checkpoint: EngineCheckpoint,
    compensationEntries: CompensationEntry[],
    step: WorkflowStep | undefined,
    workflowName: string,
    error?: Error,
  ): Promise<void> {
    const message = error?.message ?? `Failed at step "${step?.name ?? "unknown"}"`;

    if (compensationEntries.length > 0) {
      const result = await this.recovery.compensate(
        context.executionId,
        context.organizationId,
        compensationEntries,
      );
      this.logger.log(
        `Compensated ${String(result.compensated)} step(s) for failed execution ${context.executionId}`,
      );
    }

    await this.fail(
      context.executionId,
      context.organizationId,
      step?.id ?? "unknown",
      message,
      checkpoint,
      context.variables,
    );
    await this.events.record(
      context.executionId,
      context.organizationId,
      "EXECUTION_FAILED",
      `Workflow "${workflowName}" failed: ${message}`,
      { stepId: step?.id },
    );
    await this.reflect(context, false, checkpoint, message);
  }

  private async reflect(
    context: DriveContext,
    succeeded: boolean,
    checkpoint: EngineCheckpoint,
    feedback?: string,
  ): Promise<void> {
    try {
      const toolsUsed = Object.entries(context.variables)
        .filter(([key]) => !key.startsWith("__"))
        .flatMap(([, value]) =>
          value && typeof value === "object" && "result" in (value as object) ? ["tool"] : [],
        );
      await this.reflection.analyzeExecution(context.organizationId, context.executionId, {
        feedback: feedback ?? (succeeded ? "Completed cleanly" : undefined),
        succeeded,
        toolsUsed,
      });
      await this.events.record(
        context.executionId,
        context.organizationId,
        "REFLECTION_RECORDED",
        "Post-execution reflection recorded to memory",
      );
    } catch (error) {
      this.logger.warn(`Reflection failed for ${context.executionId}: ${(error as Error).message}`);
    }
    void checkpoint;
  }

  // ── Persistence helpers ──

  private loadCheckpoint(variables: Record<string, any>, graph: Graph): EngineCheckpoint {
    const stored = variables[ENGINE_KEY] as EngineCheckpoint | undefined;
    if (stored?.scheduler) {
      return stored;
    }
    return {
      accounting: { cost: 0, tokens: 0, toolCalls: 0 },
      compensations: [],
      failureCount: 0,
      pausedSteps: [],
      scheduler: createInitialState(graph),
    };
  }

  private async checkpoint(context: DriveContext, checkpoint: EngineCheckpoint): Promise<void> {
    context.variables[ENGINE_KEY] = checkpoint;
    // Flush the live accounting totals and a running duration on every
    // checkpoint (each pause/wave) so a RUNNING or WAITING_APPROVAL execution
    // reports real stats — otherwise the totals stay 0 until the run reaches a
    // terminal state and the detail view shows nothing while awaiting approval.
    const execution = await this.prisma.execution.findUnique({
      select: { startedAt: true },
      where: { id: context.executionId },
    });
    const runningDurationMs = execution?.startedAt
      ? Date.now() - new Date(execution.startedAt).getTime()
      : undefined;
    await this.prisma.execution.update({
      data: {
        totalCostEstimate: checkpoint.accounting.cost,
        totalTokensUsed: checkpoint.accounting.tokens,
        totalToolCalls: checkpoint.accounting.toolCalls,
        variables: context.variables as any,
        ...(runningDurationMs !== undefined ? { totalDurationMs: runningDurationMs } : {}),
      },
      where: { id: context.executionId },
    });
  }

  private publicVariables(variables: Record<string, any>): Record<string, any> {
    const clone: Record<string, any> = {};
    for (const [key, value] of Object.entries(variables)) {
      if (!key.startsWith("__")) clone[key] = value;
    }
    return clone;
  }

  private async transition(executionId: string, from: string, to: ExecutionStatus): Promise<void> {
    assertTransition(from, to);
    await this.prisma.execution.updateMany({
      data: { status: to },
      where: { id: executionId, status: from },
    });
  }

  private async fail(
    executionId: string,
    organizationId: string,
    stepId: string,
    message: string,
    checkpoint?: EngineCheckpoint,
    variables?: Record<string, any>,
  ): Promise<void> {
    await this.prisma.execution.updateMany({
      data: {
        errorMessage: message,
        errorStepId: stepId,
        failedAt: new Date(),
        status: "FAILED",
        ...(checkpoint
          ? {
              totalCostEstimate: checkpoint.accounting.cost,
              totalToolCalls: checkpoint.accounting.toolCalls,
              totalTokensUsed: checkpoint.accounting.tokens,
            }
          : {}),
        ...(variables ? { variables: variables as any } : {}),
      },
      where: { id: executionId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    });
    await this.finalizeDuration(executionId);
    void organizationId;
  }

  private async finalizeDuration(executionId: string): Promise<void> {
    const execution = await this.prisma.execution.findUnique({ where: { id: executionId } });
    if (execution?.startedAt) {
      const end = new Date(execution.completedAt ?? execution.failedAt ?? Date.now());
      const started = new Date(execution.startedAt);
      await this.prisma.execution.update({
        data: { totalDurationMs: end.getTime() - started.getTime() },
        where: { id: executionId },
      });
    }
  }

  private async recordStep(
    context: DriveContext,
    step: WorkflowStep,
    sequenceNumber: number,
    status: string,
    output: Record<string, unknown> | null,
    errorMessage: string | null,
    durationMs?: number,
    metrics?: { tokensUsed?: number; toolCalls?: number },
  ): Promise<void> {
    try {
      const existing = await this.prisma.stepExecution.findFirst({
        where: { executionId: context.executionId, sequenceNumber, stepId: step.id },
      });
      if (existing) {
        await this.prisma.stepExecution.update({
          data: {
            completedAt:
              TERMINAL_STATUSES.has(status) || status === "COMPLETED" ? new Date() : null,
            durationMs: durationMs ?? existing.durationMs,
            errorMessage,
            output: (output ?? undefined) as any,
            status,
            ...(metrics?.tokensUsed !== undefined ? { tokensUsed: metrics.tokensUsed } : {}),
            ...(metrics?.toolCalls !== undefined ? { toolCalls: metrics.toolCalls } : {}),
          },
          where: { id: existing.id },
        });
        return;
      }
      await this.prisma.stepExecution.create({
        data: {
          completedAt: status === "COMPLETED" || status === "FAILED" ? new Date() : null,
          durationMs,
          errorMessage,
          executionId: context.executionId,
          id: crypto.randomUUID(),
          input: {},
          output: (output ?? undefined) as any,
          sequenceNumber,
          startedAt: new Date(),
          status,
          stepId: step.id,
          stepType: step.type,
          ...(metrics?.tokensUsed !== undefined ? { tokensUsed: metrics.tokensUsed } : {}),
          ...(metrics?.toolCalls !== undefined ? { toolCalls: metrics.toolCalls } : {}),
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to record step ${step.id}: ${(error as Error).message}`);
    }
  }

  private async markSkipped(context: DriveContext, stepId: string): Promise<void> {
    const step = context.graph.stepsById.get(stepId);
    if (!step || step.type === "END") return;
    await this.recordStep(context, step, 0, "SKIPPED", null, null);
    await this.events.record(
      context.executionId,
      context.organizationId,
      "STEP_SKIPPED",
      `Step "${step.name}" skipped (branch not taken)`,
      { stepId },
    );
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Step "${label}" timed out after ${String(timeoutMs)}ms`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

interface DriveContext {
  executionId: string;
  organizationId: string;
  userId: string;
  variables: Record<string, any>;
  definition: WorkflowDefinition;
  graph: Graph;
  depth: number;
}

interface StepOutcome {
  kind: "completed" | "paused" | "failed";
  error?: Error;
}
