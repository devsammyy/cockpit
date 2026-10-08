import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../../config/env.schema";
import {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatResponseChunk,
  ToolCall,
} from "@qwen-autopilot/shared-types";
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

/**
 * Configuration for an OpenAI-compatible provider.
 */
export interface OpenAICompatibleConfig {
  /** Provider name (e.g., "openai", "litellm", "nim", "custom") */
  name: string;
  /** Base URL for the API (e.g., "https://api.openai.com/v1") */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Default model to use when none specified */
  defaultModel?: string;
  /** Model to use when tools are requested */
  toolModel?: string;
  /** Additional headers to include in requests */
  extraHeaders?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum retry attempts */
  maxAttempts?: number;
}

/**
 * A generic provider for any OpenAI-compatible API endpoint.
 * Works with: OpenAI, Anthropic (via proxy), LiteLLM, NVIDIA NIM, vLLM, TGI, Ollama, etc.
 */
@Injectable()
export class OpenAICompatibleProvider implements LlmProvider {
  protected readonly logger = new Logger(OpenAICompatibleProvider.name);
  protected readonly config: OpenAICompatibleConfig;

  constructor(
    config: OpenAICompatibleConfig,
    private readonly configService?: ConfigService<EnvironmentVariables, true>,
  ) {
    this.config = {
      maxAttempts: MAX_ATTEMPTS,
      timeoutMs: REQUEST_TIMEOUT_MS,
      ...config,
    };
  }

  protected isMockMode(): boolean {
    return this.config.apiKey === "mock-key" || process.env["NODE_ENV"] === "test";
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** A network/connection error worth retrying. */
  protected isTransientNetworkError(error: unknown): boolean {
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
   * Fetch with per-attempt timeout and exponential-backoff retries.
   */
  protected async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.config.maxAttempts!; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(this.config.timeoutMs!),
        });
        if (RETRYABLE_STATUSES.has(response.status) && attempt < this.config.maxAttempts!) {
          this.logger.warn(
            `${this.config.name} API returned ${response.status}; retrying (${attempt}/${this.config.maxAttempts})`,
          );
          await this.delay(BASE_RETRY_DELAY_MS * attempt);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < this.config.maxAttempts! && this.isTransientNetworkError(error)) {
          this.logger.warn(
            `${this.config.name} API network error "${(error as Error).message}"; retrying (${attempt}/${this.config.maxAttempts})`,
          );
          await this.delay(BASE_RETRY_DELAY_MS * attempt);
          continue;
        }
        throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`${this.config.name} API request failed`);
  }

  protected handleProviderError(error: any): never {
    const message = error.message || String(error);

    if (error instanceof LlmError) {
      throw error;
    }

    const status = error.status || error.statusCode;

    if (status === 401) {
      throw new LlmAuthenticationError(`Authentication failed: ${message}`, this.config.name, error);
    }
    if (status === 403) {
      throw new LlmQuotaExhaustedError(`Quota/permission error: ${message}`, this.config.name, error);
    }
    if (status === 429) {
      throw new LlmRateLimitError(`Rate limit exceeded: ${message}`, this.config.name, error);
    }
    if (status === 404) {
      throw new LlmModelUnavailableError(`Model not found: ${message}`, this.config.name, error);
    }
    if (message.includes("timeout") || message.includes("Abort")) {
      throw new LlmTimeoutError(`Request timed out: ${message}`, this.config.name, error);
    }
    if (
      message.includes("context") ||
      message.includes("maximum length") ||
      message.includes("overflow") ||
      message.includes("token limit")
    ) {
      throw new LlmContextOverflowError(`Context window exceeded: ${message}`, this.config.name, error);
    }

    throw new LlmNetworkError(`API call failed: ${message}`, this.config.name, error);
  }

  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    if (this.config.extraHeaders) {
      Object.assign(headers, this.config.extraHeaders);
    }
    return headers;
  }

  protected getModel(options?: ChatOptions, hasTools = false): string {
    if (hasTools && this.config.toolModel) return this.config.toolModel;
    if (options?.model) return options.model;
    return this.config.defaultModel || "gpt-4o";
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (this.isMockMode()) {
      this.logger.log(`[Mock] ${this.config.name} chat completion invoked`);
      return this.generateMockResponse(messages, options);
    }

    try {
      const hasTools = options?.tools && options.tools.length > 0;
      const model = this.getModel(options, hasTools);

      const response = await this.fetchWithRetry(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model,
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
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${this.config.name} API failed: ${response.statusText} (${response.status}) - ${errorText}`);
      }

      const body = await response.json();
      const choice = body.choices?.[0];

      if (!choice) {
        throw new Error(`${this.config.name} API returned no choices`);
      }

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
      this.logger.error(`Failed to generate chat completion from ${this.config.name}`, error);
      this.handleProviderError(error);
    }
  }

  async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatResponseChunk> {
    if (this.isMockMode()) {
      this.logger.log(`[Mock] ${this.config.name} streaming chat completion invoked`);
      const mockResponse = this.generateMockResponse(messages, options);
      const text = mockResponse.message.content;
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
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return;
    }

    try {
      const hasTools = options?.tools && options.tools.length > 0;
      const model = this.getModel(options, hasTools);

      const response = await this.fetchWithRetry(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model,
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
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`${this.config.name} stream API failed: ${response.statusText} (${response.status})`);
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
            const choice = parsed.choices?.[0];
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
      this.logger.error(`Failed to parse chat stream from ${this.config.name}`, error);
      this.handleProviderError(error);
    }
  }

  async embeddings(text: string | string[], options?: ChatOptions): Promise<number[][]> {
    if (this.isMockMode()) {
      this.logger.log(`[Mock] ${this.config.name} embeddings invoked`);
      const inputs = Array.isArray(text) ? text : [text];
      return inputs.map(() => Array.from({ length: 1536 }, () => Math.random() * 2 - 1));
    }

    try {
      const inputs = Array.isArray(text) ? text : [text];
      const response = await this.fetchWithRetry(`${this.config.baseUrl}/embeddings`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: options?.embeddingModel || this.config.defaultModel || "text-embedding-3-small",
          input: inputs,
        }),
      });

      if (!response.ok) {
        throw new Error(`${this.config.name} Embeddings API failed: ${response.statusText} (${response.status})`);
      }

      const body = await response.json();
      return body.data.map((item: any) => item.embedding);
    } catch (error) {
      this.logger.error(`Failed to generate embeddings from ${this.config.name}`, error);
      this.handleProviderError(error);
    }
  }

  protected generateMockResponse(messages: ChatMessage[], options?: ChatOptions): ChatResponse {
    const lastMessage = messages[messages.length - 1]?.content || "";

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