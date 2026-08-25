import { ConnectorInvokerService, interpolate, interpolateDeep } from "./connector-invoker.service";
import type { ToolExecutionContext } from "./tool-execution-context";

function fakeContext(): ToolExecutionContext {
  return {
    executionId: "exec_1",
    organizationId: "org_1",
    userId: "user_1",
    actorType: "USER",
    source: "DIRECT",
    signal: new AbortController().signal,
    deadline: Date.now() + 10_000,
    metadata: {},
    getSecret: async () => null,
    log: () => undefined,
  };
}

describe("interpolate", () => {
  it("replaces dot-path tokens and renders objects as JSON", () => {
    expect(interpolate("Hi {{ user.name }}", { user: { name: "Ada" } })).toBe("Hi Ada");
    expect(interpolate("{{ missing }}", {})).toBe("");
    expect(interpolate("{{ obj }}", { obj: { a: 1 } })).toBe('{"a":1}');
  });

  it("interpolateDeep walks nested structures", () => {
    const out = interpolateDeep({ url: "/r/{{ id }}", tags: ["{{ id }}"] }, { id: "42" });
    expect(out).toEqual({ url: "/r/42", tags: ["42"] });
  });
});

describe("ConnectorInvokerService SSRF guard", () => {
  const service = new ConnectorInvokerService();

  it("rejects loopback / private targets", async () => {
    await expect(
      service.invoke({ endpoint: "http://localhost:9200/x" }, {}, fakeContext()),
    ).rejects.toThrow(/not permitted/i);
    await expect(
      service.invoke({ endpoint: "http://192.168.0.5/x" }, {}, fakeContext()),
    ).rejects.toThrow(/not permitted/i);
  });

  it("rejects non-http protocols", async () => {
    await expect(
      service.invoke({ endpoint: "file:///etc/passwd" }, {}, fakeContext()),
    ).rejects.toThrow(/protocol/i);
  });
});
