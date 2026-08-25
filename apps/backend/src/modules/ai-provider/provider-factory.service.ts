import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { LLM_PROVIDER, LlmProvider } from "./llm-provider.interface";

@Injectable()
export class ProviderFactoryService {
  constructor(@Inject(LLM_PROVIDER) private readonly defaultProvider: LlmProvider) {}

  /**
   * Resolve an LlmProvider instance matching the provider configuration.
   */
  getProvider(providerName: string): LlmProvider {
    const formatted = providerName.toUpperCase();
    if (formatted === "QWEN") {
      return this.defaultProvider;
    }
    // Expand here for other future provider mappings
    throw new NotFoundException(`AI Provider ${providerName} is not registered or supported`);
  }
}
