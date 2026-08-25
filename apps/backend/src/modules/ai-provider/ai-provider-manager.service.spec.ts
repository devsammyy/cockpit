import { Test } from "@nestjs/testing";
import { AiProviderManagerService } from "./ai-provider-manager.service";
import { ProviderFactoryService } from "./provider-factory.service";
import { ModelRegistryService } from "./model-registry.service";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { BadRequestException } from "@nestjs/common";

describe("AiProviderManagerService", () => {
  let manager: AiProviderManagerService;
  let providerMock: any;
  let registryMock: any;
  let prismaMock: any;

  beforeEach(async () => {
    providerMock = {
      chat: jest.fn(),
      stream: jest.fn(),
    };

    registryMock = {
      getModel: jest.fn().mockResolvedValue({
        provider: "QWEN",
        modelId: "qwen-turbo",
        contextWindow: 1000,
        maxOutputTokens: 500,
        supportsStreaming: true,
        supportsToolCalling: false,
        supportsVision: false,
        supportsStructured: false,
        status: "ACTIVE",
      }),
    };

    prismaMock = {
      tokenQuota: {
        findFirst: jest.fn().mockResolvedValue({
          dailyLimit: 1000000,
          monthlyLimit: 20000000,
          dailyUsed: 500,
          monthlyUsed: 500,
        }),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AiProviderManagerService,
        {
          provide: ProviderFactoryService,
          useValue: {
            getProvider: () => providerMock,
          },
        },
        { provide: ModelRegistryService, useValue: registryMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    manager = moduleRef.get<AiProviderManagerService>(AiProviderManagerService);
  });

  it("verifies capability check blocks incompatible features", async () => {
    // Model doesn't support tool calling in registry mock
    await expect(
      manager.chat([{ role: "user", content: "test" }], {
        modelId: "qwen-turbo",
        orgId: "org_1",
        tools: [{ type: "function", function: { name: "my_tool" } }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("performs correct fallback retry if execution fails", async () => {
    // Let first model run throw error
    providerMock.chat.mockRejectedValueOnce(new Error("API Timeout"));
    // Second model run (qwen-plus fallback) succeeds
    providerMock.chat.mockResolvedValueOnce({
      message: { role: "assistant", content: "Fallback content" },
    });

    const res = await manager.chat([{ role: "user", content: "test" }], {
      modelId: "qwen-max",
      orgId: "org_1",
    });

    expect(res.message.content).toBe("Fallback content");
    expect(providerMock.chat).toHaveBeenCalledTimes(2);
  });
});
