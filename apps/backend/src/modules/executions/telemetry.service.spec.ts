import { TelemetryService } from "./telemetry.service";

describe("TelemetryService", () => {
  let service: TelemetryService;

  beforeEach(() => {
    service = new TelemetryService();
  });

  it("calculates summary statistics for latencies and counts", () => {
    service.recordLatency("test.latency", 100);
    service.recordLatency("test.latency", 200);
    service.incrementCounter("test.counter");

    const summary = service.getSummary();
    expect(summary["test.latency"]).toEqual({
      count: 2,
      avgLatencyMs: 150,
      maxLatencyMs: 200,
    });
    expect(summary["test.counter"]).toEqual({
      count: 1,
    });
  });
});
