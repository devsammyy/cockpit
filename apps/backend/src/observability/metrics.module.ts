import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { HttpMetricsInterceptor } from "./http-metrics.interceptor";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

/**
 * Global observability module: exposes the Prometheus registry service to all
 * feature modules and instruments every HTTP request via a global interceptor.
 */
@Global()
@Module({
  controllers: [MetricsController],
  exports: [MetricsService],
  providers: [
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class MetricsModule {}
