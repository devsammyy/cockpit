import { describe, expect, test } from "vitest";

import type { WorkflowDefinition } from "@/lib/api/types";
import {
  createStep,
  definitionToFlow,
  flowToDefinition,
  layoutPositions,
  validateDefinition,
} from "./definition-io";

const SAMPLE: WorkflowDefinition = {
  connections: [
    { fromStepId: "start", toStepId: "classify" },
    { fromStepId: "classify", toStepId: "gate" },
    { fromStepId: "gate", label: "true", toStepId: "notify" },
    { fromStepId: "gate", label: "false", toStepId: "end" },
    { fromStepId: "notify", toStepId: "end" },
  ],
  steps: [
    { config: {}, id: "start", name: "Start", type: "START" },
    {
      config: { promptTemplate: "Classify {{ input }}" },
      id: "classify",
      name: "Classify",
      type: "AGENT_TASK",
    },
    {
      config: { expression: "classify.output.includes('x')" },
      id: "gate",
      name: "Gate",
      type: "CONDITION",
    },
    {
      config: { arguments: {}, toolName: "slack_send_message" },
      id: "notify",
      name: "Notify",
      type: "TOOL_CALL",
    },
    { config: {}, id: "end", name: "End", type: "END" },
  ],
};

describe("definition <-> flow round trip", () => {
  test("preserves steps, connections, and labels", () => {
    // Act
    const { nodes, edges } = definitionToFlow(SAMPLE);
    const roundTripped = flowToDefinition(nodes, edges);

    // Assert
    expect(roundTripped.steps).toHaveLength(SAMPLE.steps.length);
    expect(roundTripped.connections).toHaveLength(SAMPLE.connections.length);
    const trueEdge = roundTripped.connections.find((c) => c.label === "true");
    expect(trueEdge).toMatchObject({ fromStepId: "gate", toStepId: "notify" });
  });
});

describe("layoutPositions", () => {
  test("places steps in columns by BFS depth from START", () => {
    const positions = layoutPositions(SAMPLE);

    const startX = positions.get("start")?.x ?? -1;
    const classifyX = positions.get("classify")?.x ?? -1;
    const gateX = positions.get("gate")?.x ?? -1;

    expect(startX).toBeLessThan(classifyX);
    expect(classifyX).toBeLessThan(gateX);
    expect(positions.size).toBe(SAMPLE.steps.length);
  });

  test("still positions steps unreachable from START", () => {
    const withOrphan: WorkflowDefinition = {
      connections: SAMPLE.connections,
      steps: [...SAMPLE.steps, { config: {}, id: "orphan", name: "Orphan", type: "TOOL_CALL" }],
    };

    const positions = layoutPositions(withOrphan);

    expect(positions.has("orphan")).toBe(true);
  });
});

describe("validateDefinition", () => {
  test("valid definition returns no errors", () => {
    const issues = validateDefinition(SAMPLE).filter((issue) => issue.severity === "error");
    expect(issues).toHaveLength(0);
  });

  test("flags missing START", () => {
    const issues = validateDefinition({
      connections: [],
      steps: [{ config: {}, id: "end", name: "End", type: "END" }],
    });
    expect(issues.some((issue) => issue.message.includes("START"))).toBe(true);
  });

  test("flags condition without labelled branches", () => {
    const definition: WorkflowDefinition = {
      connections: [
        { fromStepId: "start", toStepId: "gate" },
        { fromStepId: "gate", toStepId: "end" },
      ],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        { config: { expression: "true" }, id: "gate", name: "Gate", type: "CONDITION" },
        { config: {}, id: "end", name: "End", type: "END" },
      ],
    };

    const issues = validateDefinition(definition);

    expect(issues.some((issue) => issue.severity === "error" && issue.stepId === "gate")).toBe(
      true,
    );
  });

  test("flags tool steps without a toolName and unreachable steps", () => {
    const definition: WorkflowDefinition = {
      connections: [{ fromStepId: "start", toStepId: "end" }],
      steps: [
        { config: {}, id: "start", name: "Start", type: "START" },
        { config: { arguments: {} }, id: "tool", name: "Tool", type: "TOOL_CALL" },
        { config: {}, id: "end", name: "End", type: "END" },
      ],
    };

    const issues = validateDefinition(definition);

    expect(issues.some((issue) => issue.message.includes("toolName"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("unreachable"))).toBe(true);
  });
});

describe("createStep", () => {
  test("creates unique ids and copies default config", () => {
    const first = createStep("AGENT_TASK");
    const second = createStep("AGENT_TASK");

    expect(first.id).not.toBe(second.id);
    expect(first.type).toBe("AGENT_TASK");
    expect(typeof first.config["promptTemplate"]).toBe("string");

    // default config must be a copy, not shared
    first.config["promptTemplate"] = "changed";
    expect(second.config["promptTemplate"]).not.toBe("changed");
  });
});
