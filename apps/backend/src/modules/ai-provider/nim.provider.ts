import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../../config/env.schema";
import {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatResponseChunk,
} from "@qwen-autopilot/shared-types";
import { LlmProvider } from "./llm-provider.interface";
import { OpenAICompatibleProvider, OpenAICompatibleConfig } from "./openai-compatible.provider";
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

/**
 * NVIDIA NIM (NVIDIA Inference Microservices) configuration.
 * NIM exposes an OpenAI-compatible API with NVIDIA-specific optimizations.
 * Supports models like Nemotron, Llama, Mixtral, etc. optimized for NVIDIA GPUs.
 */
export interface NIMConfig extends OpenAICompatibleConfig {
  /** NIM-specific: NGC API key (different from model API key) */
  ngcApiKey?: string;
  /** NIM-specific: Model repository (e.g., "nemotron-3-ultra") */
  modelRepository?: string;
  /** NIM-specific: Enable profiling headers */
  enableProfiling?: boolean;
}

/**
 * NVIDIA NIM Provider - extends OpenAI-compatible with NIM-specific features.
 * NIM provides optimized inference for NVIDIA-accelerated models.
 */
@Injectable()
export class NIMProvider extends OpenAICompatibleProvider implements LlmProvider {
  private readonly nimConfig: NIMConfig;

  constructor(
    config: NIMConfig,
    configService?: ConfigService<EnvironmentVariables, true>,
  ) {
    super({ ...config, name: "nim" }, configService);
    this.nimConfig = {
      enableProfiling: false,
      ...config,
    };
  }

  private getNIMHeaders(): Record<string, string> {
    const headers = this.getHeaders();

    // NIM-specific headers
    if (this.nimConfig.ngcApiKey) {
      headers["Authorization"] = `Bearer ${this.nimConfig.ngcApiKey}`;
    }
    if (this.nimConfig.modelRepository) {
      headers["x-nim-model-repository"] = this.nimConfig.modelRepository;
    }
    if (this.nimConfig.enableProfiling) {
      headers["x-nim-profile"] = "true";
    }

    return headers;
  }

  override async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (this.isMockMode()) {
      this.logger.log("[Mock] NIM chat completion invoked");
      return this.generateMockResponse(messages, options);
    }

    try {
      const hasTools = options?.tools && options.tools.length > 0;
      const model = this.getModel(options, hasTools);

      const response = await this.fetchWithRetry(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.getNIMHeaders(),
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
        throw new Error(`NIM API failed: ${response.statusText} (${response.status}) - ${errorText}`);
      }

      const body = await response.json();
      const choice = body.choices?.[0];

      if (!choice) {
        throw new Error("NIM API returned no choices");
      }

      const finishReason = choice.finish_reason ?? "stop";
      const choiceMessage = choice.message;

      const toolCalls = choiceMessage.tool_calls?.map((tc: any) => ({
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
        // Attach NIM-specific metadata
        nim: {
          model: body.model,
          provider: "nvidia-nim",
        },
      };
    } catch (error) {
      this.logger.error("Failed to generate chat completion from NIM", error);
      this.handleProviderError(error);
    }
  }

  override async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatResponseChunk> {
    if (this.isMockMode()) {
      this.logger.log("[Mock] NIM streaming chat completion invoked");
      const mockResponse = this.generateMockResponse(messages, options);
      const text = mockResponse.message.content;
      const words = text.split(" ");
      for (let i = 0; i < words.length; i++) {
        yield {
          delta: { role: "assistant", content: (i === 0 ? "" : " ") + (words[i] ?? "") },
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
        headers: this.getNIMHeaders(),
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
        throw new Error(`NIM stream API failed: ${response.statusText} (${response.status})`);
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
      this.logger.error("Failed to parse chat stream from NIM", error);
      this.handleProviderError(error);
    }
  }

  override async embeddings(text: string | string[], options?: ChatOptions): Promise<number[][]> {
    if (this.isMockMode()) {
      this.logger.log("[Mock] NIM embeddings invoked");
      const inputs = Array.isArray(text) ? text : [text];
      return inputs.map(() => Array.from({ length: 1536 }, () => Math.random() * 2 - 1));
    }

    try {
      const inputs = Array.isArray(text) ? text : [text];
      const response = await this.fetchWithRetry(`${this.config.baseUrl}/embeddings`, {
        method: "POST",
        headers: this.getNIMHeaders(),
        body: JSON.stringify({
          model: this.config.defaultModel || "nvidia/embedding-model",
          input: inputs,
        }),
      });

      if (!response.ok) {
        throw new Error(`NIM Embeddings API failed: ${response.statusText} (${response.status})`);
      }

      const body = await response.json();
      return body.data.map((item: any) => item.embedding);
    } catch (error) {
      this.logger.error("Failed to generate embeddings from NIM", error);
      this.handleProviderError(error);
    }
  }

  /**
   * NIM-specific: Get model health and stats.
   */
  async getHealth(): Promise<any> {
    if (this.isMockMode()) {
      return { status: "healthy", gpuUtilization: 0 };
    }

    try {
      const headers = this.getNIMHeaders();
      const response = await this.fetchWithRetry(`${this.config.baseUrl}/health`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`NIM health API failed: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      this.logger.error("Failed to get NIM health", error);
      throw error;
    }
  }

  /**
   * NIM-specific: Get model info from NIM.
   */
  async getModelInfo(): Promise<any> {
    if (this.isMockMode()) {
      return { model: this.config.defaultModel, repository: this.nimConfig.modelRepository };
    }

    try {
      const headers = this.getNIMHeaders();
      const response = await this.fetchWithRetry(`${this.config.baseUrl}/v1/models`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`NIM models API failed: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      this.logger.error("Failed to get NIM model info", error);
      throw error;
    }
  }
}