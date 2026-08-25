import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import {
  ShortTermMemory,
  LongTermMemory,
  SemanticMemory,
  SemanticMemoryResult,
  SessionMemory,
} from "./memory.interface";

@Injectable()
export class InMemoryShortTermMemory implements ShortTermMemory {
  private memory: Record<string, any> = {};

  async get(key: string): Promise<any> {
    return this.memory[key];
  }

  async set(key: string, value: any): Promise<void> {
    this.memory[key] = value;
  }

  async clear(): Promise<void> {
    this.memory = {};
  }

  async getAll(): Promise<Record<string, any>> {
    return { ...this.memory };
  }
}

@Injectable()
export class DbLongTermMemory implements LongTermMemory {
  private readonly logger = new Logger(DbLongTermMemory.name);

  // Fallback in-memory map for test scenarios
  private readonly fallback = new Map<string, Map<string, any>>();

  constructor(private readonly prisma: PrismaService) {}

  async get(scopeId: string, key: string): Promise<any> {
    try {
      const entry = await this.prisma.memoryEntry.findFirst({
        where: { organizationId: scopeId, key, deletedAt: null },
      });
      if (entry) {
        return entry.value;
      }
    } catch {
      // Fallback
    }

    const scope = this.fallback.get(scopeId);
    return scope ? scope.get(key) : undefined;
  }

  async set(scopeId: string, key: string, value: any): Promise<void> {
    try {
      const existing = await this.prisma.memoryEntry.findFirst({
        where: { organizationId: scopeId, key },
      });

      if (existing) {
        await this.prisma.memoryEntry.update({
          where: { id: existing.id },
          data: { value, updatedAt: new Date(), deletedAt: null },
        });
        return;
      }

      await this.prisma.memoryEntry.create({
        data: {
          id: crypto.randomUUID(),
          organizationId: scopeId,
          category: "PREFERENCE",
          key,
          value,
          text: `Preference key ${key} stored for scope ${scopeId}`,
        },
      });
      return;
    } catch {
      // Fallback
    }

    if (!this.fallback.has(scopeId)) {
      this.fallback.set(scopeId, new Map());
    }
    this.fallback.get(scopeId)!.set(key, value);
  }

  async delete(scopeId: string, key: string): Promise<void> {
    try {
      const existing = await this.prisma.memoryEntry.findFirst({
        where: { organizationId: scopeId, key },
      });
      if (existing) {
        await this.prisma.memoryEntry.update({
          where: { id: existing.id },
          data: { deletedAt: new Date() },
        });
      }
    } catch {
      // Fallback
    }

    const scope = this.fallback.get(scopeId);
    if (scope) {
      scope.delete(key);
    }
  }
}

@Injectable()
export class DbSemanticMemory implements SemanticMemory {
  private readonly logger = new Logger(DbSemanticMemory.name);

  // Fallback in-memory arrays for test scenarios
  private readonly fallback: {
    text: string;
    embedding: number[];
    metadata: Record<string, any>;
  }[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async store(
    text: string,
    embedding: number[],
    metadata: Record<string, any> = {},
  ): Promise<void> {
    const orgId = metadata["orgId"] ?? "mock-org-id";

    try {
      await this.prisma.memoryEntry.create({
        data: {
          id: crypto.randomUUID(),
          organizationId: orgId,
          category: metadata["category"] ?? "EXECUTION",
          key: metadata["key"] ?? crypto.randomUUID().substring(0, 8),
          value: metadata,
          text,
          embedding: embedding as any,
          importance: metadata["importance"] ?? 1.0,
        },
      });
      return;
    } catch {
      // Fallback
    }

    this.fallback.push({ text, embedding, metadata });
  }

  async search(embedding: number[], limit = 5): Promise<SemanticMemoryResult[]> {
    try {
      // Load all active memory entries containing valid embeddings
      const dbEntries = await this.prisma.memoryEntry.findMany({
        where: { deletedAt: null },
      });

      if (dbEntries.length > 0) {
        const results = dbEntries
          .map((entry) => {
            const vector = entry.embedding as number[] | null;
            if (!vector) return null;
            const similarity = this.cosineSimilarity(embedding, vector);
            return {
              text: entry.text,
              metadata: entry.value as Record<string, any>,
              similarity,
            };
          })
          .filter((res): res is SemanticMemoryResult => res !== null);

        return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
      }
    } catch {
      // Fallback
    }

    const results = this.fallback.map((r) => {
      const similarity = this.cosineSimilarity(embedding, r.embedding);
      return { text: r.text, metadata: r.metadata, similarity };
    });

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i] ?? 0;
      const bi = b[i] ?? 0;
      dotProduct += ai * bi;
      normA += ai * ai;
      normB += bi * bi;
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

@Injectable()
export class InMemorySessionMemory implements SessionMemory {
  private sessions = new Map<string, any[]>();

  async getHistory(sessionId: string): Promise<any[]> {
    return this.sessions.get(sessionId) || [];
  }

  async addMessage(sessionId: string, message: any): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, []);
    }
    this.sessions.get(sessionId)!.push(message);
  }

  async clear(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}
