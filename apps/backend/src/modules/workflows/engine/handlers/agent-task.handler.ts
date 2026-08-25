import { Injectable } from "@nestjs/common";

import { AgentRuntimeService } from "../../../executions/agent-runtime.service";
import { StepExecutionContext, StepHandler, StepResult } from "../step-handler.interface";
import { compileTemplate } from "../template.util";
import { WorkflowStep } from "../workflow-definition.schema";

/**
 * AGENT_TASK — runs a Qwen agent turn (with optional tool calling) through
 * the shared agent runtime. Config:
 *   promptTemplate (required, {{ vars }} interpolated)
 *   systemPrompt, tools[], agentId, model, memoryContext
 */
@Injectable()
export class AgentTaskHandler implements StepHandler {
  readonly type = "AGENT_TASK";

  constructor(private readonly agentRuntime: AgentRuntimeService) {}

  async execute(step: WorkflowStep, context: StepExecutionContext): Promise<StepResult> {
    const config = step.config;
    const prompt = compileTemplate(String(config["promptTemplate"] ?? ""), context.variables);

    const result = await this.agentRuntime.run({
      agentId: typeof config["agentId"] === "string" ? config["agentId"] : "dynamic-agent",
      availableTools: Array.isArray(config["tools"]) ? (config["tools"] as string[]) : [],
      executionId: context.executionId,
      memoryContext:
        typeof config["memoryContext"] === "string" ? config["memoryContext"] : undefined,
      modelConfig: typeof config["model"] === "string" ? { model: config["model"] } : undefined,
      systemPrompt:
        typeof config["systemPrompt"] === "string"
          ? config["systemPrompt"]
          : "You are a helpful business process assistant.",
      userPrompt: prompt,
    });

    return {
      costMicroUsd: result.cost,
      output: { cost: result.cost, output: result.output },
      tokensUsed:
        typeof result.tokenUsage === "object" && result.tokenUsage !== null
          ? ((result.tokenUsage as { totalTokens?: number }).totalTokens ?? 0)
          : 0,
    };
  }
}
