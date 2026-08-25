import { DbLongTermMemory, DbSemanticMemory } from "./memory.service";
import { ContextBuilderService } from "./context-builder.service";
import { ReflectionEngineService } from "./reflection-engine.service";

describe("Memory Subsystem Services", () => {
  let prismaMock: any;
  let dbEntries: any[] = [];
  let reflectionRecords: any[] = [];

  beforeEach(() => {
    dbEntries = [];
    reflectionRecords = [];

    prismaMock = {
      memoryEntry: {
        findFirst: jest.fn().mockImplementation(async (query) => {
          const key = query?.where?.key;
          const orgId = query?.where?.organizationId;
          return dbEntries.find((e) => e.key === key && e.organizationId === orgId) || null;
        }),
        findMany: jest.fn().mockImplementation(async () => {
          return dbEntries;
        }),
        create: jest.fn().mockImplementation(async (query) => {
          const item = { ...query.data, id: query.data.id || "uuid" };
          dbEntries.push(item);
          return item;
        }),
        update: jest.fn().mockImplementation(async (query) => {
          const existing = dbEntries.find((e) => e.id === query.where.id);
          if (existing) {
            Object.assign(existing, query.data);
          }
          return existing;
        }),
      },
      reflectionRecord: {
        create: jest.fn().mockImplementation(async (query) => {
          const item = { ...query.data, id: "ref-uuid" };
          reflectionRecords.push(item);
          return item;
        }),
      },
    };
  });

  describe("DbLongTermMemory", () => {
    it("stores and retrieves scoped values using DB mock", async () => {
      const memory = new DbLongTermMemory(prismaMock);
      await memory.set("org_1", "test_key", "val_1");
      expect(await memory.get("org_1", "test_key")).toBe("val_1");
    });
  });

  describe("DbSemanticMemory", () => {
    it("performs cosine similarity calculations matching vector proximity", async () => {
      const memory = new DbSemanticMemory(prismaMock);
      await memory.store("Vector Apple", [1, 0, 0], { orgId: "org_1" });
      await memory.store("Vector Banana", [0, 1, 0], { orgId: "org_1" });

      const searchResult = await memory.search([0.9, 0.1, 0], 1);
      expect(searchResult.length).toBe(1);
      expect(searchResult[0]?.text).toBe("Vector Apple");
      expect(searchResult[0]?.similarity).toBeGreaterThan(0.8);
    });
  });

  describe("ContextBuilderService", () => {
    it("compiles preferences and semantic memories within token budgets", async () => {
      const longTerm = new DbLongTermMemory(prismaMock);
      const semantic = new DbSemanticMemory(prismaMock);
      const contextBuilder = new ContextBuilderService(longTerm, semantic);

      // Pre-store preferences
      await longTerm.set("org_1", "default_ai_provider", "QWEN");
      // Pre-store semantic match
      await semantic.store("Stored customer profile data", [1, 0, 0], { orgId: "org_1" });

      const context = await contextBuilder.compile("org_1", "query", [0.9, 0, 0], {
        maxTokens: 200,
      });
      expect(context).toContain("Default AI: QWEN");
      expect(context).toContain("Stored customer profile data");
    });
  });

  describe("ReflectionEngineService", () => {
    it("creates SQL reflection records and indexes summary semantically", async () => {
      const semantic = new DbSemanticMemory(prismaMock);
      const engine = new ReflectionEngineService(prismaMock, semantic);

      const report = {
        succeeded: true,
        toolsUsed: ["slack_send_message"],
        feedback: "Successfully contacted user",
      };

      const record = await engine.analyzeExecution("org_1", "exec_1", report);
      expect(record.executionId).toBe("exec_1");
      expect(record.succeeded).toBe(true);
    });
  });
});
