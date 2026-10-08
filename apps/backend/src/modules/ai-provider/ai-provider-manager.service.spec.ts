import { Test } from "@nestjs/testing";
import { AiProviderManagerService } from "./ai-provider-manager.service";
import { ProviderFactoryService } from "./provider-factory.service";
import { ProviderConfigService } from "./provider-config.service";
import { ModelRegistryService } from "./model-registry.service";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { BadRequestException } from "@nestjs/common";

describe("AiProviderManagerService", () => {
  let manager: AiProviderManagerService;
  let providerMock1: any;
  let providerMock2: any;
  let registryMock: any;
  let prismaMock: any;
  let configMock: any;
  let providerFactory: ProviderFactoryService;

  beforeEach(async () => {
    providerMock1 = {
      chat: jest.fn(),
      stream: jest.fn(),
    };

    providerMock2 = {
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

    configMock = {
      getEnabledProviders: jest.fn().mockReturnValue([]),
      getPrimaryProvider: jest.fn().mockReturnValue(undefined),
      validateProvider: jest.fn().mockReturnValue({ valid: true, errors: [] }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AiProviderManagerService,
        ProviderFactoryService,
        { provide: ProviderConfigService, useValue: configMock },
        { provide: ModelRegistryService, useValue: registryMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    manager = moduleRef.get<AiProviderManagerService>(AiProviderManagerService);
    providerFactory = moduleRef.get<ProviderFactoryService>(ProviderFactoryService);

    // Manually register two mock providers for testing fallback
    await providerFactory.registerProvider({
      type: "openai-compatible",
      name: "primary",
      baseUrl: "http://test1",
      apiKey: "key1",
      defaultModel: "test-model",
      enabled: true,
      priority: 100,
    });
    await providerFactory.registerProvider({
      type: "openai-compatible",
      name: "fallback",
      baseUrl: "http://test2",
      apiKey: "key2",
      defaultModel: "test-model",
      enabled: true,
      priority: 50,
    });

    // Replace the internal providers with our mocks
    (providerFactory as any).providers.set("primary", providerMock1);
    (providerFactory as any).providers.set("fallback", providerMock2);
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
    // First provider throws, second succeeds
    providerMock1.chat.mockRejectedValueOnce(new Error("API Timeout"));
    providerMock2.chat.mockResolvedValueOnce({
      message: { role: "assistant", content: "Fallback content" },
    });

    const res = await manager.chat([{ role: "user", content: "test" }], {
      modelId: "test-model",
      orgId: "org_1",
    });

    expect(res.message.content).toBe("Fallback content");
    expect(providerMock1.chat).toHaveBeenCalledTimes(1);
    expect(providerMock2.chat).toHaveBeenCalledTimes(1);
  });
});
