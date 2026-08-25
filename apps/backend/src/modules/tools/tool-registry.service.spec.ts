import { Test } from "@nestjs/testing";
import { z } from "zod";
import { ToolRegistryService } from "./tool-registry.service";
import type { ToolMetadata } from "./tool.interface";
import { Tool } from "./tool.interface";
import { BadRequestException, NotFoundException } from "@nestjs/common";

class AddTool extends Tool {
  metadata: ToolMetadata = {
    name: "add",
    description: "Adds two numbers",
    inputSchema: z.object({
      a: z.number(),
      b: z.number(),
    }),
    timeoutMs: 100,
    retryAttempts: 1,
  };

  async execute(input: { a: number; b: number }): Promise<number> {
    return input.a + input.b;
  }
}

class FailureTool extends Tool {
  metadata: ToolMetadata = {
    name: "fail",
    description: "Always fails",
    inputSchema: z.object({}),
    retryAttempts: 1,
  };

  calls = 0;

  async execute(): Promise<void> {
    this.calls++;
    throw new Error("Transient Failure");
  }
}

class TimeoutTool extends Tool {
  metadata: ToolMetadata = {
    name: "slow",
    description: "Takes time",
    inputSchema: z.object({}),
    timeoutMs: 20,
  };

  async execute(): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return "done";
  }
}

describe("ToolRegistryService", () => {
  let service: ToolRegistryService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ToolRegistryService],
    }).compile();

    service = moduleRef.get<ToolRegistryService>(ToolRegistryService);
  });

  it("should register and retrieve tools", () => {
    const add = new AddTool();
    service.register(add);

    expect(service.get("add")).toBe(add);
    expect(service.getAll()).toContain(add);
  });

  it("executes registered tool with valid arguments", async () => {
    service.register(new AddTool());
    const result = await service.execute("add", { a: 5, b: 3 });
    expect(result).toBe(8);
  });

  it("throws NotFoundException when tool is missing", async () => {
    await expect(service.execute("missing", {})).rejects.toThrow(NotFoundException);
  });

  it("throws BadRequestException on validation failure", async () => {
    service.register(new AddTool());
    await expect(service.execute("add", { a: "five", b: 3 } as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("enforces tool execution timeouts", async () => {
    service.register(new TimeoutTool());
    await expect(service.execute("slow", {})).rejects.toThrow("Tool execution timed out");
  });

  it("applies retry policies on failure", async () => {
    const failTool = new FailureTool();
    service.register(failTool);

    await expect(service.execute("fail", {})).rejects.toThrow("Transient Failure");
    expect(failTool.calls).toBe(2); // Initial try + 1 retry
  });
});
