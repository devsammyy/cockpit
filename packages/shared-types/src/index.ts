export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
  statusCode: number;
  timestamp: string;
}

export interface ApiFailure {
  error: ApiError;
  success: false;
}

export interface ApiSuccess<TData> {
  data: TData;
  success: true;
}

export type ApiResponse<TData> = ApiSuccess<TData> | ApiFailure;

export type DependencyHealthStatus = "ok" | "error";

export interface HealthCheckResponse {
  dependencies: {
    postgres: DependencyHealthStatus;
    redis: DependencyHealthStatus;
  };
  service: string;
  status: DependencyHealthStatus;
  timestamp: string;
  uptimeSeconds: number;
  version: string;
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none" | { type: "string"; function: { name: string } };
  responseFormat?: { type: "text" | "json_object" };
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  message: ChatMessage;
  finishReason: string;
  usage?: TokenUsage;
}

export interface ChatResponseChunk {
  delta: Partial<ChatMessage>;
  finishReason: string | null;
  usage?: TokenUsage;
}
