import { Controller, Get, Header, NotFoundException } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { MetricsService } from "./metrics.service";

/**
 * Prometheus scrape endpoint. Registered outside the versioned API prefix
 * (see main.ts) so it is served at /metrics. The reverse proxy never routes
 * this path externally; only the internal container network can reach it.
 */
@ApiExcludeController()
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  @Header("Cache-Control", "no-store")
  async scrape(): Promise<string> {
    if (!this.metrics.enabled) {
      throw new NotFoundException();
    }

    return this.metrics.getMetrics();
  }
}
