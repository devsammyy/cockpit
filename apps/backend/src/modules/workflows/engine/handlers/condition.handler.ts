import { Injectable } from "@nestjs/common";

import { StepExecutionContext, StepHandler, StepResult } from "../step-handler.interface";
import { evaluateExpression } from "../template.util";
import { WorkflowStep } from "../workflow-definition.schema";

/**
 * CONDITION — evaluates config.expression against the variable bag and
 * selects the outgoing edge labelled "true" or "false".
 */
@Injectable()
export class ConditionHandler implements StepHandler {
  readonly type = "CONDITION";

  async execute(step: WorkflowStep, context: StepExecutionContext): Promise<StepResult> {
    const expression = String(step.config["expression"] ?? "false");
    const result = evaluateExpression(expression, context.variables);

    return {
      branchLabel: result ? "true" : "false",
      output: { expression, result },
    };
  }
}
