import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { QwenLlmProvider } from "./qwen-provider.service";

describe("QwenLlmProvider", () => {
  let provider: QwenLlmProvider;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        QwenLlmProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "QWEN_API_KEY") return "mock-key";
              if (key === "QWEN_API_URL") return "http://mock-url";
              return "";
            }),
          },
        },
      ],
    }).compile();

    provider = moduleRef.get<QwenLlmProvider>(QwenLlmProvider);
  });

  it("should be defined", () => {
    expect(provider).toBeDefined();
  });

  it("generates mock chat completion in mock mode", async () => {
    const response = await provider.chat([{ role: "user", content: "hello test" }]);
    expect(response.message.role).toBe("assistant");
    expect(response.message.content).toContain("hello test");
    expect(response.finishReason).toBe("stop");
  });

  it("yields streamed chunks in mock mode", async () => {
    const stream = provider.stream([{ role: "user", content: "stream test" }]);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.delta.content).toBeDefined();
    expect(chunks[chunks.length - 1]?.finishReason).toBe("stop");
  });

  it("generates vector dimensions for embeddings", async () => {
    const response = await provider.embeddings("sample test string");
    expect(response.length).toBe(1);
    expect(response[0]?.length).toBe(1536);
  });

  describe("handleProviderError", () => {
    it("maps HTTP 429 status code to LlmRateLimitError", () => {
      expect(() => {
        (provider as any).handleProviderError({ status: 429, message: "Rate limit exceeded" });
      }).toThrow("Rate limits exceeded: Rate limit exceeded");
    });

    it("maps HTTP 401 status code to LlmAuthenticationError", () => {
      expect(() => {
        (provider as any).handleProviderError({ status: 401, message: "Incorrect API key" });
      }).toThrow("Authentication failed: Incorrect API key");
    });

    it("maps context window overflow message to LlmContextOverflowError", () => {
      expect(() => {
        (provider as any).handleProviderError({ message: "maximum context length exceeded" });
      }).toThrow("Context window exceeded: maximum context length exceeded");
    });
  });

  describe("fetchWithRetry (transient resilience)", () => {
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      // Skip the real backoff waits so tests run instantly.
      jest.spyOn(provider as any, "delay").mockResolvedValue(undefined);
      fetchSpy = jest.spyOn(global, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    const call = () =>
      (provider as any).fetchWithRetry("http://x/api", { method: "POST" }) as Promise<Response>;

    it("retries a transient 'fetch failed' and then succeeds", async () => {
      fetchSpy
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockResolvedValueOnce(new Response("{}", { status: 200 }));

      const res = await call();
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("retries a 503 response and then succeeds", async () => {
      fetchSpy
        .mockResolvedValueOnce(new Response("busy", { status: 503 }))
        .mockResolvedValueOnce(new Response("{}", { status: 200 }));

      const res = await call();
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("gives up after the max attempts on a persistent network failure", async () => {
      fetchSpy.mockRejectedValue(new Error("fetch failed"));
      await expect(call()).rejects.toThrow("fetch failed");
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("does NOT retry an auth (401) response — returns it immediately", async () => {
      fetchSpy.mockResolvedValue(new Response("no", { status: 401 }));
      const res = await call();
      expect(res.status).toBe(401);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry a non-transient error", async () => {
      fetchSpy.mockRejectedValue(new Error("Invalid request payload"));
      await expect(call()).rejects.toThrow("Invalid request payload");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
