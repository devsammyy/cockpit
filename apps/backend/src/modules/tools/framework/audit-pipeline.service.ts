import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as crypto from "crypto";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { EventDispatcherService } from "./event-dispatcher.service";

export type AuditActorType = "USER" | "AGENT" | "SYSTEM";

/** A single audit entry. `metadata` is redacted before persistence. */
export interface AuditEntry {
  organizationId: string;
  actorId: string;
  actorType: AuditActorType;
  action: string;
  resourceType: string;
  resourceId: string;
  changes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Metadata keys that must never be persisted verbatim. */
const SECRET_KEY_PATTERN =
  /(secret|token|password|passwd|api[-_]?key|authorization|credential|bearer)/i;
const REDACTED = "[redacted]";

/**
 * Append-only audit trail for the Tool Execution Framework. Writes to the
 * `audit_logs` table (previously unused) and auto-captures policy violations
 * emitted on the event bus. All writes are best-effort — auditing must never
 * fail a tool run — and every value is passed through a secret redactor first.
 */
@Injectable()
export class AuditPipelineService implements OnModuleInit {
  private readonly logger = new Logger(AuditPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventDispatcherService,
  ) {}

  onModuleInit(): void {
    // Security-relevant denials are audited automatically, independent of the
    // executor, so a policy breach is always recorded even on early exit.
    this.events.on("tool.policy.violation", (p) => {
      void this.record({
        organizationId: p.organizationId,
        actorId: p.userId,
        actorType: "USER",
        action: "tool.policy.violation",
        resourceType: "tool",
        resourceId: p.toolName,
        metadata: { code: p.code, reason: p.reason },
      });
    });
  }

  /** Persist an audit entry. Never throws. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: crypto.randomUUID(),
          organizationId: entry.organizationId,
          timestamp: new Date(),
          actorId: entry.actorId,
          actorType: entry.actorType,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          changes: entry.changes ? this.redact(entry.changes) : undefined,
          metadata: this.redact(entry.metadata ?? {}),
          requestId: entry.requestId ?? null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`Audit write failed (${entry.action}): ${(err as Error).message}`);
    }
  }

  /** Recursively replace secret-looking values with a redaction marker. */
  private redact(value: Record<string, unknown>): Prisma.InputJsonObject {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        out[key] = REDACTED;
      } else if (val && typeof val === "object" && !Array.isArray(val)) {
        out[key] = this.redact(val as Record<string, unknown>);
      } else {
        out[key] = val;
      }
    }
    return out as Prisma.InputJsonObject;
  }
}
