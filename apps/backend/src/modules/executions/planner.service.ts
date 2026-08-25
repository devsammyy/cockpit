import { Inject, Injectable, Logger } from "@nestjs/common";
import { LLM_PROVIDER, LlmProvider } from "../ai-provider/llm-provider.interface";

export interface ExecutionPlanStep {
  id: string;
  type: "AGENT_TASK" | "TOOL_CALL" | "CONDITION" | "END";
  name: string;
  config: Record<string, any>;
}

export interface ExecutionPlan {
  steps: ExecutionPlanStep[];
  reasoning: string;
}

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  constructor(@Inject(LLM_PROVIDER) private readonly llmProvider: LlmProvider) {}

  /**
   * Plan execution steps required to achieve a goal.
   */
  async generatePlan(goal: string, availableTools: string[]): Promise<ExecutionPlan> {
    const systemPrompt = `You are an expert AI Planner. Given a goal and a list of available tools, you must decompose the goal into a sequential plan of discrete steps.
Each step can be one of:
- AGENT_TASK: Invoke another AI agent with a prompt template.
- TOOL_CALL: Direct execution of a tool from the tool registry.
- CONDITION: A logical branch.
- END: Marks termination.

Available Tools: ${availableTools.join(", ")}

You MUST return a JSON object with:
- steps: array of steps (each having id, type, name, config)
- reasoning: text string describing why you chose this path.`;

    try {
      const response = await this.llmProvider.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Goal to plan: "${goal}"` },
        ],
        {
          responseFormat: { type: "json_object" },
          temperature: 0.1,
        },
      );

      const content = response.message.content;
      const plan = JSON.parse(content) as ExecutionPlan;

      // Simple post-validation
      if (!plan.steps || !Array.isArray(plan.steps)) {
        throw new Error("Invalid plan shape returned from model");
      }

      return plan;
    } catch (error) {
      this.logger.error("Failed to generate plan using LLM", error);
      throw error;
    }
  }
}
