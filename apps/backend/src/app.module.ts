import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";

import { validateEnvironment } from "./config/env.schema";
import type { EnvironmentVariables } from "./config/env.schema";
import { HealthModule } from "./health/health.module";
import { DatabaseModule } from "./infrastructure/database/database.module";
import { RedisModule } from "./infrastructure/redis/redis.module";
import { MetricsModule } from "./observability/metrics.module";
import { AiProviderModule } from "./modules/ai-provider/ai-provider.module";
import { ToolsModule } from "./modules/tools/tools.module";
import { MemoryModule } from "./modules/memory/memory.module";
import { ExecutionsModule } from "./modules/executions/executions.module";
import { WorkflowModule } from "./modules/workflows/workflow.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: [`.env.${process.env["NODE_ENV"] ?? "development"}.local`, ".env"],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        pinoHttp: {
          level: config.get("LOG_LEVEL", { infer: true }),
          redact: ["req.headers.authorization", "req.headers.cookie"],
          transport:
            config.get("NODE_ENV", { infer: true }) === "development"
              ? { target: "pino-pretty", options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
        const redisPassword = config.get("REDIS_PASSWORD", { infer: true });

        return {
          connection: {
            host: config.get("REDIS_HOST", { infer: true }),
            password: redisPassword.length > 0 ? redisPassword : undefined,
            port: config.get("REDIS_PORT", { infer: true }),
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { delay: 1000, type: "exponential" },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        };
      },
    }),
    DatabaseModule,
    RedisModule,
    MetricsModule,
    HealthModule,
    AiProviderModule,
    ToolsModule,
    MemoryModule,
    ExecutionsModule,
    WorkflowModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
  ],
})
export class AppModule {}
