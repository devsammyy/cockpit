import { Tool } from "../../tool.interface";
import type { ToolMetadata } from "../../tool.interface";
import { jsonSchemaToZod } from "../json-schema.util";
import type { McpRpcClient, McpToolSpec } from "./mcp-rpc-client";

/**
 * A registry {@link Tool} that proxies to a tool exposed by a connected MCP
 * server. Its input schema is derived from the server-advertised JSON Schema, so
 * MCP tools flow through the exact same validation/policy/audit pipeline as any
 * other tool — no special-casing in the executor.
 */
export class McpProxyTool extends Tool {
  readonly metadata: ToolMetadata;

  constructor(
    private readonly client: McpRpcClient,
    private readonly serverName: string,
    private readonly toolName: string,
    spec: McpToolSpec,
  ) {
    super();
    this.metadata = {
      name: toolName,
      description: spec.description ?? `MCP tool "${toolName}" from ${serverName}`,
      inputSchema: jsonSchemaToZod(spec.inputSchema),
      category: "mcp",
      riskLevel: "MEDIUM",
      tags: ["mcp", serverName],
    };
  }

  execute(input: Record<string, unknown>): Promise<unknown> {
    return this.client.callTool(this.toolName, input);
  }
}
