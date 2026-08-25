import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma.service";

export interface ModelMetadata {
  provider: string;
  modelId: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsVision: boolean;
  supportsStructured: boolean;
  supportsEmbeddings: boolean;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  status: string;
}

@Injectable()
export class ModelRegistryService {
  private readonly logger = new Logger(ModelRegistryService.name);

  // In-memory defaults for fallback and cold-start boots
  private readonly defaultModels: ModelMetadata[] = [
    {
      provider: "QWEN",
      modelId: "qwen-turbo",
      displayName: "Qwen Turbo",
      contextWindow: 30000,
      maxOutputTokens: 8192,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsVision: false,
      supportsStructured: false,
      supportsEmbeddings: true,
      inputPricePerMillion: 300,
      outputPricePerMillion: 600,
      status: "ACTIVE",
    },
    {
      provider: "QWEN",
      modelId: "qwen-plus",
      displayName: "Qwen Plus",
      contextWindow: 30000,
      maxOutputTokens: 8192,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsVision: true,
      supportsStructured: true,
      supportsEmbeddings: true,
      inputPricePerMillion: 1000,
      outputPricePerMillion: 2000,
      status: "ACTIVE",
    },
    {
      provider: "QWEN",
      modelId: "qwen-max",
      displayName: "Qwen Max",
      contextWindow: 30000,
      maxOutputTokens: 8192,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsVision: true,
      supportsStructured: true,
      supportsEmbeddings: false,
      inputPricePerMillion: 6000,
      outputPricePerMillion: 12000,
      status: "ACTIVE",
    },
    {
      provider: "OPENAI",
      modelId: "gpt-4o",
      displayName: "GPT-4o",
      contextWindow: 128000,
      maxOutputTokens: 4096,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsVision: true,
      supportsStructured: true,
      supportsEmbeddings: false,
      inputPricePerMillion: 2500,
      outputPricePerMillion: 10000,
      status: "ACTIVE",
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve model details by ID.
   */
  async getModel(modelId: string): Promise<ModelMetadata> {
    try {
      const dbModel = await this.prisma.modelDefinition.findFirst({
        where: { modelId, status: "ACTIVE" },
      });

      if (dbModel) {
        return {
          provider: dbModel.provider,
          modelId: dbModel.modelId,
          displayName: dbModel.displayName,
          contextWindow: dbModel.contextWindow,
          maxOutputTokens: dbModel.maxOutputTokens,
          supportsStreaming: dbModel.supportsStreaming,
          supportsToolCalling: dbModel.supportsToolCalling,
          supportsVision: dbModel.supportsVision,
          supportsStructured: dbModel.supportsStructured,
          supportsEmbeddings: dbModel.supportsEmbeddings,
          inputPricePerMillion: dbModel.inputPricePerMillion,
          outputPricePerMillion: dbModel.outputPricePerMillion,
          status: dbModel.status,
        };
      }
    } catch {
      // Ignore database connection failures in unit tests and fallback to defaults
    }

    const defaultModel = this.defaultModels.find((m) => m.modelId === modelId);
    if (!defaultModel) {
      throw new Error(`Model ${modelId} not supported or active in registry`);
    }
    return defaultModel;
  }

  /**
   * Retrieve all active models.
   */
  async getActiveModels(): Promise<ModelMetadata[]> {
    try {
      const dbModels = await this.prisma.modelDefinition.findMany({
        where: { status: "ACTIVE" },
      });
      if (dbModels.length > 0) {
        return dbModels.map((dbModel) => ({
          provider: dbModel.provider,
          modelId: dbModel.modelId,
          displayName: dbModel.displayName,
          contextWindow: dbModel.contextWindow,
          maxOutputTokens: dbModel.maxOutputTokens,
          supportsStreaming: dbModel.supportsStreaming,
          supportsToolCalling: dbModel.supportsToolCalling,
          supportsVision: dbModel.supportsVision,
          supportsStructured: dbModel.supportsStructured,
          supportsEmbeddings: dbModel.supportsEmbeddings,
          inputPricePerMillion: dbModel.inputPricePerMillion,
          outputPricePerMillion: dbModel.outputPricePerMillion,
          status: dbModel.status,
        }));
      }
    } catch {
      // Fallback
    }

    return this.defaultModels;
  }
}
