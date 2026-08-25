import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { ExecutionEventType } from "./execution-state";

/**
 * Persistent execution timeline. Every state transition, step outcome,
 * decision, approval, and compensation lands here — the console's timeline
 * viewer and the audit trail both read from this table.
 *
 * Recording is best-effort by design: a telemetry failure must never break
 * a business workflow.
 */
@Injectable()
export class ExecutionEventsService {
  private readonly logger = new Logger(ExecutionEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    executionId: string,
    organizationId: string,
    type: ExecutionEventType,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.executionEvent.create({
        data: {
          data: (data ?? undefined) as any,
          executionId,
          id: crypto.randomUUID(),
          message,
          organizationId,
          type,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record execution event ${type} for ${executionId}: ${(error as Error).message}`,
      );
    }
  }

  async list(executionId: string): Promise<unknown[]> {
    return this.prisma.executionEvent.findMany({
      orderBy: { createdAt: "asc" },
      where: { executionId },
    });
  }
}
