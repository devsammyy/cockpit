import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { HealthService } from "./health.service";
import type { HealthResponse } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: "Check API, PostgreSQL, and Redis health" })
  @ApiOkResponse({ description: "All platform dependencies are reachable." })
  async check(): Promise<HealthResponse> {
    const health = await this.healthService.check();

    if (health.status !== "ok") {
      throw new ServiceUnavailableException(health);
    }

    return health;
  }

  @Get("live")
  @ApiOperation({ summary: "Liveness probe: process is up and serving requests" })
  @ApiOkResponse({ description: "Process is alive." })
  live(): { status: "ok"; uptimeSeconds: number } {
    return { status: "ok", uptimeSeconds: Math.floor(process.uptime()) };
  }

  @Get("ready")
  @ApiOperation({
    summary: "Readiness probe: dependencies are reachable and traffic can be served",
  })
  @ApiOkResponse({ description: "All dependencies are reachable." })
  async ready(): Promise<HealthResponse> {
    return this.check();
  }

  @Get("startup")
  @ApiOperation({ summary: "Startup probe: initial boot completed and dependencies reachable" })
  @ApiOkResponse({ description: "Application finished starting." })
  async startup(): Promise<HealthResponse> {
    return this.check();
  }
}
