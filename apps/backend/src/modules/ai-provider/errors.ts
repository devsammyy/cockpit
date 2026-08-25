export class LlmError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly rawError?: any,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class LlmAuthenticationError extends LlmError {
  constructor(message: string, provider: string, rawError?: any) {
    super(message, "LLM_AUTHENTICATION_FAILURE", provider, 401, rawError);
  }
}

export class LlmRateLimitError extends LlmError {
  constructor(message: string, provider: string, rawError?: any) {
    super(message, "LLM_RATE_LIMIT_EXCEEDED", provider, 429, rawError);
  }
}

export class LlmTimeoutError extends LlmError {
  constructor(message: string, provider: string, rawError?: any) {
    super(message, "LLM_REQUEST_TIMEOUT", provider, 408, rawError);
  }
}

export class LlmMalformedResponseError extends LlmError {
  constructor(message: string, provider: string, rawError?: any) {
    super(message, "LLM_MALFORMED_RESPONSE", provider, 502, rawError);
  }
}

export class LlmModelUnavailableError extends LlmError {
  constructor(message: string, provider: string, rawError?: any) {
    super(message, "LLM_MODEL_UNAVAILABLE", provider, 404, rawError);
  }
}

export class LlmNetworkError extends LlmError {
  constructor(message: string, provider: string, rawError?: any) {
    super(message, "LLM_NETWORK_FAILURE", provider, 503, rawError);
  }
}

export class LlmQuotaExhaustedError extends LlmError {
  constructor(message: string, provider: string, rawError?: any) {
    super(message, "LLM_QUOTA_EXHAUSTED", provider, 403, rawError);
  }
}

export class LlmContextOverflowError extends LlmError {
  constructor(message: string, provider: string, rawError?: any) {
    super(message, "LLM_CONTEXT_WINDOW_OVERFLOW", provider, 400, rawError);
  }
}

export class LlmToolInvocationError extends LlmError {
  constructor(message: string, provider: string, rawError?: any) {
    super(message, "LLM_TOOL_INVOCATION_FAILURE", provider, 400, rawError);
  }
}
