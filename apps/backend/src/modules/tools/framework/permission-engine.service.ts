import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infrastructure/database/prisma.service";

export interface PermissionCheckResult {
  allowed: boolean;
  /** Permissions the caller is missing; empty when allowed. */
  missing: string[];
}

/** Wildcard permission that grants everything (owner/system roles). */
const WILDCARD = "*";
const CACHE_TTL_MS = 30_000;

/**
 * Resolves whether an actor holds the permissions a tool declares. Permissions
 * come from the caller's active organization role (`Role.permissions`), the
 * same source the HTTP `PermissionGuard` uses — so tool-level and route-level
 * authorization stay consistent. Results are briefly cached per (org, user) to
 * keep the per-invocation cost negligible.
 */
@Injectable()
export class PermissionEngineService {
  private readonly cache = new Map<string, { perms: Set<string>; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param required Permission strings the tool declares (empty ⇒ unrestricted).
   */
  async check(
    organizationId: string,
    userId: string,
    required: string[],
  ): Promise<PermissionCheckResult> {
    if (required.length === 0) {
      return { allowed: true, missing: [] };
    }
    const granted = await this.resolve(organizationId, userId);
    if (granted.has(WILDCARD)) {
      return { allowed: true, missing: [] };
    }
    const missing = required.filter((perm) => !granted.has(perm));
    return { allowed: missing.length === 0, missing };
  }

  /** Drop cached permissions for a user (call on role/membership change). */
  invalidate(organizationId: string, userId: string): void {
    this.cache.delete(`${organizationId}:${userId}`);
  }

  private async resolve(organizationId: string, userId: string): Promise<Set<string>> {
    const cacheKey = `${organizationId}:${userId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.perms;
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId, status: "ACTIVE" },
      include: { role: true },
    });

    const perms = new Set<string>();
    const rolePermissions = membership?.role?.permissions;
    if (Array.isArray(rolePermissions)) {
      for (const perm of rolePermissions) {
        if (typeof perm === "string") perms.add(perm);
      }
    }

    this.cache.set(cacheKey, { perms, expiresAt: Date.now() + CACHE_TTL_MS });
    return perms;
  }
}
