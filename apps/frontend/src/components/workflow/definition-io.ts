import type { Edge, Node } from "@xyflow/react";

import type { WorkflowConnection, WorkflowDefinition, WorkflowStep } from "@/lib/api/types";

/**
 * Pure conversion layer between the backend WorkflowDefinition JSON
 * (steps + connections) and React Flow's nodes + edges, plus layered
 * auto-layout and structural validation. No React imports — unit tested.
 */

export interface StepTypeMeta {
  type: string;
  label: string;
  description: string;
  /** design-token chart color index used for the node accent */
  colorVar: string;
  defaultConfig: Record<string, unknown>;
  /** executed natively by the current backend engine */
  native: boolean;
}

export const STEP_TYPES: StepTypeMeta[] = [
  {
    colorVar: "--chart-1",
    defaultConfig: {},
    description: "Entry point. Exactly one per workflow.",
    label: "Start",
    native: true,
    type: "START",
  },
  {
    colorVar: "--chart-2",
    defaultConfig: {
      promptTemplate: "Describe the task for the agent. Use {{ variables }} for interpolation.",
      systemPrompt: "You are a helpful assistant.",
    },
    description: "Qwen agent task with a prompt template.",
    label: "AI Agent",
    native: true,
    type: "AGENT_TASK",
  },
  {
    colorVar: "--chart-3",
    defaultConfig: { arguments: {}, toolName: "" },
    description: "Invoke a registered tool with arguments.",
    label: "Tool Call",
    native: true,
    type: "TOOL_CALL",
  },
  {
    colorVar: "--chart-4",
    defaultConfig: { expression: "step_id.output.includes('yes')" },
    description: "Branch on an expression — connect edges labelled true / false.",
    label: "Condition",
    native: true,
    type: "CONDITION",
  },
  {
    colorVar: "--chart-3",
    defaultConfig: { approverRole: "ADMIN", message: "Approval required to continue" },
    description: "Pause for human approval (runs via tool approval policies).",
    label: "Approval",
    native: false,
    type: "APPROVAL",
  },
  {
    colorVar: "--chart-2",
    defaultConfig: { durationMs: 60000 },
    description: "Wait a fixed duration before the next step.",
    label: "Delay",
    native: false,
    type: "DELAY",
  },
  {
    colorVar: "--chart-5",
    defaultConfig: { method: "POST", url: "https://" },
    description: "Call an external webhook endpoint.",
    label: "Webhook",
    native: false,
    type: "WEBHOOK",
  },
  {
    colorVar: "--chart-4",
    defaultConfig: { operation: "retrieve", query: "" },
    description: "Read or write organization memory.",
    label: "Memory",
    native: false,
    type: "MEMORY",
  },
  {
    colorVar: "--chart-1",
    defaultConfig: {},
    description: "Terminal step. At least one per workflow.",
    label: "End",
    native: true,
    type: "END",
  },
];

export const STEP_TYPE_MAP = new Map(STEP_TYPES.map((meta) => [meta.type, meta]));

export interface StepNodeData extends Record<string, unknown> {
  step: WorkflowStep;
}

export type StepNode = Node<StepNodeData>;

const NODE_WIDTH = 224;
const NODE_HEIGHT = 72;
const COLUMN_GAP = 80;
const ROW_GAP = 40;

/**
 * Layered auto-layout: BFS depth from the START step decides the column,
 * order of discovery decides the row. Steps unreachable from START are laid
 * out in a trailing column so nothing is ever hidden.
 */
export function layoutPositions(
  definition: WorkflowDefinition,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const outgoing = new Map<string, string[]>();

  for (const connection of definition.connections) {
    const list = outgoing.get(connection.fromStepId) ?? [];
    list.push(connection.toStepId);
    outgoing.set(connection.fromStepId, list);
  }

  const start = definition.steps.find((step) => step.type === "START");
  const depths = new Map<string, number>();

  if (start) {
    const queue: { id: string; depth: number }[] = [{ depth: 0, id: start.id }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      if (depths.has(current.id)) continue;
      depths.set(current.id, current.depth);
      for (const next of outgoing.get(current.id) ?? []) {
        if (!depths.has(next)) {
          queue.push({ depth: current.depth + 1, id: next });
        }
      }
    }
  }

  const maxDepth = depths.size > 0 ? Math.max(...depths.values()) : 0;
  const rows = new Map<number, number>();

  for (const step of definition.steps) {
    const depth = depths.get(step.id) ?? maxDepth + 1;
    const row = rows.get(depth) ?? 0;
    rows.set(depth, row + 1);
    positions.set(step.id, {
      x: depth * (NODE_WIDTH + COLUMN_GAP),
      y: row * (NODE_HEIGHT + ROW_GAP),
    });
  }

  return positions;
}

export function definitionToFlow(definition: WorkflowDefinition): {
  nodes: StepNode[];
  edges: Edge[];
} {
  const positions = layoutPositions(definition);

  const nodes: StepNode[] = definition.steps.map((step) => ({
    data: { step },
    id: step.id,
    position: positions.get(step.id) ?? { x: 0, y: 0 },
    type: "step",
  }));

  const edges: Edge[] = definition.connections.map((connection) => ({
    id: `${connection.fromStepId}->${connection.toStepId}${connection.label ? `:${connection.label}` : ""}`,
    label: connection.label,
    source: connection.fromStepId,
    target: connection.toStepId,
  }));

  return { edges, nodes };
}

export function flowToDefinition(nodes: StepNode[], edges: Edge[]): WorkflowDefinition {
  const steps: WorkflowStep[] = nodes.map((node) => node.data.step);
  const connections: WorkflowConnection[] = edges.map((edge) => ({
    fromStepId: edge.source,
    label: typeof edge.label === "string" && edge.label.length > 0 ? edge.label : undefined,
    toStepId: edge.target,
  }));
  return { connections, steps };
}

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
  stepId?: string;
}

/** Structural validation matching the backend engine's expectations. */
export function validateDefinition(definition: WorkflowDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const stepIds = new Set(definition.steps.map((step) => step.id));

  const startSteps = definition.steps.filter((step) => step.type === "START");
  if (startSteps.length === 0) {
    issues.push({ message: "Workflow must contain a START step.", severity: "error" });
  } else if (startSteps.length > 1) {
    issues.push({ message: "Workflow must contain exactly one START step.", severity: "error" });
  }

  if (!definition.steps.some((step) => step.type === "END")) {
    issues.push({ message: "Workflow should contain at least one END step.", severity: "warning" });
  }

  for (const connection of definition.connections) {
    if (!stepIds.has(connection.fromStepId) || !stepIds.has(connection.toStepId)) {
      issues.push({
        message: `Connection ${connection.fromStepId} → ${connection.toStepId} references a missing step.`,
        severity: "error",
      });
    }
  }

  // Reachability from START
  const start = startSteps[0];
  if (start) {
    const outgoing = new Map<string, string[]>();
    for (const connection of definition.connections) {
      const list = outgoing.get(connection.fromStepId) ?? [];
      list.push(connection.toStepId);
      outgoing.set(connection.fromStepId, list);
    }
    const reachable = new Set<string>();
    const queue = [start.id];
    while (queue.length > 0) {
      const current = queue.pop();
      if (!current || reachable.has(current)) continue;
      reachable.add(current);
      queue.push(...(outgoing.get(current) ?? []));
    }
    for (const step of definition.steps) {
      if (!reachable.has(step.id)) {
        issues.push({
          message: `Step "${step.name}" is unreachable from START.`,
          severity: "warning",
          stepId: step.id,
        });
      }
    }
  }

  for (const step of definition.steps) {
    if (step.type === "CONDITION") {
      const labels = definition.connections
        .filter((connection) => connection.fromStepId === step.id)
        .map((connection) => connection.label);
      if (!labels.includes("true") || !labels.includes("false")) {
        issues.push({
          message: `Condition "${step.name}" needs outgoing edges labelled "true" and "false".`,
          severity: "error",
          stepId: step.id,
        });
      }
    }
    if (step.type === "TOOL_CALL") {
      const toolName = step.config["toolName"];
      if (typeof toolName !== "string" || toolName.length === 0) {
        issues.push({
          message: `Tool step "${step.name}" is missing a toolName.`,
          severity: "error",
          stepId: step.id,
        });
      }
    }
    if (step.type === "AGENT_TASK") {
      const prompt = step.config["promptTemplate"];
      if (typeof prompt !== "string" || prompt.length === 0) {
        issues.push({
          message: `Agent step "${step.name}" is missing a promptTemplate.`,
          severity: "error",
          stepId: step.id,
        });
      }
    }
  }

  return issues;
}

let stepCounter = 0;

/** Create a fresh step of the given type with a unique id. */
export function createStep(type: string): WorkflowStep {
  const meta = STEP_TYPE_MAP.get(type);
  stepCounter += 1;
  const suffix = `${String(Date.now() % 100000)}${String(stepCounter)}`;
  return {
    config: { ...(meta?.defaultConfig ?? {}) },
    id: `${type.toLowerCase()}_${suffix}`,
    name: meta?.label ?? type,
    type,
  };
}

export const EMPTY_DEFINITION: WorkflowDefinition = {
  connections: [{ fromStepId: "start", toStepId: "end" }],
  steps: [
    { config: {}, id: "start", name: "Start", type: "START" },
    { config: {}, id: "end", name: "End", type: "END" },
  ],
};
