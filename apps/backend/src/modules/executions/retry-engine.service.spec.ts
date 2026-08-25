import { RetryEngineService } from "./retry-engine.service";

describe("RetryEngineService", () => {
  let service: RetryEngineService;

  beforeEach(() => {
    service = new RetryEngineService();
  });

  it("resolves values on immediate success", async () => {
    const fn = jest.fn().mockResolvedValue("success");
    const res = await service.execute(fn, { maxAttempts: 3, initialDelayMs: 5, backoffFactor: 2 });
    expect(res).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on temporary failure and then passes", async () => {
    let calls = 0;
    const fn = jest.fn().mockImplementation(async () => {
      calls++;
      if (calls < 2) throw new Error("Transient");
      return "recovered";
    });

    const res = await service.execute(fn, {
      maxAttempts: 3,
      initialDelayMs: 5,
      backoffFactor: 1.5,
    });
    expect(res).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("bubbles up error after max retry counts exceeded", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("Fatal"));
    await expect(
      service.execute(fn, { maxAttempts: 3, initialDelayMs: 2, backoffFactor: 2 }),
    ).rejects.toThrow("Fatal");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
