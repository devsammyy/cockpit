import { Module, Global } from "@nestjs/common";
import { LLM_PROVIDER } from "./llm-provider.interface";
import { QwenLlmProvider } from "./qwen-provider.service";
import { ModelRegistryService } from "./model-registry.service";
import { ProviderFactoryService } from "./provider-factory.service";
import { AiProviderManagerService } from "./ai-provider-manager.service";
import { StructuredOutputEngine } from "./structured-output.engine";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { AiProviderController } from "./ai-provider.controller";

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: LLM_PROVIDER,
      useClass: QwenLlmProvider,
    },
    ModelRegistryService,
    ProviderFactoryService,
    AiProviderManagerService,
    StructuredOutputEngine,
  ],
  controllers: [AiProviderController],
  exports: [
    LLM_PROVIDER,
    ModelRegistryService,
    ProviderFactoryService,
    AiProviderManagerService,
    StructuredOutputEngine,
  ],
})
export class AiProviderModule {}
