import { Injectable } from "@nestjs/common";

import { StepHandler, StepResult } from "../step-handler.interface";
import { WorkflowStep } from "../workflow-definition.schema";

/** Inline waits are capped; longer pauses belong in scheduled triggers. */
const MAX_INLINE_DELAY_MS = 5 * 60 * 1000;

/**
 * DELAY — waits config.durationMs (capped at 5 minutes inline) before the
 * next step. Longer business waits should be modelled as scheduled workflows.
 */
@Injectable()
export class DelayHandler implements StepHandler {
  readonly type = "DELAY";

  async execute(step: WorkflowStep): Promise<StepResult> {
    const requested = Number(step.config["durationMs"] ?? 1000);
    const durationMs = Math.min(Math.max(0, requested), MAX_INLINE_DELAY_MS);

    await new Promise((resolve) => setTimeout(resolve, durationMs));

    return { output: { waitedMs: durationMs } };
  }
}
