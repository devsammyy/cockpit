import { McpRpcClient } from "./mcp-rpc-client";
import type { JsonRpcMessage, McpTransport } from "./mcp-transport";

/** In-memory transport that answers requests from a method→result map. */
class FakeTransport implements McpTransport {
  private handler?: (message: JsonRpcMessage) => void;
  sent: JsonRpcMessage[] = [];

  constructor(private readonly responder: (method: string) => unknown) {}

  start(): Promise<void> {
    return Promise.resolve();
  }
  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.handler = handler;
  }
  onClose(): void {
    // no-op for the fake
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
  send(message: JsonRpcMessage): void {
    this.sent.push(message);
    if (message.id === undefined || !message.method) return; // notification
    const outcome = this.responder(message.method);
    queueMicrotask(() => {
      if (outcome instanceof Error) {
        this.handler?.({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32000, message: outcome.message },
        });
      } else {
        this.handler?.({ jsonrpc: "2.0", id: message.id, result: outcome });
      }
    });
  }
}

describe("McpRpcClient", () => {
  it("performs the handshake and sends the initialized notification", async () => {
    const transport = new FakeTransport(() => ({
      protocolVersion: "2024-11-05",
      capabilities: {},
      serverInfo: { name: "test-server" },
    }));
    const client = new McpRpcClient(transport);
    await client.start();

    const init = await client.initialize("qwen", "0.1.0");
    expect(init.protocolVersion).toBe("2024-11-05");
    expect(transport.sent.some((m) => m.method === "initialize" && m.id !== undefined)).toBe(true);
    expect(transport.sent.some((m) => m.method === "notifications/initialized")).toBe(true);
  });

  it("lists and calls tools, correlating responses by id", async () => {
    const transport = new FakeTransport((method) => {
      if (method === "tools/list") return { tools: [{ name: "echo", description: "e" }] };
      if (method === "tools/call") return { content: [{ type: "text", text: "ok" }] };
      return {};
    });
    const client = new McpRpcClient(transport);
    await client.start();

    const tools = await client.listTools();
    expect(tools).toEqual([{ name: "echo", description: "e" }]);

    const result = (await client.callTool("echo", { msg: "hi" })) as { content: unknown };
    expect(result.content).toBeDefined();
  });

  it("rejects when the server returns a JSON-RPC error", async () => {
    const transport = new FakeTransport(() => new Error("boom"));
    const client = new McpRpcClient(transport);
    await client.start();
    await expect(client.ping()).rejects.toThrow(/boom/);
  });
});
