import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import type { ApprovalType, RiskLevel, ToolMetadata, ToolRetryPolicy } from "../tool.interface";
import { ToolRegistryService } from "../tool-registry.service";
import { ConnectorInvokerService } from "./connector-invoker.service";
import type { ConnectorInvokeConfig } from "./connector-invoker.service";
import { jsonSchemaToZod } from "./json-schema.util";
import { PersistedTool } from "./persisted-tool";
import { describeTool } from "./tool-descriptor";
import type { ToolDescriptor } from "./tool-descriptor";

/** executorTypes the loader materializes; INTERNAL/MCP are handled elsewhere. */
const LOADABLE_EXECUTORS = ["HTTP", "GRAPHQL", "CONNECTOR"];

interface ConnectorRow {
  baseUrl: string | null;
  authType: string;
  credentialKey: string | null;
}

interface ToolDefinitionRow {
  name: string;
  description: string;
  category: string;
  inputSchema: unknown;
  outputSchema: unknown;
  executorType: string;
  executorConfig: unknown;
  riskLevel: string;
  timeoutMs: number;
  permissions: string[];
  requiresApproval: boolean;
  approvalType: string | null;
  retryPolicy: unknown;
  supportedProviders: string[];
  documentation: string | null;
  tags: string[];
  version: number;
  connector: ConnectorRow | null;
}

/**
 * Runtime tool discovery + loading. Reads active persisted `ToolDefinition`
 * rows and registers each as a declarative {@link PersistedTool} in the
 * in-memory {@link ToolRegistryService}, so an organization can add
 * HTTP/GraphQL/connector-backed tools with no deploy. Code tools (INTERNAL) and
 * MCP tools self-register through their own paths and are skipped here.
 */
@Injectable()
export class ToolLoaderService {
  private readonly logger = new Logger(ToolLoaderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ToolRegistryService,
    private readonly invoker: ConnectorInvokerService,
  ) {}

  /** Load (or reload) all persisted, loadable tool definitions into the registry. */
  async loadPersistedTools(): Promise<number> {
    let rows: ToolDefinitionRow[];
    try {
      rows = await this.prisma.toolDefinition.findMany({
        where: {
          status: "ACTIVE",
          deletedAt: null,
          executorType: { in: LOADABLE_EXECUTORS },
        },
        include: { connector: true },
      });
    } catch (err) {
      this.logger.warn(`Skipping persisted tool load: ${(err as Error).message}`);
      return 0;
    }

    let loaded = 0;
    for (const row of rows) {
      try {
        this.registry.register(this.materialize(row));
        loaded += 1;
      } catch (err) {
        this.logger.warn(`Failed to load tool "${row.name}": ${(err as Error).message}`);
      }
    }
    if (loaded > 0) {
      this.logger.log(`Loaded ${loaded} persisted tool definition(s) into the registry`);
    }
    return loaded;
  }

  /** The full runtime catalog (code + persisted) as normalized descriptors. */
  discover(): ToolDescriptor[] {
    return this.registry.getAll().map((tool) => describeTool(tool.metadata));
  }

  private materialize(row: ToolDefinitionRow): PersistedTool {
    const executorConfig: Partial<ConnectorInvokeConfig> =
      row.executorConfig && typeof row.executorConfig === "object" ? row.executorConfig : {};
    const connector = row.connector;

    const config: ConnectorInvokeConfig = {
      baseUrl: executorConfig.baseUrl ?? connector?.baseUrl ?? undefined,
      endpoint: executorConfig.endpoint ?? "",
      method: executorConfig.method,
      headers: executorConfig.headers,
      query: executorConfig.query,
      body: executorConfig.body,
      graphql: row.executorType === "GRAPHQL" || executorConfig.graphql === true,
      graphqlQuery: executorConfig.graphqlQuery,
      auth:
        executorConfig.auth ??
        (connector?.credentialKey
          ? { type: connector.authType, credentialKey: connector.credentialKey }
          : undefined),
    };

    const metadata: ToolMetadata = {
      name: row.name,
      description: row.description,
      inputSchema: jsonSchemaToZod(row.inputSchema),
      outputSchema: row.outputSchema ? jsonSchemaToZod(row.outputSchema) : undefined,
      category: row.category,
      riskLevel: row.riskLevel as RiskLevel,
      timeoutMs: row.timeoutMs,
      permissions: row.permissions,
      requiresApproval: row.requiresApproval,
      approvalType: (row.approvalType as ApprovalType | null) ?? undefined,
      retryPolicy: (row.retryPolicy as ToolRetryPolicy | null) ?? undefined,
      supportedProviders: row.supportedProviders,
      documentation: row.documentation ?? undefined,
      tags: row.tags,
      version: String(row.version),
    };

    return new PersistedTool(metadata, config, this.invoker);
  }
}
