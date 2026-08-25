import { Injectable } from "@nestjs/common";

import { ToolExecutorService } from "../../../tools/tool-executor.service";
import { StepExecutionContext, StepHandler, StepResult } from "../step-handler.interface";
import { resolveArgs } from "../template.util";
import { WorkflowStep } from "../workflow-definition.schema";

/**
 * TOOL_CALL — invokes a registered tool through the full production pipeline
 * (policy evaluation, approval gates, credential injection, history logging).
 * Config: toolName (required), arguments ({{ vars }} interpolated).
 */
@Injectable()
export class ToolCallHandler implements StepHandler {
  readonly type = "TOOL_CALL";

  constructor(private readonly toolExecutor: ToolExecutorService) {}

  async execute(step: WorkflowStep, context: StepExecutionContext): Promise<StepResult> {
    const toolName = String(step.config["toolName"] ?? "");
    const args = resolveArgs(
      (step.config["arguments"] as Record<string, any> | undefined) ?? {},
      context.variables,
    );

    const response = await this.toolExecutor.execute(toolName, args, {
      orgId: context.organizationId,
      userId: context.userId,
      // The workflow engine gates approvals at the step level, so the tool
      // executor must not open a second (blocking) approval here.
      source: "WORKFLOW",
    });

    return {
      output: { result: response?.result ?? response },
      toolCalls: 1,
    };
  }
}
