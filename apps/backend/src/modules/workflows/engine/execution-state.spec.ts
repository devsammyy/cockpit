import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  TERMINAL_STATUSES,
} from "./execution-state";

describe("execution-state machine", () => {
  test("permits the documented lifecycle transitions", () => {
    expect(canTransition("PENDING", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "WAITING_APPROVAL")).toBe(true);
    expect(canTransition("WAITING_APPROVAL", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "COMPLETED")).toBe(true);
    expect(canTransition("RUNNING", "PAUSED")).toBe(true);
    expect(canTransition("PAUSED", "RUNNING")).toBe(true);
    expect(canTransition("FAILED", "PENDING")).toBe(true); // retry
  });

  test("rejects illegal jumps", () => {
    expect(canTransition("COMPLETED", "RUNNING")).toBe(false);
    expect(canTransition("PENDING", "COMPLETED")).toBe(false);
    expect(canTransition("CANCELLED", "RUNNING")).toBe(false);
    expect(canTransition("WAITING_APPROVAL", "COMPLETED")).toBe(false);
  });

  test("assertTransition throws on an illegal transition", () => {
    expect(() => {
      assertTransition("COMPLETED", "RUNNING");
    }).toThrow(InvalidTransitionError);
  });

  test("terminal statuses have no outgoing runtime transitions", () => {
    expect(TERMINAL_STATUSES.has("COMPLETED")).toBe(true);
    expect(TERMINAL_STATUSES.has("CANCELLED")).toBe(true);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
  });

  test("unknown source status never transitions", () => {
    expect(canTransition("NONSENSE", "RUNNING")).toBe(false);
  });
});
