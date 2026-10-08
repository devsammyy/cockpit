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
 * LiteLLM-specific configuration.
 * LiteLLM supports advanced features like:
 * - Model routing/fallbacks
 * - Cost tracking per model
 * - Budget enforcement
 * - Team/org virtual keys
 * - Load balancing across multiple endpoints
 */
export interface LiteLLMConfig extends OpenAICompatibleConfig {
  /** LiteLLM-specific: virtual key for team/org isolation */
  virtualKey?: string;
  /** LiteLLM-specific: team ID for budget tracking */
  teamId?: string;
  /** LiteLLM-specific: enable cost tracking headers */
  trackCost?: boolean;
  /** LiteLLM-specific: fallback models (comma-separated) */
  fallbackModels?: string;
}

/**
 * LiteLLM Provider - extends OpenAI-compatible with LiteLLM-specific features.
 * LiteLLM exposes an OpenAI-compatible API but adds extra headers and capabilities.
 */
@Injectable()
export class LiteLLMProvider extends OpenAICompatibleProvider implements LlmProvider {
  private readonly litellmConfig: LiteLLMConfig;

  constructor(
    config: LiteLLMConfig,
    configService?: ConfigService<EnvironmentVariables, true>,
  ) {
    super({ ...config, name: "litellm" }, configService);
    this.litellmConfig = {
      trackCost: true,
      ...config,
    };
  }

  private getLiteLLMHeaders(): Record<string, string> {
    const headers = this.getHeaders();

    // LiteLLM-specific headers
    if (this.litellmConfig.virtualKey) {
      headers["x-litellm-virtual-key"] = this.litellmConfig.virtualKey;
    }
    if (this.litellmConfig.teamId) {
      headers["x-litellm-team-id"] = this.litellmConfig.teamId;
    }
    if (this.litellmConfig.trackCost) {
      headers["x-litellm-track-cost"] = "true";
    }
    if (this.litellmConfig.fallbackModels) {
      headers["x-litellm-fallbacks"] = this.litellmConfig.fallbackModels;
    }

    return headers;
  }

  // Override to use LiteLLM-specific headers
  override async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    // Use parent implementation but with LiteLLM headers
    // We need to re-implement the fetch to use custom headers
    return this.chatWithLiteLLMHeaders(messages, options);
  }

  private async chatWithLiteLLMHeaders(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (this.isMockMode()) {
      this.logger.log("[Mock] LiteLLM chat completion invoked");
      return this.generateMockResponse(messages, options);
    }

    try {
      const hasTools = options?.tools && options.tools.length > 0;
      const model = this.getModel(options, hasTools);

      const response = await this.fetchWithRetry(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.getLiteLLMHeaders(),
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
          // LiteLLM-specific fields
          metadata: options?.metadata || {},
          user: options?.user,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LiteLLM API failed: ${response.statusText} (${response.status}) - ${errorText}`);
      }

      const body = await response.json();
      const choice = body.choices?.[0];

      if (!choice) {
        throw new Error("LiteLLM API returned no choices");
      }

      // Extract LiteLLM-specific response metadata
      const cost = body._litellm_response_cost;
      const hiddenParams = body.hidden_params;

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
        // Attach LiteLLM-specific metadata
        litellm: cost
          ? {
              cost,
              model: body.model,
              provider: hiddenParams?.model_provider,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.error("Failed to generate chat completion from LiteLLM", error);
      this.handleProviderError(error);
    }
  }

  override async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatResponseChunk> {
    if (this.isMockMode()) {
      this.logger.log("[Mock] LiteLLM streaming chat completion invoked");
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
        headers: this.getLiteLLMHeaders(),
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
        throw new Error(`LiteLLM stream API failed: ${response.statusText} (${response.status})`);
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
      this.logger.error("Failed to parse chat stream from LiteLLM", error);
      this.handleProviderError(error);
    }
  }

  override async embeddings(text: string | string[], options?: ChatOptions): Promise<number[][]> {
    if (this.isMockMode()) {
      this.logger.log("[Mock] LiteLLM embeddings invoked");
      const inputs = Array.isArray(text) ? text : [text];
      return inputs.map(() => Array.from({ length: 1536 }, () => Math.random() * 2 - 1));
    }

    try {
      const inputs = Array.isArray(text) ? text : [text];
      const response = await this.fetchWithRetry(`${this.config.baseUrl}/embeddings`, {
        method: "POST",
        headers: this.getLiteLLMHeaders(),
        body: JSON.stringify({
          model: this.config.defaultModel || "text-embedding-3-small",
          input: inputs,
        }),
      });

      if (!response.ok) {
        throw new Error(`LiteLLM Embeddings API failed: ${response.statusText} (${response.status})`);
      }

      const body = await response.json();
      return body.data.map((item: any) => item.embedding);
    } catch (error) {
      this.logger.error("Failed to generate embeddings from LiteLLM", error);
      this.handleProviderError(error);
    }
  }

  /**
   * LiteLLM-specific: Get cost and usage report for a virtual key or team.
   */
  async getCostReport(virtualKey?: string, teamId?: string): Promise<any> {
    if (this.isMockMode()) {
      return { totalCost: 0, requests: 0, models: {} };
    }

    try {
      const headers = this.getLiteLLMHeaders();
      const params = new URLSearchParams();
      if (virtualKey) params.set("virtual_key", virtualKey);
      if (teamId) params.set("team_id", teamId);

      const response = await this.fetchWithRetry(
        `${this.config.baseUrl}/litellm/cost?${params.toString()}`,
        { method: "GET", headers },
      );

      if (!response.ok) {
        throw new Error(`LiteLLM cost API failed: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      this.logger.error("Failed to get LiteLLM cost report", error);
      throw error;
    }
  }

  /**
   * LiteLLM-specific: Get available models from LiteLLM config.
   */
  async getModels(): Promise<any[]> {
    if (this.isMockMode()) {
      return [];
    }

    try {
      const headers = this.getLiteLLMHeaders();
      const response = await this.fetchWithRetry(`${this.config.baseUrl}/models`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`LiteLLM models API failed: ${response.statusText}`);
      }

      const body = await response.json();
      return body.data || [];
    } catch (error) {
      this.logger.error("Failed to get LiteLLM models", error);
      throw error;
    }
  }
}