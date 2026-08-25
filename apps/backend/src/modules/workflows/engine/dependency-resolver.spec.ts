import {
  buildGraph,
  createInitialState,
  fireStep,
  isDrained,
  markCompleted,
  takeReadySteps,
  validateDefinition,
} from "./dependency-resolver";
import type { WorkflowDefinition } from "./workflow-definition.schema";

function seq(): WorkflowDefinition {
  return {
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
}

/** Drive the scheduler to completion, recording the order steps became ready. */
function runOrder(
  definition: WorkflowDefinition,
  branchFor: Record<string, string> = {},
): string[] {
  const graph = buildGraph(definition);
  const state = createInitialState(graph);
  const order: string[] = [];
  let guard = 0;

  while (!isDrained(state) && guard < 200) {
    guard += 1;
    for (const stepId of takeReadySteps(state)) {
      order.push(stepId);
      markCompleted(state, stepId);
      fireStep(graph, state, stepId, { branchLabel: branchFor[stepId] });
    }
  }
  return order;
}

describe("dependency-resolver — scheduling", () => {
  test("runs a sequential chain in order", () => {
    // Act
    const order = runOrder(seq());

    // Assert
    expect(order).toEqual(["start", "a", "b", "end"]);
  });

  test("activates parallel branches then joins", () => {
    // Arrange: start fans out to a and b, both join at j
    const definition: WorkflowDefinition = {
      connections: [
        { fromStepId: "start", toStepId: "a" },
        { fromStepId: "start", toStepId: "b" },
        { fromStepId: "a", toStepId: "j" },
        { fromStepId: "b", toStepId: "j" },
        { fromStepId: "j", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        { config: { promptTemplate: "x" }, id: "a", name: "A", type: "AGENT_TASK" },
        { config: { promptTemplate: "y" }, id: "b", name: "B", type: "AGENT_TASK" },
        { config: { promptTemplate: "z" }, id: "j", name: "Join", type: "AGENT_TASK" },
        { config: {}, id: "end", name: "End", type: "END" },
      ],
    };

    // Act
    const order = runOrder(definition);

    // Assert: a and b both run before the join, join runs exactly once
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("j"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("j"));
    expect(order.filter((id) => id === "j")).toHaveLength(1);
  });

  test("takes only the selected condition branch and skips the other", () => {
    // Arrange
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

    // Act
    const order = runOrder(definition, { gate: "true" });

    // Assert: the true branch ran, the false branch never became ready, end still fires
    expect(order).toContain("yes");
    expect(order).not.toContain("no");
    expect(order).toContain("end");
  });

  test("joins correctly when one incoming branch is skipped", () => {
    // Arrange: gate → (true: work) → join ; (false skip) also targets join
    const definition: WorkflowDefinition = {
      connections: [
        { fromStepId: "start", toStepId: "gate" },
        { fromStepId: "gate", label: "true", toStepId: "work" },
        { fromStepId: "gate", label: "false", toStepId: "join" },
        { fromStepId: "work", toStepId: "join" },
        { fromStepId: "join", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        { config: { expression: "true" }, id: "gate", name: "Gate", type: "CONDITION" },
        { config: { promptTemplate: "w" }, id: "work", name: "Work", type: "AGENT_TASK" },
        { config: { promptTemplate: "j" }, id: "join", name: "Join", type: "AGENT_TASK" },
        { config: {}, id: "end", name: "End", type: "END" },
      ],
    };

    // Act
    const order = runOrder(definition, { gate: "true" });

    // Assert: join runs once, after work
    expect(order).toContain("work");
    expect(order.filter((id) => id === "join")).toHaveLength(1);
    expect(order.indexOf("work")).toBeLessThan(order.indexOf("join"));
  });

  test("bounds loop re-entry by loop.maxIterations", () => {
    // Arrange: body loops back to itself twice, then exits
    const definition: WorkflowDefinition = {
      connections: [
        { fromStepId: "start", toStepId: "body" },
        { fromStepId: "body", label: "loop", toStepId: "body" },
        { fromStepId: "body", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        {
          config: { promptTemplate: "b" },
          id: "body",
          loop: { maxIterations: 3 },
          name: "Body",
          type: "AGENT_TASK",
        },
        { config: {}, id: "end", name: "End", type: "END" },
      ],
    };

    // Act
    const order = runOrder(definition);

    // Assert: body runs at most maxIterations times, run terminates
    const bodyRuns = order.filter((id) => id === "body").length;
    expect(bodyRuns).toBeGreaterThanOrEqual(1);
    expect(bodyRuns).toBeLessThanOrEqual(3);
    expect(order).toContain("end");
  });
});

describe("dependency-resolver — validation", () => {
  test("valid graph produces no errors", () => {
    const errors = validateDefinition(seq()).filter((issue) => issue.severity === "error");
    expect(errors).toHaveLength(0);
  });

  test("flags a disallowed cycle without a loop label", () => {
    const definition: WorkflowDefinition = {
      connections: [
        { fromStepId: "start", toStepId: "a" },
        { fromStepId: "a", toStepId: "b" },
        { fromStepId: "b", toStepId: "a" },
      ],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        { config: { promptTemplate: "x" }, id: "a", name: "A", type: "AGENT_TASK" },
        { config: { promptTemplate: "y" }, id: "b", name: "B", type: "AGENT_TASK" },
      ],
    };

    const errors = validateDefinition(definition).filter((issue) => issue.severity === "error");
    expect(errors.some((issue) => issue.message.includes("loop"))).toBe(true);
  });

  test("flags missing tool name and missing START", () => {
    const definition: WorkflowDefinition = {
      connections: [],
      steps: [{ config: {}, id: "t", name: "T", type: "TOOL_CALL" }],
    };
    const errors = validateDefinition(definition);
    expect(errors.some((issue) => issue.message.includes("toolName"))).toBe(true);
    expect(errors.some((issue) => issue.message.includes("START"))).toBe(true);
  });
});
