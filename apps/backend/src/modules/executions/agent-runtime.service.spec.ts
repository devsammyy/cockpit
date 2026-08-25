import { Test } from "@nestjs/testing";
import { z } from "zod";
import { AgentRuntimeService } from "./agent-runtime.service";
import { LLM_PROVIDER } from "../ai-provider/llm-provider.interface";
import { ToolRegistryService } from "../tools/tool-registry.service";
import { PromptBuilderService } from "./prompt-builder.service";
import { CostTrackerService } from "./cost-tracker.service";
import { TelemetryService } from "./telemetry.service";
import type { ToolMetadata } from "../tools/tool.interface";
import { Tool } from "../tools/tool.interface";

class MockTool extends Tool {
  metadata: ToolMetadata = {
    name: "format_date",
    description: "Formats date",
    inputSchema: z.object({
      epoch: z.number(),
    }),
  };

  async execute(input: { epoch: number }): Promise<string> {
    return `formatted:${input.epoch}`;
  }
}

describe("AgentRuntimeService", () => {
  let runtime: AgentRuntimeService;
  let toolRegistry: ToolRegistryService;
  let mockLlm: any;

  beforeEach(async () => {
    mockLlm = {
      chat: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentRuntimeService,
        ToolRegistryService,
        PromptBuilderService,
        CostTrackerService,
        TelemetryService,
        {
          provide: LLM_PROVIDER,
          useValue: mockLlm,
        },
      ],
    }).compile();

    runtime = moduleRef.get<AgentRuntimeService>(AgentRuntimeService);
    toolRegistry = moduleRef.get<ToolRegistryService>(ToolRegistryService);
  });

  it("executes tool calling loop until model stops", async () => {
    const mockTool = new MockTool();
    toolRegistry.register(mockTool);

    // First LLM call requests format_date tool
    mockLlm.chat.mockResolvedValueOnce({
      message: {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "format_date",
              arguments: JSON.stringify({ epoch: 12345 }),
            },
          },
        ],
      },
      finishReason: "tool_calls",
      usage: { promptTokens: 100000, completionTokens: 100000, totalTokens: 200000 },
    });

    // Second LLM call responds with final output
    mockLlm.chat.mockResolvedValueOnce({
      message: {
        role: "assistant",
        content: "Formatted date is 12345",
      },
      finishReason: "stop",
      usage: { promptTokens: 200000, completionTokens: 100000, totalTokens: 300000 },
    });

    const result = await runtime.run({
      agentId: "agent_1",
      executionId: "exec_1",
      systemPrompt: "System",
      userPrompt: "Format the epoch date 12345",
      availableTools: ["format_date"],
    });

    expect(result.output).toBe("Formatted date is 12345");
    expect(result.cost).toBeGreaterThan(0);
    expect(mockLlm.chat).toHaveBeenCalledTimes(2);
  });
});
