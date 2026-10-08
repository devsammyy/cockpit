import { Module, Global } from "@nestjs/common";
import { LLM_PROVIDER } from "./llm-provider.interface";
import { QwenLlmProvider } from "./qwen-provider.service";
import { OpenAICompatibleProvider } from "./openai-compatible.provider";
import { LiteLLMProvider } from "./litellm.provider";
import { NIMProvider } from "./nim.provider";
import { ModelRegistryService } from "./model-registry.service";
import { ProviderConfigService } from "./provider-config.service";
import { ProviderFactoryService } from "./provider-factory.service";
import { AiProviderManagerService } from "./ai-provider-manager.service";
import { StructuredOutputEngine } from "./structured-output.engine";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { AiProviderController } from "./ai-provider.controller";

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    // Legacy Qwen provider (for backward compatibility)
    {
      provide: LLM_PROVIDER,
      useClass: QwenLlmProvider,
    },
    // New provider implementations
    OpenAICompatibleProvider,
    LiteLLMProvider,
    NIMProvider,
    // Configuration and factory
    ProviderConfigService,
    ProviderFactoryService,
    // Manager and registry
    ModelRegistryService,
    AiProviderManagerService,
    StructuredOutputEngine,
  ],
  controllers: [AiProviderController],
  exports: [
    LLM_PROVIDER,
    // New exports
    OpenAICompatibleProvider,
    LiteLLMProvider,
    NIMProvider,
    ProviderConfigService,
    ProviderFactoryService,
    ModelRegistryService,
    AiProviderManagerService,
    StructuredOutputEngine,
  ],
})
export class AiProviderModule {}