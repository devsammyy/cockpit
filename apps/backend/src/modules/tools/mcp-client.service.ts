import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../infrastructure/database/prisma.service";
import { ToolRegistryService } from "./tool-registry.service";
import { CredentialManagerService } from "./credential-manager.service";
import { EventDispatcherService } from "./framework/event-dispatcher.service";
import { StdioMcpTransport } from "./framework/mcp/mcp-transport";
import { McpRpcClient } from "./framework/mcp/mcp-rpc-client";
import { McpProxyTool } from "./framework/mcp/mcp-proxy-tool";

interface McpServerRow {
  id: string;
  organizationId: string;
  name: string;
  type: string;
  command: string | null;
  args: string[];
  url: string | null;
  enabled: boolean;
  authType: string;
  credentialKey: string | null;
  headers: unknown;
  timeoutMs: number;
}

interface Connection {
  client: McpRpcClient;
  serverName: string;
  organizationId: string;
  toolNames: string[];
  status: string;
}

const CLIENT_NAME = "qwen-autopilot";
const CLIENT_VERSION = "0.1.0";

/**
 * Manages the lifecycle of connections to Model Context Protocol servers. On
 * boot it discovers enabled `McpServer` rows, connects over the appropriate
 * transport, performs the MCP handshake, synchronizes advertised tools into the
 * registry as {@link McpProxyTool}s, and tracks health. New servers are added by
 * inserting rows — no code changes — and tools they expose flow through the same
 * execution pipeline as every other tool.
 */
@Injectable()
export class McpClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpClientService.name);
  private readonly connections = new Map<string, Connection>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly credentialManager: CredentialManagerService,
    private readonly events: EventDispatcherService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.syncAndConnectServers();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((id) => this.disconnect(id)));
  }

  /** Discover enabled MCP servers and connect to each (best-effort). */
  async syncAndConnectServers(): Promise<void> {
    let servers: McpServerRow[];
    try {
      servers = await this.prisma.mcpServer.findMany({
        where: { enabled: true },
      });
    } catch (err) {
      this.logger.warn(`MCP sync skipped: ${(err as Error).message}`);
      return;
    }
    for (const server of servers) {
      await this.connectServer(server);
    }
  }

  /** Connect one server: handshake, discover tools, register proxies. */
  async connectServer(server: McpServerRow): Promise<void> {
    if (server.type !== "STDIO") {
      await this.markError(server.id, `${server.type} transport is not yet implemented`);
      return;
    }
    if (!server.command) {
      await this.markError(server.id, "STDIO server has no command configured");
      return;
    }

    await this.setStatus(server.id, "CONNECTING");
    try {
      const env = await this.resolveEnv(server);
      const transport = new StdioMcpTransport(server.command, server.args, env);
      const client = new McpRpcClient(transport, server.timeoutMs);
      await client.start();

      const init = await client.initialize(CLIENT_NAME, CLIENT_VERSION);
      const specs = await client.listTools();

      const toolNames: string[] = [];
      for (const spec of specs) {
        this.toolRegistry.register(new McpProxyTool(client, server.name, spec.name, spec));
        toolNames.push(spec.name);
      }

      this.connections.set(server.id, {
        client,
        serverName: server.name,
        organizationId: server.organizationId,
        toolNames,
        status: "CONNECTED",
      });

      await this.prisma.mcpServer.update({
        where: { id: server.id },
        data: {
          status: "CONNECTED",
          protocolVersion: init.protocolVersion,
          capabilities: { server: init.serverInfo ?? {}, tools: toolNames },
          lastError: null,
          lastHealthCheckAt: new Date(),
        },
      });
      this.logger.log(`Connected MCP server "${server.name}" (${toolNames.length} tool(s))`);
      this.events.emit("mcp.health.changed", {
        organizationId: server.organizationId,
        serverId: server.id,
        status: "CONNECTED",
      });
    } catch (err) {
      await this.markError(server.id, (err as Error).message);
    }
  }

  /** Gracefully disconnect a server and unregister its tools. */
  async disconnect(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) return;
    for (const name of connection.toolNames) {
      this.toolRegistry.unregister(name);
    }
    try {
      await connection.client.close();
    } catch {
      // Best-effort shutdown.
    }
    this.connections.delete(serverId);
    await this.setStatus(serverId, "DISCONNECTED");
  }

  /** Ping every connected server and record health transitions. */
  async checkHealth(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const [id, connection] of this.connections) {
      let status: string;
      try {
        await connection.client.ping();
        status = "CONNECTED";
      } catch {
        status = "ERROR";
      }
      result[connection.serverName] = status;
      if (status !== connection.status) {
        connection.status = status;
        this.events.emit("mcp.health.changed", {
          organizationId: connection.organizationId,
          serverId: id,
          status,
        });
      }
      await this.touchHealth(id, status);
    }
    return result;
  }

  private async resolveEnv(server: McpServerRow): Promise<Record<string, string>> {
    const env: Record<string, string> = {};
    if (server.headers && typeof server.headers === "object") {
      for (const [key, value] of Object.entries(server.headers)) {
        if (typeof value === "string") env[key] = value;
      }
    }
    if (server.credentialKey) {
      const secret = await this.credentialManager.resolveSecret(
        server.organizationId,
        server.credentialKey,
      );
      if (secret) env[server.credentialKey] = secret;
    }
    return env;
  }

  private async markError(serverId: string, message: string): Promise<void> {
    this.logger.warn(`MCP server ${serverId} error: ${message}`);
    await this.updateServer(serverId, { status: "ERROR", lastError: message.slice(0, 300) });
  }

  private async setStatus(serverId: string, status: string): Promise<void> {
    await this.updateServer(serverId, { status });
  }

  private async touchHealth(serverId: string, status: string): Promise<void> {
    await this.updateServer(serverId, { status, lastHealthCheckAt: new Date() });
  }

  private async updateServer(serverId: string, data: Prisma.McpServerUpdateInput): Promise<void> {
    try {
      await this.prisma.mcpServer.update({ where: { id: serverId }, data });
    } catch {
      // Server row may not exist in unit/test contexts.
    }
  }
}
