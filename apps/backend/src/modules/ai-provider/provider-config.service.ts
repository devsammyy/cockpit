import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../../config/env.schema";
import { OpenAICompatibleConfig } from "./openai-compatible.provider";
import { LiteLLMConfig } from "./litellm.provider";
import { NIMConfig } from "./nim.provider";

/**
 * Configuration for a single AI provider.
 */
export interface ProviderConfig {
  /** Provider type: "openai" | "litellm" | "nim" | "openai-compatible" | "custom" */
  type: string;
  /** Unique name for this provider instance */
  name: string;
  /** Base URL for the API */
  baseUrl: string;
  /** API key */
  apiKey: string;
  /** Default model */
  defaultModel?: string;
  /** Model for tool calling */
  toolModel?: string;
  /** Additional headers */
  extraHeaders?: Record<string, string>;
  /** Request timeout in ms */
  timeoutMs?: number;
  /** Max retry attempts */
  maxAttempts?: number;
  /** LiteLLM-specific fields */
  virtualKey?: string;
  teamId?: string;
  trackCost?: boolean;
  fallbackModels?: string;
  /** NIM-specific fields */
  ngcApiKey?: string;
  modelRepository?: string;
  enableProfiling?: boolean;
  /** Whether this provider is enabled */
  enabled?: boolean;
  /** Priority for fallback (higher = tried first) */
  priority?: number;
}

/**
 * Service for managing AI provider configurations.
 * Reads from environment variables and database.
 */
@Injectable()
export class ProviderConfigService {
  private readonly logger = new Logger(ProviderConfigService.name);
  private readonly defaultProviders: ProviderConfig[] = [];

  constructor(private readonly configService: ConfigService<EnvironmentVariables, true>) {
    this.loadDefaultProviders();
  }

  private loadDefaultProviders(): void {
    // Load Qwen/DashScope as default OpenAI-compatible provider
    const qwenApiKey = this.configService.get<string>("QWEN_API_KEY", { infer: true });
    const qwenApiUrl = this.configService.get<string>("QWEN_API_URL", { infer: true });

    if (qwenApiKey && qwenApiKey !== "mock-key") {
      this.defaultProviders.push({
        type: "openai-compatible",
        name: "qwen",
        baseUrl: qwenApiUrl || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        apiKey: qwenApiKey,
        defaultModel: "qwen-plus",
        toolModel: "qwen-max",
        enabled: true,
        priority: 100,
      });
    }

    // Load OpenAI if configured
    const openaiApiKey = process.env["OPENAI_API_KEY"];
    if (openaiApiKey) {
      this.defaultProviders.push({
        type: "openai-compatible",
        name: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: openaiApiKey,
        defaultModel: "gpt-4o",
        toolModel: "gpt-4o",
        enabled: true,
        priority: 90,
      });
    }

    // Load Anthropic if configured (via OpenAI-compatible proxy)
    const anthropicApiKey = process.env["ANTHROPIC_API_KEY"];
    if (anthropicApiKey) {
      this.defaultProviders.push({
        type: "openai-compatible",
        name: "anthropic",
        baseUrl: "https://api.anthropic.com/v1", // Requires proxy or use LiteLLM
        apiKey: anthropicApiKey,
        defaultModel: "claude-3-5-sonnet-20241022",
        enabled: true,
        priority: 80,
      });
    }

    // Load LiteLLM if configured
    const litellmUrl = process.env["LITELLM_BASE_URL"] || process.env["LITELLM_API_URL"];
    const litellmKey = process.env["LITELLM_API_KEY"];
    if (litellmUrl && litellmKey) {
      this.defaultProviders.push({
        type: "litellm",
        name: "litellm",
        baseUrl: litellmUrl,
        apiKey: litellmKey,
        virtualKey: process.env["LITELLM_VIRTUAL_KEY"],
        teamId: process.env["LITELLM_TEAM_ID"],
        trackCost: true,
        fallbackModels: process.env["LITELLM_FALLBACK_MODELS"],
        enabled: true,
        priority: 95,
      });
    }

    // Load NVIDIA NIM if configured
    const nimUrl = process.env["NIM_BASE_URL"];
    const nimKey = process.env["NIM_API_KEY"] || process.env["NGC_API_KEY"];
    if (nimUrl && nimKey) {
      this.defaultProviders.push({
        type: "nim",
        name: "nim",
        baseUrl: nimUrl,
        apiKey: nimKey,
        ngcApiKey: process.env["NGC_API_KEY"],
        modelRepository: process.env["NIM_MODEL_REPOSITORY"],
        enableProfiling: process.env["NIM_ENABLE_PROFILING"] === "true",
        enabled: true,
        priority: 85,
      });
    }

    // Load custom OpenAI-compatible endpoints from env
    // Format: CUSTOM_PROVIDER_<NAME>_URL, CUSTOM_PROVIDER_<NAME>_KEY, etc.
    for (const [key, value] of Object.entries(process.env)) {
      const match = key.match(/^CUSTOM_PROVIDER_([A-Z0-9_]+)_URL$/);
      if (match && match[1] && value) {
        const providerName = match[1].toLowerCase();
        const apiKey = process.env[`CUSTOM_PROVIDER_${match[1]}_KEY`];
        if (apiKey) {
          this.defaultProviders.push({
            type: "openai-compatible",
            name: `custom-${providerName}`,
            baseUrl: value,
            apiKey,
            defaultModel: process.env[`CUSTOM_PROVIDER_${match[1]}_DEFAULT_MODEL`],
            toolModel: process.env[`CUSTOM_PROVIDER_${match[1]}_TOOL_MODEL`],
            extraHeaders: this.parseExtraHeaders(process.env[`CUSTOM_PROVIDER_${match[1]}_HEADERS`]),
            enabled: process.env[`CUSTOM_PROVIDER_${match[1]}_ENABLED`] !== "false",
            priority: parseInt(process.env[`CUSTOM_PROVIDER_${match[1]}_PRIORITY`] || "50", 10),
          });
        }
      }
    }
  }

  private parseExtraHeaders(headersStr?: string): Record<string, string> | undefined {
    if (!headersStr) return undefined;
    try {
      return JSON.parse(headersStr);
    } catch {
      this.logger.warn(`Failed to parse extra headers: ${headersStr}`);
      return undefined;
    }
  }

  /**
   * Get all configured providers.
   */
  getProviders(): ProviderConfig[] {
    return [...this.defaultProviders].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Get a specific provider by name.
   */
  getProvider(name: string): ProviderConfig | undefined {
    return this.defaultProviders.find((p) => p.name === name);
  }

  /**
   * Get enabled providers only.
   */
  getEnabledProviders(): ProviderConfig[] {
    return this.getProviders().filter((p) => p.enabled !== false);
  }

  /**
   * Get providers by type.
   */
  getProvidersByType(type: string): ProviderConfig[] {
    return this.getEnabledProviders().filter((p) => p.type === type);
  }

  /**
   * Get the highest priority provider.
   */
  getPrimaryProvider(): ProviderConfig | undefined {
    const providers = this.getEnabledProviders();
    return providers.length > 0 ? providers[0] : undefined;
  }

  /**
   * Validate a provider configuration.
   */
  validateProvider(config: ProviderConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.name) errors.push("Provider name is required");
    if (!config.type) errors.push("Provider type is required");
    if (!config.baseUrl) errors.push("Base URL is required");
    if (!config.apiKey) errors.push("API key is required");

    const validTypes = ["openai-compatible", "litellm", "nim", "custom"];
    if (config.type && !validTypes.includes(config.type)) {
      errors.push(`Invalid provider type: ${config.type}. Must be one of: ${validTypes.join(", ")}`);
    }

    try {
      new URL(config.baseUrl);
    } catch {
      errors.push("Base URL must be a valid URL");
    }

    return { valid: errors.length === 0, errors };
  }
}