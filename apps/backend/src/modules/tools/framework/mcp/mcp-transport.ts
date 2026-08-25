import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

/** Current MCP protocol revision this client negotiates. */
export const MCP_PROTOCOL_VERSION = "2024-11-05";

/** A JSON-RPC 2.0 message (request, response, or notification). */
export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Bidirectional message channel to an MCP server. This is the single seam that
 * varies by deployment — stdio (local process), SSE, or streamable HTTP (remote)
 * — so the RPC client and lifecycle manager never depend on the transport.
 * The official `@modelcontextprotocol/sdk` transports can be dropped in behind
 * this same interface with no call-site changes.
 */
export interface McpTransport {
  start(): Promise<void>;
  send(message: JsonRpcMessage): void;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  onClose(handler: (reason?: string) => void): void;
  close(): Promise<void>;
}

/**
 * stdio transport: spawns the server process and exchanges newline-delimited
 * JSON-RPC messages over stdin/stdout (the MCP stdio framing). stderr is treated
 * as diagnostic log output.
 */
export class StdioMcpTransport implements McpTransport {
  private child?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private messageHandler?: (message: JsonRpcMessage) => void;
  private closeHandler?: (reason?: string) => void;

  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly env?: Record<string, string>,
  ) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        this.child = spawn(this.command, this.args, {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, ...this.env },
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      this.child.on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
        this.closeHandler?.(err.message);
      });
      this.child.on("exit", (code) => this.closeHandler?.(`process exited with code ${code}`));

      this.child.stdout.setEncoding("utf8");
      this.child.stdout.on("data", (chunk: string) => this.ingest(chunk));
      this.child.stderr.setEncoding("utf8");
      // MCP servers use stderr for logs; swallow to avoid polluting our stdout.
      this.child.stderr.on("data", () => undefined);

      // Spawn is async; if no synchronous error fires, consider the pipe ready.
      setImmediate(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
    });
  }

  send(message: JsonRpcMessage): void {
    if (!this.child) throw new Error("MCP transport not started");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: (reason?: string) => void): void {
    this.closeHandler = handler;
  }

  close(): Promise<void> {
    this.child?.kill("SIGTERM");
    this.child = undefined;
    return Promise.resolve();
  }

  /** Accumulate stdout and dispatch each complete newline-delimited JSON message. */
  private ingest(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) {
        try {
          this.messageHandler?.(JSON.parse(line) as JsonRpcMessage);
        } catch {
          // Ignore non-JSON lines (some servers emit banners on stdout).
        }
      }
      newlineIndex = this.buffer.indexOf("\n");
    }
  }
}
