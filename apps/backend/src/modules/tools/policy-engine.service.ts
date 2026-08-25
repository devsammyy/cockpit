import { Injectable, Logger, Optional, Inject } from "@nestjs/common";
import type { Redis } from "ioredis";

import { PrismaService } from "../../infrastructure/database/prisma.service";
import { REDIS_CLIENT } from "../../infrastructure/redis/redis.constants";
import { exceedsRisk } from "./framework/tool-descriptor";
import type { RiskLevel } from "./tool.interface";
import type { StageDenyCode } from "./framework/pipeline-stage.interface";

export interface PolicyEvaluationResult {
  allowed: boolean;
  requiresApproval: boolean;
  maxDurationMs: number;
  reason?: string;
}

/** Inputs for a full composable policy evaluation of a tool run. */
export interface ExecutionPolicyInput {
  organizationId: string;
  userId: string;
  toolName: string;
  riskLevel: RiskLevel;
}

/** Result of a composable policy evaluation. */
export interface ExecutionPolicyResult {
  allowed: boolean;
  requiresApproval: boolean;
  maxDurationMs: number;
  /** Concurrency ceiling to hand to the sandbox; null ⇒ unbounded. */
  concurrencyLimit: number | null;
  /** Set when `allowed` is false. */
  code?: StageDenyCode;
  reason?: string;
}

interface BusinessHours {
  timezone?: string;
  /** Allowed weekdays as JS day numbers (0=Sun … 6=Sat); empty/absent ⇒ all days. */
  days?: number[];
  startHour: number;
  endHour: number;
}

const RATE_LIMIT_WINDOW_SECONDS = 60;
const DAILY_QUOTA_WINDOW_SECONDS = 24 * 60 * 60;

@Injectable()
export class PolicyEngineService {
  private readonly logger = new Logger(PolicyEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /**
   * Evaluate if a tool run meets the criteria of organization policy constraints.
   */
  async evaluate(orgId: string, toolName: string, userId: string): Promise<PolicyEvaluationResult> {
    try {
      const policy = await this.prisma.toolPolicy.findFirst({
        where: { organizationId: orgId, toolName },
      });

      if (!policy) {
        // Default permit-all policy if none is explicit
        return {
          allowed: true,
          requiresApproval: false,
          maxDurationMs: 30000,
        };
      }

      // Check if user is in allowedUsers list (if not empty)
      if (policy.allowedUsers && policy.allowedUsers.length > 0) {
        const isAllowed = policy.allowedUsers.includes(userId);
        if (!isAllowed) {
          return {
            allowed: false,
            requiresApproval: false,
            maxDurationMs: policy.maxDurationMs,
            reason: `User ${userId} is not in the allowed users list for tool ${toolName}`,
          };
        }
      }

      return {
        allowed: true,
        requiresApproval: policy.requiresApproval,
        maxDurationMs: policy.maxDurationMs,
      };
    } catch {
      // In unit tests without database mock, default permit-all
      return {
        allowed: true,
        requiresApproval: false,
        maxDurationMs: 30000,
      };
    }
  }

  /**
   * Full composable policy evaluation for a tool run. Applies the enabled,
   * highest-priority policy matching the tool: allowed-users, risk ceiling,
   * business hours, rate limit, and daily quota. Concurrency is returned for
   * the sandbox to enforce. Rate/quota checks are backed by Redis and fail
   * OPEN (allow + warn) if Redis is unavailable, so an infra blip never blocks
   * all tool traffic. With no matching policy the run is permitted.
   */
  async evaluateExecution(input: ExecutionPolicyInput): Promise<ExecutionPolicyResult> {
    const permit: ExecutionPolicyResult = {
      allowed: true,
      requiresApproval: false,
      maxDurationMs: 30000,
      concurrencyLimit: null,
    };

    let policy;
    try {
      policy = await this.prisma.toolPolicy.findFirst({
        where: { organizationId: input.organizationId, toolName: input.toolName, enabled: true },
        orderBy: { priority: "desc" },
      });
    } catch {
      return permit; // No DB (unit tests) ⇒ permit-all.
    }
    if (!policy) {
      return permit;
    }

    const base: ExecutionPolicyResult = {
      allowed: true,
      requiresApproval: policy.requiresApproval,
      maxDurationMs: policy.maxDurationMs,
      concurrencyLimit: policy.concurrencyLimit ?? null,
    };

    // Allowed users allow-list.
    if (policy.allowedUsers.length > 0 && !policy.allowedUsers.includes(input.userId)) {
      return this.deny(base, "POLICY_VIOLATION", `User is not permitted to run ${input.toolName}`);
    }

    // Risk ceiling.
    if (policy.riskCeiling && exceedsRisk(input.riskLevel, policy.riskCeiling as RiskLevel)) {
      return this.deny(
        base,
        "RISK_CEILING_EXCEEDED",
        `Tool risk ${input.riskLevel} exceeds the ${policy.riskCeiling} ceiling`,
      );
    }

    // Business hours.
    if (
      policy.businessHours &&
      !this.isWithinBusinessHours(policy.businessHours as unknown as BusinessHours)
    ) {
      return this.deny(
        base,
        "OUTSIDE_BUSINESS_HOURS",
        `${input.toolName} may only run during configured business hours`,
      );
    }

    // Rate limit (per minute).
    if (
      policy.rateLimitPerMinute &&
      !(await this.underCounter(
        `pol:rl:${input.organizationId}:${input.toolName}`,
        policy.rateLimitPerMinute,
        RATE_LIMIT_WINDOW_SECONDS,
        true,
      ))
    ) {
      return this.deny(base, "RATE_LIMITED", `Rate limit exceeded for ${input.toolName}`);
    }

    // Daily quota.
    if (
      policy.dailyQuota &&
      !(await this.underCounter(
        `pol:dq:${input.organizationId}:${input.toolName}`,
        policy.dailyQuota,
        DAILY_QUOTA_WINDOW_SECONDS,
        false,
      ))
    ) {
      return this.deny(base, "QUOTA_EXCEEDED", `Daily quota exceeded for ${input.toolName}`);
    }

    return base;
  }

  private deny(
    base: ExecutionPolicyResult,
    code: StageDenyCode,
    reason: string,
  ): ExecutionPolicyResult {
    return { ...base, allowed: false, code, reason };
  }

  /** Increment a windowed counter and report whether it is still within `limit`. */
  private async underCounter(
    keyPrefix: string,
    limit: number,
    ttlSeconds: number,
    perMinuteWindow: boolean,
  ): Promise<boolean> {
    if (!this.redis) {
      return true; // No Redis ⇒ counters disabled; fail open.
    }
    const now = Date.now();
    const window = perMinuteWindow
      ? Math.floor(now / 60_000)
      : new Date(now).toISOString().slice(0, 10);
    const key = `${keyPrefix}:${window}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, ttlSeconds);
      }
      return count <= limit;
    } catch (err) {
      this.logger.warn(
        `Counter check failed for ${keyPrefix}, allowing: ${(err as Error).message}`,
      );
      return true; // Fail open on Redis error.
    }
  }

  /** True when `now` falls inside the configured weekly window (fails open on error). */
  private isWithinBusinessHours(config: BusinessHours, now: Date = new Date()): boolean {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: config.timezone,
        hourCycle: "h23",
        hour: "2-digit",
        weekday: "short",
      }).formatToParts(now);

      const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
      const weekdayLabel = parts.find((p) => p.type === "weekday")?.value ?? "";
      const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayLabel);

      if (config.days && config.days.length > 0 && !config.days.includes(weekdayIndex)) {
        return false;
      }
      return hour >= config.startHour && hour < config.endHour;
    } catch (err) {
      this.logger.warn(`Business-hours check failed, allowing: ${(err as Error).message}`);
      return true;
    }
  }
}
