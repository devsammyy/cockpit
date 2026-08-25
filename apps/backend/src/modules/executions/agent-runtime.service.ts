import { Inject, Injectable, Logger } from "@nestjs/common";
import { ChatOptions } from "@qwen-autopilot/shared-types";
import { LLM_PROVIDER, LlmProvider } from "../ai-provider/llm-provider.interface";
import { ToolRegistryService } from "../tools/tool-registry.service";
import { PromptBuilderService } from "./prompt-builder.service";
import { CostTrackerService } from "./cost-tracker.service";
import { TelemetryService } from "./telemetry.service";

export interface AgentRunOptions {
  agentId: string;
  executionId: string;
  systemPrompt: string;
  userPrompt: string;
  availableTools?: string[];
  memoryContext?: string;
  modelConfig?: {
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
}

@Injectable()
export class AgentRuntimeService {
  private readonly logger = new Logger(AgentRuntimeService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llmProvider: LlmProvider,
    private readonly toolRegistry: ToolRegistryService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly costTracker: CostTrackerService,
    private readonly telemetry: TelemetryService,
  ) {}

  /**
   * Orchestrates the agent execution loop, calling the LLM and handling any requested tool calls sequentially.
   */
  async run(options: AgentRunOptions): Promise<{ output: string; tokenUsage: any; cost: number }> {
    const {
      agentId,
      executionId,
      systemPrompt,
      userPrompt,
      availableTools = [],
      memoryContext,
    } = options;
    const model = options.modelConfig?.model ?? "qwen-plus";

    this.logger.log(`Starting execution run for agent ${agentId} on execution ${executionId}`);
    const startTime = Date.now();
    this.telemetry.incrementCounter("agent.runs");

    // Retrieve and format tools from registry
    const toolPayloads: any[] = [];
    for (const toolName of availableTools) {
      const tool = this.toolRegistry.get(toolName);
      if (tool) {
        toolPayloads.push({
          type: "function",
          function: {
            name: tool.metadata.name,
            description: tool.metadata.description,
            parameters: this.zodToJsonSchema(tool.metadata.inputSchema),
          },
        });
      }
    }

    const messages = this.promptBuilder.build({
      systemPrompt,
      userPrompt,
      memoryContext,
    });

    let toolCallsCount = 0;
    const limitToolCalls = 5; // Safety limit
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    while (true) {
      const chatOptions: ChatOptions = {
        temperature: options.modelConfig?.temperature ?? 0.7,
        maxTokens: options.modelConfig?.maxTokens,
        tools: toolPayloads.length > 0 ? toolPayloads : undefined,
      };

      const response = await this.llmProvider.chat(messages, chatOptions);

      if (response.usage) {
        totalPromptTokens += response.usage.promptTokens;
        totalCompletionTokens += response.usage.completionTokens;
      }

      const assistantMessage = response.message;
      messages.push(assistantMessage);

      if (assistantMessage.toolCalls && assistantMessage.toolCalls.length > 0) {
        toolCallsCount++;
        if (toolCallsCount > limitToolCalls) {
          throw new Error(
            `Execution aborted: agent exceeded safety threshold of ${limitToolCalls} tool loops`,
          );
        }

        // Execute all requested tool calls in parallel or sequence
        for (const call of assistantMessage.toolCalls) {
          this.logger.log(`Agent requested tool execution: ${call.function.name}`);
          this.telemetry.incrementCounter(`tool.${call.function.name}.invocations`);

          try {
            const args = JSON.parse(call.function.arguments);
            const toolResult = await this.toolRegistry.execute(call.function.name, args);

            messages.push({
              role: "tool",
              content: JSON.stringify(toolResult),
              toolCallId: call.id,
            });
          } catch (error) {
            messages.push({
              role: "tool",
              content: JSON.stringify({ error: (error as Error).message }),
              toolCallId: call.id,
            });
          }
        }
      } else {
        // Output text ready
        const usage = {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
        };

        const cost = await this.costTracker.track(executionId, model, usage);
        this.telemetry.recordLatency("agent.execution.time", Date.now() - startTime);

        return {
          output: assistantMessage.content,
          tokenUsage: usage,
          cost,
        };
      }
    }
  }

  private zodToJsonSchema(schema: any): any {
    if (schema._def?.typeName === "ZodObject") {
      const properties: Record<string, any> = {};
      const required: string[] = [];
      const shape = schema._def.shape();
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value);
        if (!(value as any).isOptional()) {
          required.push(key);
        }
      }
      return {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }
    if (schema._def?.typeName === "ZodString") {
      return { type: "string" };
    }
    if (schema._def?.typeName === "ZodNumber") {
      return { type: "number" };
    }
    if (schema._def?.typeName === "ZodBoolean") {
      return { type: "boolean" };
    }
    if (schema._def?.typeName === "ZodArray") {
      return {
        type: "array",
        items: this.zodToJsonSchema(schema._def.type),
      };
    }
    return { type: "string" };
  }
}
