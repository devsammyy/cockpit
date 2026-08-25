import { MCP_PROTOCOL_VERSION } from "./mcp-transport";
import type { JsonRpcMessage, McpTransport } from "./mcp-transport";

/** A tool as advertised by an MCP server's `tools/list`. */
export interface McpToolSpec {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo?: { name?: string; version?: string };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * A minimal, dependency-free MCP client speaking JSON-RPC 2.0 over any
 * {@link McpTransport}. It correlates responses to requests by id, enforces
 * per-request timeouts, and exposes the MCP handshake + tool methods
 * (`initialize`, `tools/list`, `tools/call`, `ping`).
 */
export class McpRpcClient {
  private nextId = 1;
  private readonly pending = new Map<number | string, PendingRequest>();
  private closed = false;

  constructor(
    private readonly transport: McpTransport,
    private readonly timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  async start(): Promise<void> {
    this.transport.onMessage((message) => this.handleMessage(message));
    this.transport.onClose((reason) => this.failAll(reason ?? "transport closed"));
    await this.transport.start();
  }

  /** Perform the MCP handshake and return the server's negotiated capabilities. */
  async initialize(clientName: string, clientVersion: string): Promise<McpInitializeResult> {
    const result = (await this.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: clientName, version: clientVersion },
    })) as McpInitializeResult;
    // Per spec, the client confirms readiness with a notification (no response).
    this.notify("notifications/initialized");
    return result;
  }

  async listTools(): Promise<McpToolSpec[]> {
    const result = (await this.request("tools/list")) as { tools?: McpToolSpec[] };
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request("tools/call", { name, arguments: args });
  }

  async ping(): Promise<void> {
    await this.request("ping");
  }

  async close(): Promise<void> {
    this.closed = true;
    this.failAll("client closed");
    await this.transport.close();
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("MCP client is closed"));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.transport.send({ jsonrpc: "2.0", id, method, params });
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private notify(method: string, params?: unknown): void {
    this.transport.send({ jsonrpc: "2.0", method, params });
  }

  private handleMessage(message: JsonRpcMessage): void {
    // Only responses (id + result/error) resolve pending requests. Server-initiated
    // requests/notifications are ignored by this read-focused client.
    if (message.id === undefined) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(`MCP error ${message.error.code}: ${message.error.message}`));
    } else {
      pending.resolve(message.result);
    }
  }

  private failAll(reason: string): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
