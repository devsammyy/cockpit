import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as crypto from "crypto";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { EventDispatcherService } from "./event-dispatcher.service";

export interface UpsertConnectorInput {
  name: string;
  slug: string;
  connectorType: string;
  description?: string;
  baseUrl?: string;
  authType?: string;
  config?: Record<string, unknown>;
  credentialKey?: string;
  status?: string;
}

const HEALTH_PROBE_TIMEOUT_MS = 5_000;
const BLOCKED_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|::1)/i;

/**
 * Manages connector instances (`connectors` table) — the registry of external
 * systems tools can talk to — and probes their health. Health is a reachability
 * check only (never a state-changing call); any HTTP response counts as
 * reachable, while a network error or timeout marks the connector UNHEALTHY. A
 * status transition publishes a `connector.health.changed` event.
 */
@Injectable()
export class ConnectorRegistryService {
  private readonly logger = new Logger(ConnectorRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventDispatcherService,
  ) {}

  /** List an org's connectors plus any global (org-less) connectors. */
  async list(organizationId: string): Promise<unknown[]> {
    return this.prisma.connector.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }], deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(organizationId: string, id: string): Promise<unknown> {
    return this.prisma.connector.findFirst({
      where: { id, OR: [{ organizationId }, { organizationId: null }], deletedAt: null },
    });
  }

  async create(
    organizationId: string,
    userId: string,
    input: UpsertConnectorInput,
  ): Promise<{ id: string }> {
    const row = await this.prisma.connector.create({
      data: {
        id: crypto.randomUUID(),
        organizationId,
        name: input.name,
        slug: input.slug,
        connectorType: input.connectorType,
        description: input.description ?? null,
        baseUrl: input.baseUrl ?? null,
        authType: input.authType ?? "NONE",
        config: (input.config ?? {}) as Prisma.InputJsonValue,
        credentialKey: input.credentialKey ?? null,
        status: input.status ?? "ACTIVE",
        createdBy: userId,
      },
    });
    return { id: row.id };
  }

  async update(
    organizationId: string,
    id: string,
    input: Partial<UpsertConnectorInput>,
  ): Promise<void> {
    await this.prisma.connector.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: {
        name: input.name,
        slug: input.slug,
        connectorType: input.connectorType,
        description: input.description,
        baseUrl: input.baseUrl,
        authType: input.authType,
        config: input.config ? (input.config as Prisma.InputJsonValue) : undefined,
        credentialKey: input.credentialKey,
        status: input.status,
      },
    });
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.prisma.connector.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { deletedAt: new Date(), status: "DISABLED" },
    });
  }

  /** Probe a connector's reachability and persist the resulting health status. */
  async checkHealth(
    organizationId: string,
    id: string,
  ): Promise<{ status: string; error: string | null }> {
    const connector = (await this.get(organizationId, id)) as {
      id: string;
      baseUrl: string | null;
      healthStatus: string | null;
    } | null;
    if (!connector) {
      return { status: "UNKNOWN", error: "Connector not found" };
    }

    const previous = connector.healthStatus ?? "UNKNOWN";
    const result = await this.probe(connector.baseUrl);

    await this.prisma.connector.update({
      where: { id: connector.id },
      data: {
        healthStatus: result.status,
        lastHealthCheckAt: new Date(),
        lastHealthError: result.error,
      },
    });

    if (result.status !== previous) {
      this.events.emit("connector.health.changed", {
        organizationId,
        connectorId: connector.id,
        status: result.status,
      });
    }
    return result;
  }

  private async probe(baseUrl: string | null): Promise<{ status: string; error: string | null }> {
    if (!baseUrl) {
      return { status: "UNKNOWN", error: "No base URL configured" };
    }
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      return { status: "UNHEALTHY", error: "Invalid base URL" };
    }
    if (BLOCKED_HOST.test(url.hostname)) {
      return { status: "UNKNOWN", error: "Health probe blocked for internal host" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);
    try {
      await fetch(url.toString(), { method: "HEAD", signal: controller.signal });
      // Any HTTP response (including 4xx) means the endpoint is reachable.
      return { status: "HEALTHY", error: null };
    } catch (err) {
      return { status: "UNHEALTHY", error: (err as Error).message.slice(0, 200) };
    } finally {
      clearTimeout(timer);
    }
  }
}
