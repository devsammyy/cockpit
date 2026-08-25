import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Observable } from "rxjs";
import { throwError } from "rxjs";
import { catchError, tap } from "rxjs/operators";

import { MetricsService } from "./metrics.service";

const NANOSECONDS_PER_SECOND = 1e9;
const INTERNAL_SERVER_ERROR = 500;

/**
 * Records request count and latency for every HTTP request using the route
 * pattern (e.g. /api/v1/users/:id) as the label to keep cardinality bounded.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const route = request.routeOptions.url ?? "unmatched";

    if (route === "/metrics") {
      return next.handle();
    }

    const method = request.method;
    const startedAt = process.hrtime.bigint();
    const elapsedSeconds = (): number =>
      Number(process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_SECOND;

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<FastifyReply>();
        this.metrics.recordHttpRequest(method, route, response.statusCode, elapsedSeconds());
      }),
      catchError((error: unknown) => {
        const statusCode =
          error instanceof HttpException ? error.getStatus() : INTERNAL_SERVER_ERROR;
        this.metrics.recordHttpRequest(method, route, statusCode, elapsedSeconds());
        return throwError(() => error);
      }),
    );
  }
}
