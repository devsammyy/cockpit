import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatResponseChunk,
  ToolCall,
} from "@qwen-autopilot/shared-types";
import type { EnvironmentVariables } from "../../config/env.schema";
import { LlmProvider } from "./llm-provider.interface";
import {
  LlmError,
  LlmAuthenticationError,
  LlmRateLimitError,
  LlmTimeoutError,
  LlmModelUnavailableError,
  LlmNetworkError,
  LlmQuotaExhaustedError,
  LlmContextOverflowError,
} from "./errors";

const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 600;
const REQUEST_TIMEOUT_MS = 60_000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

@Injectable()
export class QwenLlmProvider implements LlmProvider {
  private readonly logger = new Logger(QwenLlmProvider.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.apiKey = configService.get<string>("QWEN_API_KEY", { infer: true });
    this.apiUrl = configService.get<string>("QWEN_API_URL", { infer: true });
  }

  private isMockMode(): boolean {
    return this.apiKey === "mock-key" || process.env["NODE_ENV"] === "test";
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** A network/connection error worth retrying (not an application error). */
  private isTransientNetworkError(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return (
      message.includes("fetch failed") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("etimedout") ||
      message.includes("enotfound") ||
      message.includes("eai_again") ||
      message.includes("socket") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("aborted")
    );
  }

  /**
   * Fetch with a per-attempt timeout and exponential-backoff retries for
   * transient failures — a flaky connection or a 502/503 must not fail an
   * entire workflow when the next attempt would have succeeded. Application
   * errors (401/403/400) are returned immediately for the caller to classify.
   */
  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
          this.logger.warn(
            `Qwen API returned ${String(response.status)}; retrying (${String(attempt)}/${String(MAX_ATTEMPTS)})`,
          );
          await this.delay(BASE_RETRY_DELAY_MS * attempt);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_ATTEMPTS && this.isTransientNetworkError(error)) {
          this.logger.warn(
            `Qwen API network error "${(error as Error).message}"; retrying (${String(attempt)}/${String(MAX_ATTEMPTS)})`,
          );
          await this.delay(BASE_RETRY_DELAY_MS * attempt);
          continue;
        }
        throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Qwen API request failed");
  }

  private handleProviderError(error: any): never {
    const message = error.message || String(error);

    if (error instanceof LlmError) {
      throw error;
    }

    const status = error.status || error.statusCode;

    if (status === 401) {
      throw new LlmAuthenticationError(`Authentication failed: ${message}`, "QWEN", error);
    }
    if (status === 403) {
      throw new LlmQuotaExhaustedError(`Quota limits exceeded: ${message}`, "QWEN", error);
    }
    if (status === 429) {
      throw new LlmRateLimitError(`Rate limits exceeded: ${message}`, "QWEN", error);
    }
    if (status === 404) {
      throw new LlmModelUnavailableError(`Model not found or disabled: ${message}`, "QWEN", error);
    }
    if (message.includes("timeout") || message.includes("Abort")) {
      throw new LlmTimeoutError(`Request timed out: ${message}`, "QWEN", error);
    }
    if (
      message.includes("context") ||
      message.includes("maximum length") ||
      message.includes("overflow")
    ) {
      throw new LlmContextOverflowError(`Context window exceeded: ${message}`, "QWEN", error);
    }

    throw new LlmNetworkError(`API Call failed: ${message}`, "QWEN", error);
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (this.isMockMode()) {
      this.logger.log("[Mock] Chat completion invoked");
      return this.generateMockResponse(messages, options);
    }

    try {
      const response = await this.fetchWithRetry(`${this.apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options?.tools && options.tools.length > 0 ? "qwen-max" : "qwen-plus",
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            name: m.name,
            tool_calls: m.toolCalls,
            tool_call_id: m.toolCallId,
          })),
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens,
          top_p: options?.topP,
          tools: options?.tools,
          tool_choice: options?.toolChoice,
          response_format: options?.responseFormat,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Qwen API failed: ${response.statusText} (${response.status}) - ${errorText}`,
        );
      }

      const body = await response.json();
      const choice = body.choices[0];

      const finishReason = choice.finish_reason ?? "stop";
      const choiceMessage = choice.message;

      const toolCalls: ToolCall[] | undefined = choiceMessage.tool_calls?.map((tc: any) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));

      return {
        message: {
          role: choiceMessage.role,
          content: choiceMessage.content || "",
          toolCalls,
        },
        finishReason,
        usage: body.usage
          ? {
              promptTokens: body.usage.prompt_tokens,
              completionTokens: body.usage.completion_tokens,
              totalTokens: body.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.error("Failed to generate chat completion from Qwen API", error);
      this.handleProviderError(error);
    }
  }

  async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatResponseChunk> {
    if (this.isMockMode()) {
      this.logger.log("[Mock] Streaming chat completion invoked");
      const mockResponse = this.generateMockResponse(messages, options);
      const text = mockResponse.message.content;

      // Yield chunks of text
      const words = text.split(" ");
      for (let i = 0; i < words.length; i++) {
        yield {
          delta: {
            role: "assistant",
            content: (i === 0 ? "" : " ") + (words[i] ?? ""),
          },
          finishReason: i === words.length - 1 ? "stop" : null,
          usage: i === words.length - 1 ? mockResponse.usage : undefined,
        };
        // Small delay in mock streaming
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return;
    }

    try {
      const response = await this.fetchWithRetry(`${this.apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "qwen-plus",
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            name: m.name,
            tool_calls: m.toolCalls,
            tool_call_id: m.toolCallId,
          })),
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens,
          top_p: options?.topP,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Qwen stream API failed: ${response.statusText} (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get stream reader from response body");
      }

      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine.startsWith("data:")) continue;

          const dataStr = cleanLine.substring(5).trim();
          if (dataStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(dataStr);
            const choice = parsed.choices[0];
            if (!choice) continue;

            const delta = choice.delta;
            yield {
              delta: {
                role: delta.role,
                content: delta.content || "",
                toolCalls: delta.tool_calls,
              },
              finishReason: choice.finish_reason || null,
              usage: parsed.usage
                ? {
                    promptTokens: parsed.usage.prompt_tokens,
                    completionTokens: parsed.usage.completion_tokens,
                    totalTokens: parsed.usage.total_tokens,
                  }
                : undefined,
            };
          } catch {
            // Ignore incomplete JSON stream chunk parse failures
          }
        }
      }
    } catch (error) {
      this.logger.error("Failed to parse chat stream from Qwen API", error);
      this.handleProviderError(error);
    }
  }

  async embeddings(text: string | string[]): Promise<number[][]> {
    if (this.isMockMode()) {
      this.logger.log("[Mock] Embeddings invoked");
      const inputs = Array.isArray(text) ? text : [text];
      return inputs.map(() => Array.from({ length: 1536 }, () => Math.random() * 2 - 1));
    }

    try {
      const inputs = Array.isArray(text) ? text : [text];
      const response = await this.fetchWithRetry(`${this.apiUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-v2",
          input: inputs,
        }),
      });

      if (!response.ok) {
        throw new Error(`Qwen Embeddings API failed: ${response.statusText} (${response.status})`);
      }

      const body = await response.json();
      return body.data.map((item: any) => item.embedding);
    } catch (error) {
      this.logger.error("Failed to generate embeddings from Qwen API", error);
      this.handleProviderError(error);
    }
  }

  private generateMockResponse(messages: ChatMessage[], options?: ChatOptions): ChatResponse {
    const lastMessage = messages[messages.length - 1]?.content || "";

    // Mock planner triggers
    if (lastMessage.includes("plan") || lastMessage.includes("goal")) {
      return {
        message: {
          role: "assistant",
          content: JSON.stringify({
            steps: [
              {
                id: "step_1",
                type: "AGENT_TASK",
                name: "Research Task",
                config: { agentId: "agent-1", promptTemplate: "Summarize history" },
              },
              {
                id: "step_2",
                type: "TOOL_CALL",
                name: "Store Results",
                config: { toolDefinitionId: "tool-1", arguments: {} },
              },
            ],
            reasoning: "Sequence selected sequentially to isolate steps.",
          }),
        },
        finishReason: "stop",
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
      };
    }

    // Mock tool invocation trigger
    if (options?.tools && options.tools.length > 0 && !lastMessage.includes("result")) {
      const selectedTool = options.tools[0]!;
      const toolCalls: ToolCall[] = [
        {
          id: "call_mock_1",
          type: "function",
          function: {
            name: selectedTool.function.name,
            arguments: JSON.stringify({ mockParam: "mockValue" }),
          },
        },
      ];

      return {
        message: {
          role: "assistant",
          content: "",
          toolCalls,
        },
        finishReason: "tool_calls",
        usage: { promptTokens: 30, completionTokens: 20, totalTokens: 50 },
      };
    }

    // Return fallback mock response
    return {
      message: {
        role: "assistant",
        content: `This is a mock assistant response answering: "${lastMessage.substring(0, 50)}"`,
      },
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
    };
  }
}
