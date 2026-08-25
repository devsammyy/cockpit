import { Injectable, Inject, Logger } from "@nestjs/common";
import {
  LongTermMemory,
  SemanticMemory,
  LONG_TERM_MEMORY,
  SEMANTIC_MEMORY,
} from "./memory.interface";

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  constructor(
    @Inject(LONG_TERM_MEMORY) private readonly longTermMemory: LongTermMemory,
    @Inject(SEMANTIC_MEMORY) private readonly semanticMemory: SemanticMemory,
  ) {}

  /**
   * Compile preferences, semantic lookup history, and compress text output to stay within token budgets.
   */
  async compile(
    orgId: string,
    queryText: string,
    vectorDimension: number[],
    options?: { maxTokens?: number },
  ): Promise<string> {
    const maxTokens = options?.maxTokens ?? 4000;

    // 1. Fetch relevant semantic matches
    const matches = await this.semanticMemory.search(vectorDimension, 10);

    // 2. Fetch specific preferences
    const defaultAI = (await this.longTermMemory.get(orgId, "default_ai_provider")) ?? "QWEN";
    const runMode = (await this.longTermMemory.get(orgId, "workspace_run_mode")) ?? "AUTOPILOT";

    // 3. Compress and filter context to fit under token limits
    let promptContext = `[Workspace Preferences]
Default AI: ${defaultAI}
Run Mode: ${runMode}

[Relevant Semantic Memories]\n`;

    let currentEstimatedTokens = promptContext.length / 4;

    for (const match of matches) {
      const memoryString = `- ${match.text} (Similarity: ${(match.similarity * 100).toFixed(1)}%)\n`;
      const additionTokens = memoryString.length / 4;

      if (currentEstimatedTokens + additionTokens > maxTokens) {
        this.logger.warn("Token limit exceeded. Truncating context memories extraction...");
        break;
      }

      promptContext += memoryString;
      currentEstimatedTokens += additionTokens;
    }

    return promptContext;
  }
}
