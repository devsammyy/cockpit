import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { ProviderConfig, ProviderConfigService } from "./provider-config.service";
import { OpenAICompatibleProvider } from "./openai-compatible.provider";
import { LiteLLMProvider } from "./litellm.provider";
import { NIMProvider } from "./nim.provider";
import { LlmProvider } from "./llm-provider.interface";

/**
 * Factory for creating and managing AI provider instances.
 * Supports dynamic provider registration and fallback chains.
 */
@Injectable()
export class ProviderFactoryService implements OnModuleInit {
  private readonly logger = new Logger(ProviderFactoryService.name);
  private readonly providers = new Map<string, LlmProvider>();
  private readonly providerConfigs = new Map<string, ProviderConfig>();
  private primaryProviderName: string | null = null;

  constructor(
    private readonly configService: ProviderConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initializeProviders();
  }

  /**
   * Initialize all configured providers.
   */
  private async initializeProviders(): Promise<void> {
    const configs = this.configService.getEnabledProviders();

    if (configs.length === 0) {
      this.logger.warn("No AI providers configured. Using mock mode.");
      return;
    }

    for (const config of configs) {
      try {
        await this.registerProvider(config);
        this.logger.log(`Registered AI provider: ${config.name} (${config.type})`);
      } catch (error) {
        this.logger.error(`Failed to register provider ${config.name}:`, error);
      }
    }

    // Set primary provider (highest priority)
    const primaryConfig = this.configService.getPrimaryProvider();
    if (primaryConfig) {
      this.primaryProviderName = primaryConfig.name;
      this.logger.log(`Primary AI provider: ${this.primaryProviderName}`);
    }
  }

  /**
   * Register a provider from configuration.
   */
  async registerProvider(config: ProviderConfig): Promise<void> {
    const validation = this.configService.validateProvider(config);
    if (!validation.valid) {
      throw new Error(`Invalid provider config for ${config.name}: ${validation.errors.join(", ")}`);
    }

    let provider: LlmProvider;

    switch (config.type) {
      case "litellm":
        provider = new LiteLLMProvider(config as ProviderConfig & { type: "litellm" });
        break;
      case "nim":
        provider = new NIMProvider(config as ProviderConfig & { type: "nim" });
        break;
      case "openai-compatible":
      case "custom":
      default:
        provider = new OpenAICompatibleProvider(config);
        break;
    }

    this.providers.set(config.name, provider);
    this.providerConfigs.set(config.name, config);
  }

  /**
   * Get a provider by name.
   */
  getProvider(name: string): LlmProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new NotFoundException(`AI Provider ${name} is not registered`);
    }
    return provider;
  }

  /**
   * Get the primary (highest priority) provider.
   */
  getPrimaryProvider(): LlmProvider {
    if (!this.primaryProviderName) {
      throw new NotFoundException("No primary AI provider configured");
    }
    return this.getProvider(this.primaryProviderName);
  }

  /**
   * Get all registered provider names.
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get provider configuration by name.
   */
  getProviderConfig(name: string): ProviderConfig | undefined {
    return this.providerConfigs.get(name);
  }

  /**
   * Get all provider configurations.
   */
  getAllProviderConfigs(): ProviderConfig[] {
    return Array.from(this.providerConfigs.values());
  }

  /**
   * Create a fallback chain for a given model.
   * Returns providers that support the model, ordered by priority.
   */
  getFallbackChain(modelId: string): LlmProvider[] {
    const chain: LlmProvider[] = [];

    for (const [name, config] of this.providerConfigs) {
      // Check if this provider's default/tool model matches or if it's a generic provider
      if (
        config.defaultModel === modelId ||
        config.toolModel === modelId ||
        config.type === "litellm" || // LiteLLM can route to any model
        config.type === "openai-compatible" // Generic OpenAI-compatible can try any model
      ) {
        const provider = this.providers.get(name);
        if (provider) {
          chain.push(provider);
        }
      }
    }

    // Sort by priority (highest first)
    chain.sort((a, b) => {
      const configA = this.findConfigForProvider(a);
      const configB = this.findConfigForProvider(b);
      return (configB?.priority || 0) - (configA?.priority || 0);
    });

    return chain;
  }

  /**
   * Execute with automatic fallback.
   */
  async executeWithFallback<T>(
    modelId: string,
    operation: (provider: LlmProvider) => Promise<T>,
    excludeProviders: string[] = [],
  ): Promise<T> {
    const chain = this.getFallbackChain(modelId).filter(
      (p) => !excludeProviders.includes(this.findConfigForProvider(p)?.name || ""),
    );

    if (chain.length === 0) {
      throw new NotFoundException(`No providers available for model ${modelId}`);
    }

    let lastError: Error;

    for (const provider of chain) {
      try {
        return await operation(provider);
      } catch (error) {
        lastError = error as Error;
        const config = this.findConfigForProvider(provider);
        this.logger.warn(
          `Provider ${config?.name} failed for model ${modelId}: ${lastError.message}. Trying next...`,
        );
      }
    }

    throw lastError!;
  }

  /**
   * Execute streaming with automatic fallback.
   */
  async *streamWithFallback(
    modelId: string,
    messages: any[],
    options: any,
    excludeProviders: string[] = [],
  ): AsyncIterable<any> {
    const chain = this.getFallbackChain(modelId).filter(
      (p) => !excludeProviders.includes(this.findConfigForProvider(p)?.name || ""),
    );

    if (chain.length === 0) {
      throw new NotFoundException(`No providers available for model ${modelId}`);
    }

    for (const provider of chain) {
      try {
        for await (const chunk of provider.stream(messages, options)) {
          yield chunk;
        }
        return; // Success, exit generator
      } catch (error) {
        const config = this.findConfigForProvider(provider);
        this.logger.warn(
          `Provider ${config?.name} failed streaming for model ${modelId}: ${(error as Error).message}. Trying next...`,
        );
        // Continue to next provider
      }
    }

    throw new Error(`All providers failed for model ${modelId}`);
  }

  private findConfigForProvider(provider: LlmProvider): ProviderConfig | undefined {
    for (const [name, p] of this.providers) {
      if (p === provider) {
        return this.providerConfigs.get(name);
      }
    }
    return undefined;
  }

  /**
   * Get health status of all providers.
   */
  async getHealthStatus(): Promise<Record<string, { healthy: boolean; latency?: number; error?: string }>> {
    const results: Record<string, { healthy: boolean; latency?: number; error?: string }> = {};

    for (const [name, provider] of this.providers) {
      const start = Date.now();
      try {
        // Try a simple health check - ping or minimal request
        await provider.chat(
          [{ role: "user", content: "ping" }],
          { maxTokens: 5, temperature: 0 },
        );
        results[name] = { healthy: true, latency: Date.now() - start };
      } catch (error) {
        results[name] = { healthy: false, latency: Date.now() - start, error: (error as Error).message };
      }
    }

    return results;
  }
}