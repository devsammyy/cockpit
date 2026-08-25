import { Inject, Injectable } from "@nestjs/common";

import {
  LONG_TERM_MEMORY,
  LongTermMemory,
  SEMANTIC_MEMORY,
  SemanticMemory,
} from "../../../memory/memory.interface";
import { StepExecutionContext, StepHandler, StepResult } from "../step-handler.interface";
import { compileTemplate } from "../template.util";
import { WorkflowStep } from "../workflow-definition.schema";

/**
 * MEMORY — reads or writes organizational memory mid-workflow. Config:
 *   operation: "retrieve" (semantic search over config.query)
 *            | "store"    (long-term set of config.key/config.value,
 *                          plus semantic indexing of the text)
 */
@Injectable()
export class MemoryHandler implements StepHandler {
  readonly type = "MEMORY";

  constructor(
    @Inject(LONG_TERM_MEMORY) private readonly longTermMemory: LongTermMemory,
    @Inject(SEMANTIC_MEMORY) private readonly semanticMemory: SemanticMemory,
  ) {}

  async execute(step: WorkflowStep, context: StepExecutionContext): Promise<StepResult> {
    const operation = String(step.config["operation"] ?? "retrieve");

    if (operation === "store") {
      const key = compileTemplate(String(step.config["key"] ?? "workflow_note"), context.variables);
      const value = compileTemplate(String(step.config["value"] ?? ""), context.variables);

      await this.longTermMemory.set(context.organizationId, key, value);
      // Same mock-embedding convention as the memory module until a real
      // embedding provider is wired.
      const vector = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
      await this.semanticMemory.store(value, vector, {
        category: "EXECUTION",
        executionId: context.executionId,
        key,
        orgId: context.organizationId,
      });

      return { output: { key, operation, stored: true } };
    }

    const query = compileTemplate(String(step.config["query"] ?? ""), context.variables);
    const vector = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
    const matches = await this.semanticMemory.search(vector, 5);
    const scoped = matches.filter(
      (match) =>
        match.metadata["orgId"] === context.organizationId || match.metadata["orgId"] === undefined,
    );

    return {
      output: {
        matches: scoped.map((match) => ({ similarity: match.similarity, text: match.text })),
        operation,
        query,
      },
    };
  }
}
