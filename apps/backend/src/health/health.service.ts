import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";

import type { EnvironmentVariables } from "../config/env.schema";
import { PrismaService } from "../infrastructure/database/prisma.service";
import { REDIS_CLIENT } from "../infrastructure/redis/redis.constants";

type DependencyStatus = "ok" | "error";

export interface HealthResponse {
  dependencies: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
  };
  service: string;
  status: DependencyStatus;
  timestamp: string;
  uptimeSeconds: number;
  version: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async check(): Promise<HealthResponse> {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    const status = postgres === "ok" && redis === "ok" ? "ok" : "error";

    return {
      dependencies: { postgres, redis },
      service: this.config.get("APP_NAME", { infer: true }),
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      version: this.config.get("APP_VERSION", { infer: true }),
    };
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return "error";
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    try {
      // connect() rejects when the lazy client is already connected, so only
      // establish the connection when the socket is genuinely down.
      if (this.redis.status === "wait" || this.redis.status === "end") {
        await this.redis.connect();
      }
      await this.redis.ping();
      return "ok";
    } catch {
      return "error";
    }
  }
}
