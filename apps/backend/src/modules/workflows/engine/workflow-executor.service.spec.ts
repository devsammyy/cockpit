import { RecoveryManagerService } from "./recovery-manager.service";
import type { StepHandler } from "./step-handler.interface";
import { StepHandlerRegistry } from "./step-handler.registry";
import type { WorkflowDefinition } from "./workflow-definition.schema";
import { WorkflowExecutorService } from "./workflow-executor.service";

/**
 * In-memory stand-in for the subset of PrismaService the executor touches.
 * Enough to drive a full run and assert on final persisted state.
 */
class InMemoryPrisma {
  executions = new Map<string, any>();
  workflows = new Map<string, any>();
  steps: any[] = [];

  execution = {
    create: ({ data }: any) => {
      this.executions.set(data.id, { ...data });
      return Promise.resolve({ ...data });
    },
    findUnique: ({ where }: any) => Promise.resolve(this.clone(this.executions.get(where.id))),
    update: ({ data, where }: any) => {
      const current = this.executions.get(where.id);
      Object.assign(current, this.applyData(data));
      return Promise.resolve(this.clone(current));
    },
    updateMany: ({ data, where }: any) => {
      const current = this.executions.get(where.id);
      if (current && this.matches(current, where)) {
        Object.assign(current, this.applyData(data));
        return Promise.resolve({ count: 1 });
      }
      return Promise.resolve({ count: 0 });
    },
  };

  workflow = {
    findUnique: ({ where }: any) => Promise.resolve(this.clone(this.workflows.get(where.id))),
  };

  stepExecution = {
    findFirst: ({ where }: any) =>
      Promise.resolve(
        this.steps.find(
          (s) =>
            s.executionId === where.executionId &&
            s.stepId === where.stepId &&
            s.sequenceNumber === where.sequenceNumber,
        ) ?? null,
      ),
    create: ({ data }: any) => {
      this.steps.push({ ...data });
      return Promise.resolve({ ...data });
    },
    update: ({ data, where }: any) => {
      const step = this.steps.find((s) => s.id === where.id);
      if (step) Object.assign(step, this.applyData(data));
      return Promise.resolve(step);
    },
  };

  workflowVersion = { create: ({ data }: any) => Promise.resolve({ ...data }) };

  private matches(record: any, where: any): boolean {
    if (where.status === undefined) return true;
    if (typeof where.status === "string") return record.status === where.status;
    if (where.status.notIn) return !where.status.notIn.includes(record.status);
    if (where.status.in) return where.status.in.includes(record.status);
    return true;
  }

  private applyData(data: any): any {
    const clean: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      clean[key] = value;
    }
    return clean;
  }

  private clone(value: any): any {
    return value ? JSON.parse(JSON.stringify(value)) : null;
  }
}

function handler(type: string, impl: StepHandler["execute"]): StepHandler {
  return { execute: impl, type };
}

function makeExecutor(prisma: InMemoryPrisma, handlers: StepHandler[]) {
  const registry = new StepHandlerRegistry(handlers);
  const decisionEngine = {
    evaluate: jest
      .fn()
      .mockResolvedValue({ action: "PROCEED", confidence: 1, reasons: [], riskScore: 0 }),
  };
  const events = { list: jest.fn(), record: jest.fn().mockResolvedValue(undefined) };
  const toolExecutor = { execute: jest.fn().mockResolvedValue({ result: "compensated" }) };
  const recovery = new RecoveryManagerService(toolExecutor as never, events as never);
  const reflection = { analyzeExecution: jest.fn().mockResolvedValue(undefined) };

  const executor = new WorkflowExecutorService(
    prisma as never,
    registry,
    decisionEngine as never,
    recovery,
    events as never,
    reflection as never,
  );
  return { decisionEngine, events, executor, reflection, toolExecutor };
}

function seedRun(prisma: InMemoryPrisma, definition: WorkflowDefinition): string {
  const executionId = "exec-1";
  prisma.workflows.set("wf-1", { definition, id: "wf-1", name: "Test", organizationId: "org" });
  prisma.executions.set(executionId, {
    createdAt: new Date().toISOString(),
    id: executionId,
    input: {},
    organizationId: "org",
    startedAt: null,
    status: "PENDING",
    totalCostEstimate: 0,
    totalDurationMs: 0,
    totalTokensUsed: 0,
    totalToolCalls: 0,
    triggeredBy: "user",
    variables: {},
    workflowId: "wf-1",
  });
  return executionId;
}

const agentHandler = handler("AGENT_TASK", (step) =>
  Promise.resolve({ costMicroUsd: 5, output: { output: `ran ${step.id}` }, tokensUsed: 10 }),
);

describe("WorkflowExecutorService (integration)", () => {
  test("runs a sequential workflow to COMPLETED and accumulates accounting", async () => {
    // Arrange
    const prisma = new InMemoryPrisma();
    const definition: WorkflowDefinition = {
      connections: [
        { fromStepId: "start", toStepId: "a" },
        { fromStepId: "a", toStepId: "b" },
        { fromStepId: "b", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        { config: { promptTemplate: "x" }, id: "a", name: "A", type: "AGENT_TASK" },
        { config: { promptTemplate: "y" }, id: "b", name: "B", type: "AGENT_TASK" },
        { config: {}, id: "end", name: "End", type: "END" },
      ],
    };
    const executionId = seedRun(prisma, definition);
    const { executor, reflection } = makeExecutor(prisma, [agentHandler]);

    // Act
    await executor.runExecution(executionId);

    // Assert
    const execution = prisma.executions.get(executionId);
    expect(execution.status).toBe("COMPLETED");
    expect(execution.totalTokensUsed).toBe(20);
    expect(execution.totalCostEstimate).toBe(10);
    expect(execution.variables.a.output).toBe("ran a");
    expect(reflection.analyzeExecution).toHaveBeenCalledWith(
      "org",
      executionId,
      expect.objectContaining({ succeeded: true }),
    );
  });

  test("follows the selected condition branch", async () => {
    // Arrange
    const prisma = new InMemoryPrisma();
    const definition: WorkflowDefinition = {
      connections: [
        { fromStepId: "start", toStepId: "gate" },
        { fromStepId: "gate", label: "true", toStepId: "yes" },
        { fromStepId: "gate", label: "false", toStepId: "no" },
        { fromStepId: "yes", toStepId: "end" },
        { fromStepId: "no", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        { config: { expression: "true" }, id: "gate", name: "Gate", type: "CONDITION" },
        { config: { promptTemplate: "y" }, id: "yes", name: "Yes", type: "AGENT_TASK" },
        { config: { promptTemplate: "n" }, id: "no", name: "No", type: "AGENT_TASK" },
        { config: {}, id: "end", name: "End", type: "END" },
      ],
    };
    const executionId = seedRun(prisma, definition);
    const conditionHandler = handler("CONDITION", () =>
      Promise.resolve({ branchLabel: "true", output: { result: true } }),
    );
    const { executor } = makeExecutor(prisma, [agentHandler, conditionHandler]);

    // Act
    await executor.runExecution(executionId);

    // Assert
    const execution = prisma.executions.get(executionId);
    expect(execution.status).toBe("COMPLETED");
    expect(execution.variables.yes).toBeDefined();
    expect(execution.variables.no).toBeUndefined();
    const skipped = prisma.steps.find((s) => s.stepId === "no");
    expect(skipped?.status).toBe("SKIPPED");
  });

  test("fails the run and compensates prior side effects when a step throws", async () => {
    // Arrange: a compensable tool step, then a failing step
    const prisma = new InMemoryPrisma();
    const definition: WorkflowDefinition = {
      connections: [
        { fromStepId: "start", toStepId: "book" },
        { fromStepId: "book", toStepId: "boom" },
        { fromStepId: "boom", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        {
          compensation: { arguments: {}, toolName: "cancel_booking" },
          config: { toolName: "book" },
          id: "book",
          name: "Book",
          type: "TOOL_CALL",
        },
        { config: {}, id: "boom", name: "Boom", type: "FAIL_TASK" },
        { config: {}, id: "end", name: "End", type: "END" },
      ],
    };
    const executionId = seedRun(prisma, definition);
    const toolCallHandler = handler("TOOL_CALL", () =>
      Promise.resolve({ output: { result: "booked" }, toolCalls: 1 }),
    );
    const failHandler = handler("FAIL_TASK", () => Promise.reject(new Error("kaboom")));
    const { executor, toolExecutor } = makeExecutor(prisma, [toolCallHandler, failHandler]);

    // Act
    await executor.runExecution(executionId);

    // Assert
    const execution = prisma.executions.get(executionId);
    expect(execution.status).toBe("FAILED");
    expect(execution.errorMessage).toContain("kaboom");
    // Compensation for the successful "book" step was invoked
    expect(toolExecutor.execute).toHaveBeenCalledWith(
      "cancel_booking",
      expect.anything(),
      expect.objectContaining({ orgId: "org" }),
    );
  });

  test("onFailure=continue records the error and proceeds to completion", async () => {
    // Arrange
    const prisma = new InMemoryPrisma();
    const definition: WorkflowDefinition = {
      connections: [
        { fromStepId: "start", toStepId: "flaky" },
        { fromStepId: "flaky", toStepId: "after" },
        { fromStepId: "after", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        { config: {}, id: "flaky", name: "Flaky", onFailure: "continue", type: "FAIL_TASK" },
        { config: { promptTemplate: "x" }, id: "after", name: "After", type: "AGENT_TASK" },
        { config: {}, id: "end", name: "End", type: "END" },
      ],
    };
    const executionId = seedRun(prisma, definition);
    const failHandler = handler("FAIL_TASK", () => Promise.reject(new Error("soft fail")));
    const { executor } = makeExecutor(prisma, [agentHandler, failHandler]);

    // Act
    await executor.runExecution(executionId);

    // Assert
    const execution = prisma.executions.get(executionId);
    expect(execution.status).toBe("COMPLETED");
    expect(execution.variables.flaky.failed).toBe(true);
    expect(execution.variables.after).toBeDefined();
  });

  test("pauses at an approval and checkpoints to WAITING_APPROVAL", async () => {
    // Arrange
    const prisma = new InMemoryPrisma();
    const definition: WorkflowDefinition = {
      connections: [
        { fromStepId: "start", toStepId: "gate" },
        { fromStepId: "gate", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        { config: { message: "ok?" }, id: "gate", name: "Gate", type: "APPROVAL" },
        { config: {}, id: "end", name: "End", type: "END" },
      ],
    };
    const executionId = seedRun(prisma, definition);
    const approvalHandler = handler("APPROVAL", () =>
      Promise.resolve({
        output: { approvalId: "ap-1", requested: true },
        pause: { approvalId: "ap-1", reason: "APPROVAL" },
      }),
    );
    const { executor } = makeExecutor(prisma, [approvalHandler]);

    // Act
    await executor.runExecution(executionId);

    // Assert: run is parked, not completed
    const execution = prisma.executions.get(executionId);
    expect(execution.status).toBe("WAITING_APPROVAL");
    expect(execution.variables.__engine.pausedSteps).toContain("gate");
  });
});
