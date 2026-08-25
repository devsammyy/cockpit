import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { Observable } from "rxjs";

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();
    const requestId = this.resolveRequestId(request);

    request.id = requestId;
    response.header("x-request-id", requestId);

    return next.handle();
  }

  private resolveRequestId(request: FastifyRequest): string {
    const incomingRequestId = request.headers["x-request-id"];

    return typeof incomingRequestId === "string" && incomingRequestId.length > 0
      ? incomingRequestId
      : randomUUID();
  }
}
