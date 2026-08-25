import { Inject, Injectable, Logger, BadRequestException } from "@nestjs/common";
import type { ZodType } from "zod";
import { LLM_PROVIDER, LlmProvider } from "./llm-provider.interface";

@Injectable()
export class StructuredOutputEngine {
  private readonly logger = new Logger(StructuredOutputEngine.name);

  constructor(@Inject(LLM_PROVIDER) private readonly llmProvider: LlmProvider) {}

  /**
   * Parse response text to match the given Zod schema, attempting response repair prompts if parsing fails.
   */
  async parse<T>(text: string, schema: ZodType<T>, maxRepairAttempts = 1): Promise<T> {
    try {
      const parsed = JSON.parse(this.cleanJsonBlock(text));
      const validated = schema.parse(parsed);
      return validated;
    } catch (error) {
      this.logger.warn(
        `JSON validation failed. Raw response text: "${text.substring(0, 100)}..." Error: ${(error as Error).message}`,
      );

      if (maxRepairAttempts > 0) {
        return this.repair(text, (error as Error).message, schema, maxRepairAttempts);
      }
      throw new BadRequestException(
        `Structured JSON output validation failed: ${(error as Error).message}`,
      );
    }
  }

  private async repair<T>(
    brokenText: string,
    errorMessage: string,
    schema: ZodType<T>,
    attemptsLeft: number,
  ): Promise<T> {
    this.logger.log(`Attempting structured output repair... (${attemptsLeft} retries left)`);

    const repairPrompt = `You are a strict JSON formatting corrector.
The previous system call generated invalid output failing with error: "${errorMessage}"
Broken Output:
${brokenText}

Please correct the broken formatting. You must output ONLY the valid JSON structure. Do not include markdown wraps or conversational preambles.`;

    try {
      const result = await this.llmProvider.chat([
        { role: "system", content: "You are a JSON syntax repair agent. Output only raw JSON." },
        { role: "user", content: repairPrompt },
      ]);

      const repaired = this.cleanJsonBlock(result.message.content);
      const parsed = JSON.parse(repaired);
      return schema.parse(parsed);
    } catch (err) {
      if (attemptsLeft > 1) {
        return this.repair(brokenText, (err as Error).message, schema, attemptsLeft - 1);
      }
      throw new BadRequestException(
        `Structured output JSON repair failed: ${(err as Error).message}`,
      );
    }
  }

  private cleanJsonBlock(text: string): string {
    let cleaned = text.trim();
    // Strip markdown code block wrappers (e.g. ```json ... ```)
    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```(json)?/, "")
        .replace(/```$/, "")
        .trim();
    }
    return cleaned;
  }
}
