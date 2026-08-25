import { RecoveryManagerService } from "./recovery-manager.service";
import type { StepExecutionContext } from "./step-handler.interface";
import type { WorkflowStep } from "./workflow-definition.schema";

function makeService() {
  const toolExecutor = { execute: jest.fn().mockResolvedValue({ result: "reversed" }) };
  const events = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    events,
    service: new RecoveryManagerService(toolExecutor as never, events as never),
    toolExecutor,
  };
}

const context: StepExecutionContext = {
  depth: 0,
  executionId: "exec",
  iteration: 1,
  organizationId: "org",
  userId: "user",
  variables: {},
};

describe("RecoveryManagerService", () => {
  test("withRetry succeeds after transient failures within the attempt budget", async () => {
    // Arrange
    const { service } = makeService();
    const step: WorkflowStep = {
      config: {},
      id: "a",
      name: "A",
      retry: { backoffFactor: 1, initialDelayMs: 1, maxAttempts: 3 },
      type: "TOOL_CALL",
    };
    let calls = 0;
    const onFailure = jest.fn().mockResolvedValue(undefined);

    // Act
    const result = await service.withRetry(
      step,
      () => {
        calls += 1;
        if (calls < 3) throw new Error("transient");
        return Promise.resolve("ok");
      },
      onFailure,
    );

    // Assert
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(onFailure).toHaveBeenCalledTimes(2);
  });

  test("withRetry gives up after maxAttempts", async () => {
    const { service } = makeService();
    const step: WorkflowStep = {
      config: {},
      id: "a",
      name: "A",
      retry: { backoffFactor: 1, initialDelayMs: 1, maxAttempts: 2 },
      type: "TOOL_CALL",
    };

    await expect(
      service.withRetry(
        step,
        () => Promise.reject(new Error("permanent")),
        () => Promise.resolve(),
      ),
    ).rejects.toThrow("permanent");
  });

  test("compensate unwinds registered compensations in reverse order", async () => {
    // Arrange
    const { service, toolExecutor } = makeService();
    const stepA: WorkflowStep = {
      compensation: { arguments: {}, toolName: "undo_a" },
      config: {},
      id: "a",
      name: "A",
      type: "TOOL_CALL",
    };
    const stepB: WorkflowStep = {
      compensation: { arguments: {}, toolName: "undo_b" },
      config: {},
      id: "b",
      name: "B",
      type: "TOOL_CALL",
    };

    // Act
    const result = await service.compensate("exec", "org", [
      { context, step: stepA },
      { context, step: stepB },
    ]);

    // Assert: b compensated before a (reverse order), both succeeded
    expect(result).toEqual({ compensated: 2, failed: 0 });
    expect(toolExecutor.execute.mock.calls[0][0]).toBe("undo_b");
    expect(toolExecutor.execute.mock.calls[1][0]).toBe("undo_a");
  });

  test("compensate continues past a failing compensation (best-effort)", async () => {
    const { service, toolExecutor } = makeService();
    toolExecutor.execute
      .mockRejectedValueOnce(new Error("undo failed"))
      .mockResolvedValueOnce({ result: "ok" });

    const step = (name: string): WorkflowStep => ({
      compensation: { arguments: {}, toolName: `undo_${name}` },
      config: {},
      id: name,
      name,
      type: "TOOL_CALL",
    });

    const result = await service.compensate("exec", "org", [
      { context, step: step("a") },
      { context, step: step("b") },
    ]);

    expect(result.failed).toBe(1);
    expect(result.compensated).toBe(1);
  });
});
