import type {
  WorkflowConnection,
  WorkflowDefinition,
  WorkflowStep,
} from "./workflow-definition.schema";
import { DEFAULT_LOOP_MAX_ITERATIONS, LOOP_EDGE_LABEL } from "./workflow-definition.schema";

/**
 * DAG scheduling for the execution orchestrator, implemented with token
 * ("firing") semantics so sequential, parallel, conditional, and bounded-loop
 * flows are handled by one algorithm:
 *
 * - Completing a step fires a REAL token along its selected outgoing edges
 *   (all edges for normal steps; the label-matched edge for CONDITION steps).
 * - Unselected condition branches fire SKIP tokens so join steps never wait
 *   forever on a branch that will not run.
 * - A step becomes READY when every incoming non-loop edge has delivered a
 *   token and at least one of them is REAL. All-skip means the step is
 *   SKIPPED and propagates skips downstream.
 * - Edges labelled "loop" are excluded from join accounting; a real token on
 *   a loop edge re-arms its target (bounded by loop.maxIterations).
 *
 * The whole scheduler state is a plain JSON-serializable object so the
 * orchestrator can checkpoint it after every wave and resume after process
 * restarts, approvals, or pauses.
 */

export interface SchedulerState {
  /** stepId -> incoming edge keys that have delivered a token this activation */
  arrivals: Record<string, Record<string, "real" | "skip">>;
  /** stepIds ready to execute in the next wave */
  ready: string[];
  /** stepId -> times the step has started (loop accounting) */
  iterations: Record<string, number>;
  /** steps that finished (COMPLETED) at least once */
  completed: string[];
  /** steps resolved as skipped */
  skipped: string[];
}

export interface Graph {
  stepsById: Map<string, WorkflowStep>;
  incoming: Map<string, WorkflowConnection[]>; // non-loop only
  outgoing: Map<string, WorkflowConnection[]>; // all edges
  startStep: WorkflowStep;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
  stepId?: string;
}

function edgeKey(connection: WorkflowConnection): string {
  return `${connection.fromStepId}->${connection.toStepId}:${connection.label ?? ""}`;
}

function isLoopEdge(connection: WorkflowConnection): boolean {
  return connection.label === LOOP_EDGE_LABEL;
}

export function buildGraph(definition: WorkflowDefinition): Graph {
  const stepsById = new Map(definition.steps.map((step) => [step.id, step]));
  const incoming = new Map<string, WorkflowConnection[]>();
  const outgoing = new Map<string, WorkflowConnection[]>();

  for (const connection of definition.connections) {
    const out = outgoing.get(connection.fromStepId) ?? [];
    out.push(connection);
    outgoing.set(connection.fromStepId, out);

    if (!isLoopEdge(connection)) {
      const inc = incoming.get(connection.toStepId) ?? [];
      inc.push(connection);
      incoming.set(connection.toStepId, inc);
    }
  }

  const startStep = definition.steps.find((step) => step.type === "START");
  if (!startStep) {
    throw new Error("Workflow definition is missing a START step");
  }

  return { incoming, outgoing, startStep, stepsById };
}

/**
 * Structural validation shared by the API (create/update) and the planner.
 * Mirrors the console's client-side validation so both agree.
 */
export function validateDefinition(definition: WorkflowDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const stepIds = new Set(definition.steps.map((step) => step.id));

  if (stepIds.size !== definition.steps.length) {
    issues.push({ message: "Step ids must be unique.", severity: "error" });
  }

  const startSteps = definition.steps.filter((step) => step.type === "START");
  if (startSteps.length !== 1) {
    issues.push({
      message: `Workflow must contain exactly one START step (found ${String(startSteps.length)}).`,
      severity: "error",
    });
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

  for (const step of definition.steps) {
    const outgoing = definition.connections.filter((c) => c.fromStepId === step.id);
    if (step.type === "CONDITION") {
      const labels = outgoing.map((c) => c.label);
      if (!labels.includes("true") || !labels.includes("false")) {
        issues.push({
          message: `Condition "${step.name}" needs outgoing edges labelled "true" and "false".`,
          severity: "error",
          stepId: step.id,
        });
      }
    }
    if (step.type === "TOOL_CALL" && typeof step.config["toolName"] !== "string") {
      issues.push({
        message: `Tool step "${step.name}" is missing config.toolName.`,
        severity: "error",
        stepId: step.id,
      });
    }
    if (step.type === "AGENT_TASK" && typeof step.config["promptTemplate"] !== "string") {
      issues.push({
        message: `Agent step "${step.name}" is missing config.promptTemplate.`,
        severity: "error",
        stepId: step.id,
      });
    }
    if (step.type === "SUB_WORKFLOW" && typeof step.config["workflowId"] !== "string") {
      issues.push({
        message: `Sub-workflow step "${step.name}" is missing config.workflowId.`,
        severity: "error",
        stepId: step.id,
      });
    }
  }

  // Cycles are only legal through edges labelled "loop".
  const nonLoopEdges = definition.connections.filter((c) => !isLoopEdge(c));
  if (hasCycle(definition.steps, nonLoopEdges)) {
    issues.push({
      message: `Cycles are only allowed through edges labelled "${LOOP_EDGE_LABEL}".`,
      severity: "error",
    });
  }

  return issues;
}

function hasCycle(steps: WorkflowStep[], edges: WorkflowConnection[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.fromStepId) ?? [];
    list.push(edge.toStepId);
    adjacency.set(edge.fromStepId, list);
  }

  const state = new Map<string, "visiting" | "done">();

  const visit = (id: string): boolean => {
    const current = state.get(id);
    if (current === "visiting") return true;
    if (current === "done") return false;
    state.set(id, "visiting");
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) return true;
    }
    state.set(id, "done");
    return false;
  };

  return steps.some((step) => visit(step.id));
}

export function createInitialState(graph: Graph): SchedulerState {
  return {
    arrivals: {},
    completed: [],
    iterations: {},
    ready: [graph.startStep.id],
    skipped: [],
  };
}

/** Pull the next wave of runnable steps (clears the ready list). */
export function takeReadySteps(state: SchedulerState): string[] {
  const wave = [...new Set(state.ready)];
  state.ready = [];
  return wave;
}

export interface FireResult {
  /** steps that became runnable */
  activated: string[];
  /** steps resolved as skipped in this propagation */
  skipped: string[];
  /** loop targets that exceeded their iteration bound */
  loopLimitExceeded: string[];
}

/**
 * Record a token arriving at a step and resolve its join state.
 * Returns "ready" | "skip" | "waiting".
 */
function deliverToken(
  graph: Graph,
  state: SchedulerState,
  connection: WorkflowConnection,
  kind: "real" | "skip",
): "ready" | "skip" | "waiting" {
  const target = connection.toStepId;
  const arrivals = (state.arrivals[target] = state.arrivals[target] ?? {});
  arrivals[edgeKey(connection)] = kind;

  const required = graph.incoming.get(target) ?? [];
  const arrivedCount = required.filter((edge) => arrivals[edgeKey(edge)] !== undefined).length;
  if (arrivedCount < required.length) return "waiting";

  const hasReal = required.some((edge) => arrivals[edgeKey(edge)] === "real");
  // Reset join accounting so loop re-entry starts a fresh round.
  state.arrivals[target] = {};
  return hasReal ? "ready" : "skip";
}

/**
 * Fire the outcome of a finished (or skipped) step through the graph.
 *
 * @param branchLabel for CONDITION steps: the selected outgoing label.
 * @param asSkip propagate skip tokens on every outgoing edge (used when the
 *               step itself was skipped).
 */
export function fireStep(
  graph: Graph,
  state: SchedulerState,
  stepId: string,
  options: { branchLabel?: string; asSkip?: boolean } = {},
): FireResult {
  const result: FireResult = { activated: [], loopLimitExceeded: [], skipped: [] };
  const queue: { stepId: string; branchLabel?: string; asSkip: boolean }[] = [
    { asSkip: options.asSkip ?? false, branchLabel: options.branchLabel, stepId },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const step = graph.stepsById.get(current.stepId);
    if (!step) continue;
    const outgoing = graph.outgoing.get(current.stepId) ?? [];
    const isCondition = step.type === "CONDITION" && !current.asSkip;

    for (const connection of outgoing) {
      const selected = isCondition ? connection.label === current.branchLabel : true;
      const kind: "real" | "skip" = current.asSkip || !selected ? "skip" : "real";

      if (isLoopEdge(connection)) {
        if (kind !== "real") continue; // skip tokens never traverse loop edges
        const target = graph.stepsById.get(connection.toStepId);
        const maxIterations = target?.loop?.maxIterations ?? DEFAULT_LOOP_MAX_ITERATIONS;
        const used = state.iterations[connection.toStepId] ?? 0;
        if (used >= maxIterations) {
          result.loopLimitExceeded.push(connection.toStepId);
          continue;
        }
        // Loop re-entry bypasses join accounting entirely.
        state.arrivals[connection.toStepId] = {};
        activate(state, connection.toStepId);
        result.activated.push(connection.toStepId);
        continue;
      }

      const outcome = deliverToken(graph, state, connection, kind);
      if (outcome === "ready") {
        activate(state, connection.toStepId);
        result.activated.push(connection.toStepId);
      } else if (outcome === "skip") {
        if (!state.skipped.includes(connection.toStepId)) {
          state.skipped.push(connection.toStepId);
          result.skipped.push(connection.toStepId);
        }
        queue.push({ asSkip: true, stepId: connection.toStepId });
      }
    }
  }

  return result;
}

/**
 * Activate a step: bump its activation count (the loop-iteration counter) and
 * mark it ready. Single source of truth for iteration accounting, so loop
 * bounds hold regardless of whether a caller drives real execution.
 */
function activate(state: SchedulerState, stepId: string): void {
  state.iterations[stepId] = (state.iterations[stepId] ?? 0) + 1;
  state.ready.push(stepId);
}

/** Current activation count of a step (for StepExecution.sequenceNumber display). */
export function currentIteration(state: SchedulerState, stepId: string): number {
  return state.iterations[stepId] ?? 1;
}

export function markCompleted(state: SchedulerState, stepId: string): void {
  if (!state.completed.includes(stepId)) {
    state.completed.push(stepId);
  }
}

/** True when nothing is ready — the run has drained. */
export function isDrained(state: SchedulerState): boolean {
  return state.ready.length === 0;
}
