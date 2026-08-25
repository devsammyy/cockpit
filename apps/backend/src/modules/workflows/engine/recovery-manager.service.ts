import { Injectable, Logger } from "@nestjs/common";

import { ToolExecutorService } from "../../tools/tool-executor.service";
import { ExecutionEventsService } from "./execution-events.service";
import { StepExecutionContext } from "./step-handler.interface";
import { resolveArgs } from "./template.util";
import { DEFAULT_RETRY_POLICY, RetryPolicy, WorkflowStep } from "./workflow-definition.schema";

export interface CompensationEntry {
  step: WorkflowStep;
  context: StepExecutionContext;
}

/**
 * Failure recovery: bounded exponential-backoff retry for individual steps,
 * and compensation (saga-style reverse-order rollback) for a failed run.
 *
 * Compensations are tool calls declared on a step (step.compensation); the
 * orchestrator registers one after each successful side-effecting step and
 * asks the recovery manager to unwind them when the run ultimately fails.
 */
@Injectable()
export class RecoveryManagerService {
  private readonly logger = new Logger(RecoveryManagerService.name);

  constructor(
    private readonly toolExecutor: ToolExecutorService,
    private readonly events: ExecutionEventsService,
  ) {}

  /**
   * Run a step body with retry. onAttemptFailure fires between attempts so the
   * orchestrator can record STEP_RETRIED timeline events.
   */
  async withRetry<T>(
    step: WorkflowStep,
    body: () => Promise<T>,
    onAttemptFailure: (error: Error, attempt: number, nextDelayMs: number) => Promise<void>,
  ): Promise<T> {
    const policy: RetryPolicy = step.retry ?? DEFAULT_RETRY_POLICY;
    let attempt = 0;

    for (;;) {
      try {
        return await body();
      } catch (error) {
        attempt += 1;
        if (attempt >= policy.maxAttempts) {
          throw error;
        }
        const delay = policy.initialDelayMs * Math.pow(policy.backoffFactor, attempt - 1);
        await onAttemptFailure(error as Error, attempt, delay);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Compensate a failed run by executing each registered compensation in
   * reverse order. Best-effort: a failing compensation is logged and the
   * unwind continues (partial rollback is better than none).
   */
  async compensate(
    executionId: string,
    organizationId: string,
    entries: CompensationEntry[],
  ): Promise<{ compensated: number; failed: number }> {
    let compensated = 0;
    let failed = 0;

    for (const entry of [...entries].reverse()) {
      const compensation = entry.step.compensation;
      if (!compensation) continue;

      try {
        const args = resolveArgs(compensation.arguments, entry.context.variables);
        await this.toolExecutor.execute(compensation.toolName, args, {
          orgId: organizationId,
          userId: entry.context.userId,
          // Compensation is a rollback and must run without an approval gate.
          source: "WORKFLOW",
        });
        compensated += 1;
        await this.events.record(
          executionId,
          organizationId,
          "COMPENSATION_EXECUTED",
          `Compensated step "${entry.step.name}" via ${compensation.toolName}`,
          { stepId: entry.step.id, toolName: compensation.toolName },
        );
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Compensation for step ${entry.step.id} failed: ${(error as Error).message}`,
        );
        await this.events.record(
          executionId,
          organizationId,
          "COMPENSATION_EXECUTED",
          `Compensation for step "${entry.step.name}" FAILED: ${(error as Error).message}`,
          { failed: true, stepId: entry.step.id },
        );
      }
    }

    return { compensated, failed };
  }
}
