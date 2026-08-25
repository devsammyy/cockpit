import { CostTrackerService } from "./cost-tracker.service";

describe("CostTrackerService", () => {
  let service: CostTrackerService;

  beforeEach(() => {
    service = new CostTrackerService();
  });

  it("calculates model pricing correctly", () => {
    const cost = service.calculateCost("qwen-plus", {
      promptTokens: 1000,
      completionTokens: 2000,
      totalTokens: 3000,
    });
    // qwen-plus: input = 1000 micro-dollars per 1M, output = 2000 per 1M
    // input = 1000/1000000 * 1000 = 1 micro-dollar
    // output = 2000/1000000 * 2000 = 4 micro-dollars
    // total = 5 micro-dollars
    expect(cost).toBe(5);
  });

  it("tracks running totals per execution ID", async () => {
    await service.track("exec_1", "qwen-max", {
      promptTokens: 1000,
      completionTokens: 1000,
      totalTokens: 2000,
    });
    // qwen-max: input = 6000 micro-dollars per 1M, output = 12000 per 1M
    // total = 6 + 12 = 18 micro-dollars
    expect(await service.getCost("exec_1")).toBe(18);

    await service.track("exec_1", "qwen-max", {
      promptTokens: 1000,
      completionTokens: 1000,
      totalTokens: 2000,
    });
    expect(await service.getCost("exec_1")).toBe(36);
  });
});
