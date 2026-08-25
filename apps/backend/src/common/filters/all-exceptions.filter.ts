import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { LlmError } from "../../modules/ai-provider/errors";

interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    statusCode: number;
    timestamp: string;
  };
  success: false;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const response = context.getResponse<FastifyReply>();

    const resolved = this.resolveException(exception);

    const body: ErrorBody = {
      error: {
        code: resolved.code,
        message: resolved.message,
        requestId: request.id,
        statusCode: resolved.statusCode,
        timestamp: new Date().toISOString(),
      },
      success: false,
    };

    const statusCode = resolved.statusCode;

    if (statusCode >= 500) {
      this.logger.error(exception);
    }

    response.status(statusCode).send(body);
  }

  private resolveException(exception: unknown): {
    code: string;
    message: string;
    statusCode: number;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      return {
        code: HttpStatus[statusCode] ?? "ERROR",
        message: this.resolveHttpExceptionMessage(exception),
        statusCode,
      };
    }

    // Upstream model-provider failures carry a meaningful code, message, and the
    // provider's HTTP status. Surface them instead of a blank 500 — but never
    // relay a provider 401 as our own 401, which the console treats as a session
    // expiry and would wrongly sign the user out. A bad provider key is a
    // server-side misconfiguration, so it maps to 502 Bad Gateway.
    if (exception instanceof LlmError) {
      const unauthorized: number = HttpStatus.UNAUTHORIZED;
      const upstream = exception.statusCode;
      const isRelayable = upstream !== undefined && upstream !== unauthorized;
      const statusCode = isRelayable ? upstream : HttpStatus.BAD_GATEWAY;
      return { code: exception.code, message: exception.message, statusCode };
    }

    return {
      code: HttpStatus[HttpStatus.INTERNAL_SERVER_ERROR],
      message: "Internal server error",
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }

  private resolveHttpExceptionMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === "string") {
      return response;
    }

    if (typeof response === "object") {
      const message = (response as { message?: unknown }).message;

      if (message === undefined) {
        return exception.message;
      }

      return this.stringifyMessage(message);
    }

    return exception.message;
  }

  private stringifyMessage(message: unknown): string {
    if (Array.isArray(message)) {
      return message.map((entry) => this.stringifyMessage(entry)).join("; ");
    }

    if (typeof message === "string") {
      return message;
    }

    if (typeof message === "number" || typeof message === "boolean") {
      return String(message);
    }

    return "Request failed";
  }
}
