import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

import type { EnvironmentVariables } from "../../config/env.schema";
import { REDIS_CLIENT } from "./redis.constants";

@Global()
@Module({
  exports: [REDIS_CLIENT],
  providers: [
    {
      inject: [ConfigService],
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
        const redisPassword = config.get("REDIS_PASSWORD", { infer: true });

        return new Redis({
          host: config.get("REDIS_HOST", { infer: true }),
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          password: redisPassword.length > 0 ? redisPassword : undefined,
          port: config.get("REDIS_PORT", { infer: true }),
        });
      },
    },
  ],
})
export class RedisModule {}
