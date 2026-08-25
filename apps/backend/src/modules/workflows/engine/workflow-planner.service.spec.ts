import { WorkflowPlannerService } from "./workflow-planner.service";
import type { WorkflowDefinition } from "./workflow-definition.schema";

function makePlanner() {
  const structuredEngine = { parse: jest.fn() };
  const prisma = {} as never;
  const toolRegistry = { getAll: jest.fn().mockReturnValue([]) };
  return {
    prisma,
    service: new WorkflowPlannerService(structuredEngine as never, prisma, toolRegistry as never),
    structuredEngine,
    toolRegistry,
  };
}

describe("WorkflowPlannerService", () => {
  test("estimate() flags approval requirement and side-effect risk", () => {
    // Arrange
    const { service } = makePlanner();
    const definition: WorkflowDefinition = {
      connections: [],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        { config: { promptTemplate: "x" }, id: "a", name: "A", type: "AGENT_TASK" },
        { config: { toolName: "send" }, id: "t", name: "Send", type: "TOOL_CALL" },
        { config: { message: "ok" }, id: "ap", name: "Approve", type: "APPROVAL" },
        { config: {}, id: "end", name: "End", type: "END" },
      ],
    };

    // Act
    const estimates = service.estimate(definition);

    // Assert
    expect(estimates.approvalRequired).toBe(true);
    expect(estimates.estimatedCostMicroUsd).toBeGreaterThan(0);
    expect(estimates.risks.length).toBeGreaterThanOrEqual(1);
    expect(["MEDIUM", "HIGH"]).toContain(estimates.riskLevel);
  });

  test("falls back to a safe graph when the model returns an invalid definition", async () => {
    // Arrange: model returns a graph with no START
    const { service, structuredEngine } = makePlanner();
    structuredEngine.parse.mockResolvedValue({
      connections: [],
      steps: [{ config: {}, id: "x", name: "X", type: "END" }],
    });

    // Act
    const result = await service.plan("do a thing");

    // Assert: fallback graph is structurally valid (has START + END)
    expect(result.definition.steps.some((step) => step.type === "START")).toBe(true);
    expect(result.definition.steps.some((step) => step.type === "END")).toBe(true);
    expect(result.issues.filter((issue) => issue.includes("START"))).toHaveLength(0);
  });

  test("uses the model graph when it is valid", async () => {
    const { service, structuredEngine } = makePlanner();
    const valid: WorkflowDefinition = {
      connections: [
        { fromStepId: "start", toStepId: "a" },
        { fromStepId: "a", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        { config: { promptTemplate: "x" }, id: "a", name: "A", type: "AGENT_TASK" },
        { config: {}, id: "end", name: "End", type: "END" },
      ],
    };
    structuredEngine.parse.mockResolvedValue(valid);

    const result = await service.plan("do a valid thing");

    expect(result.definition.steps).toHaveLength(3);
    expect(result.definition.metadata).toBeDefined();
  });
});
