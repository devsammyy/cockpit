import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatResponseChunk,
} from "@qwen-autopilot/shared-types";

export const LLM_PROVIDER = Symbol("LLM_PROVIDER");

export interface LlmProvider {
  /**
   * Send a chat conversation to the model.
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * Stream a chat conversation response chunk by chunk.
   */
  stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatResponseChunk>;

  /**
   * Generate vector embeddings for the given input text.
   */
  embeddings(text: string | string[]): Promise<number[][]>;
}
