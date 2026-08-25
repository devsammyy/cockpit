import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly latencies = new Map<string, number[]>();
  private readonly counters = new Map<string, number>();

  /**
   * Record processing latency for an execution component.
   */
  recordLatency(name: string, durationMs: number): void {
    if (!this.latencies.has(name)) {
      this.latencies.set(name, []);
    }
    this.latencies.get(name)!.push(durationMs);
    this.logger.debug(`Telemetry recorded latency for ${name}: ${durationMs}ms`);
  }

  /**
   * Increment execution metric counters.
   */
  incrementCounter(name: string): void {
    const val = this.counters.get(name) || 0;
    this.counters.set(name, val + 1);
    this.logger.debug(`Telemetry incremented ${name} to ${val + 1}`);
  }

  /**
   * Retrieve summarized performance metrics.
   */
  getSummary(): Record<string, any> {
    const summary: Record<string, any> = {};

    for (const [key, times] of this.latencies.entries()) {
      const sum = times.reduce((a, b) => a + b, 0);
      const avg = times.length > 0 ? sum / times.length : 0;
      summary[key] = {
        count: times.length,
        avgLatencyMs: Math.round(avg),
        maxLatencyMs: Math.max(...times, 0),
      };
    }

    for (const [key, count] of this.counters.entries()) {
      summary[key] = { ...(summary[key] || {}), count };
    }

    return summary;
  }
}
