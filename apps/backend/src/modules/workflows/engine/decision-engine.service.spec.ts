import { DecisionEngineService } from "./decision-engine.service";
import type { WorkflowStep } from "./workflow-definition.schema";

function makeService(overrides?: {
  policy?: { allowed: boolean; requiresApproval: boolean; reason?: string };
  handled?: boolean;
}) {
  const policyEngine = {
    evaluate: jest
      .fn()
      .mockResolvedValue(overrides?.policy ?? { allowed: true, requiresApproval: false }),
  };
  const registry = {
    has: jest.fn().mockReturnValue(overrides?.handled ?? true),
  };
  const prisma = {} as never;
  return {
    policyEngine,
    registry,
    service: new DecisionEngineService(prisma, policyEngine as never, registry as never),
  };
}

const baseContext = {
  failureCount: 0,
  organizationId: "org",
  userId: "user",
  variables: {},
};

describe("DecisionEngineService", () => {
  test("proceeds on a low-risk agent step", async () => {
    // Arrange
    const { service } = makeService();
    const step: WorkflowStep = {
      config: { promptTemplate: "x" },
      id: "a",
      name: "A",
      type: "AGENT_TASK",
    };

    // Act
    const decision = await service.evaluate(step, baseContext);

    // Assert
    expect(decision.action).toBe("PROCEED");
    expect(decision.confidence).toBeGreaterThan(0.5);
  });

  test("blocks a step whose type has no handler", async () => {
    const { service } = makeService({ handled: false });
    const step: WorkflowStep = { config: {}, id: "x", name: "X", type: "MYSTERY" };

    const decision = await service.evaluate(step, baseContext);

    expect(decision.action).toBe("BLOCK");
    expect(decision.riskScore).toBe(1);
  });

  test("blocks a tool call denied by policy", async () => {
    const { service } = makeService({
      policy: { allowed: false, reason: "not permitted", requiresApproval: false },
    });
    const step: WorkflowStep = {
      config: { toolName: "danger" },
      id: "t",
      name: "T",
      type: "TOOL_CALL",
    };

    const decision = await service.evaluate(step, baseContext);

    expect(decision.action).toBe("BLOCK");
  });

  test("requires approval when policy demands it", async () => {
    const { service } = makeService({
      policy: { allowed: true, requiresApproval: true },
    });
    const step: WorkflowStep = {
      config: { toolName: "spend" },
      id: "t",
      name: "T",
      type: "TOOL_CALL",
    };

    const decision = await service.evaluate(step, baseContext);

    expect(decision.action).toBe("REQUIRE_APPROVAL");
  });

  test("escalates risk as failures accumulate", async () => {
    const { service } = makeService();
    const step: WorkflowStep = { config: { toolName: "x" }, id: "t", name: "T", type: "TOOL_CALL" };

    const calm = await service.evaluate(step, baseContext);
    const rattled = await service.evaluate(step, { ...baseContext, failureCount: 4 });

    expect(rattled.riskScore).toBeGreaterThan(calm.riskScore);
  });

  test("honors an explicit requiresApproval flag on the step", async () => {
    const { service } = makeService();
    const step: WorkflowStep = {
      config: { promptTemplate: "x", requiresApproval: true },
      id: "a",
      name: "A",
      type: "AGENT_TASK",
    };

    const decision = await service.evaluate(step, baseContext);

    expect(decision.action).toBe("REQUIRE_APPROVAL");
  });
});
