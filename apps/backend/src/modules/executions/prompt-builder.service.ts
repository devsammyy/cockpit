import { Injectable } from "@nestjs/common";
import { ChatMessage } from "@qwen-autopilot/shared-types";

@Injectable()
export class PromptBuilderService {
  /**
   * Replace {{key}} placeholders in a template string with actual values from context.
   */
  compileTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
      const keys = key.split(".");
      let val = context;
      for (const k of keys) {
        if (val === undefined || val === null) return "";
        val = val[k];
      }
      if (val === undefined) return "";
      return typeof val === "object" ? JSON.stringify(val) : String(val);
    });
  }

  /**
   * Build structured chat messages for the LLM.
   */
  build({
    systemPrompt,
    developerPrompt,
    userPrompt,
    memoryContext,
    toolResults = [],
    structuredSchema,
  }: {
    systemPrompt: string;
    developerPrompt?: string;
    userPrompt?: string;
    memoryContext?: string;
    toolResults?: ChatMessage[];
    structuredSchema?: Record<string, any>;
  }): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // System prompt compiling instructions, constraints, and schemas
    let compiledSystem = systemPrompt;
    if (structuredSchema) {
      compiledSystem += `\n\nYou MUST return output matching this JSON Schema:\n${JSON.stringify(
        structuredSchema,
        null,
        2,
      )}`;
    }
    messages.push({ role: "system", content: compiledSystem });

    // Developer context guidelines
    if (developerPrompt) {
      messages.push({ role: "system", content: `Developer Instruction: ${developerPrompt}` });
    }

    // Memory injection
    if (memoryContext) {
      messages.push({ role: "system", content: `Retrieved Memory:\n${memoryContext}` });
    }

    // Main task / user query
    if (userPrompt) {
      messages.push({ role: "user", content: userPrompt });
    }

    // Append prior execution tools history
    if (toolResults.length > 0) {
      messages.push(...toolResults);
    }

    return messages;
  }
}
