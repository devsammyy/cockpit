/**
 * Execution lifecycle state machine.
 *
 * Persisted on Execution.status. Every transition goes through
 * assertTransition() so illegal jumps (e.g. COMPLETED → RUNNING) are caught
 * at the service boundary instead of corrupting run state.
 */

export const EXECUTION_STATUSES = [
  "PENDING",
  "RUNNING",
  "WAITING_APPROVAL",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  CANCELLED: [],
  COMPLETED: [],
  FAILED: ["PENDING"], // retry re-queues a failed run
  PAUSED: ["RUNNING", "CANCELLED"],
  PENDING: ["RUNNING", "CANCELLED"],
  RUNNING: ["WAITING_APPROVAL", "PAUSED", "COMPLETED", "FAILED", "CANCELLED"],
  WAITING_APPROVAL: ["RUNNING", "FAILED", "CANCELLED"],
};

export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export function isExecutionStatus(value: string): value is ExecutionStatus {
  return (EXECUTION_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: string, to: ExecutionStatus): boolean {
  if (!isExecutionStatus(from)) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Illegal execution transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: string, to: ExecutionStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

// ── Step lifecycle (persisted on StepExecution.status) ──

export const STEP_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "SKIPPED",
  "WAITING_APPROVAL",
  "COMPENSATED",
] as const;

export type StepStatus = (typeof STEP_STATUSES)[number];

// ── Timeline event types (persisted on ExecutionEvent.type) ──

export const EVENT_TYPES = [
  "EXECUTION_STARTED",
  "EXECUTION_RESUMED",
  "EXECUTION_PAUSED",
  "EXECUTION_CANCELLED",
  "EXECUTION_COMPLETED",
  "EXECUTION_FAILED",
  "STEP_STARTED",
  "STEP_COMPLETED",
  "STEP_FAILED",
  "STEP_SKIPPED",
  "STEP_RETRIED",
  "DECISION_EVALUATED",
  "APPROVAL_REQUESTED",
  "APPROVAL_DECIDED",
  "APPROVAL_ESCALATED",
  "COMPENSATION_EXECUTED",
  "REFLECTION_RECORDED",
] as const;

export type ExecutionEventType = (typeof EVENT_TYPES)[number];
