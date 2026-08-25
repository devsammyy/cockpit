import type { WorkflowDefinition } from "@/lib/api/types";

/** One input the workflow expects the operator to provide before running. */
export interface WorkflowInputField {
  key: string;
  label: string;
  usedBy: string[];
}

const TEMPLATE_INPUT = /\{\{\s*input\.([\w-]+)\s*\}\}/g;
const BARE_INPUT = /\binput\.([\w-]+)\b/g;

export function prettifyInputLabel(key: string): string {
  return key
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function scanString(text: string, pattern: RegExp): string[] {
  const keys: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match[1]) keys.push(match[1]);
  }
  return keys;
}

function scanValue(value: unknown, isExpression: boolean): string[] {
  if (typeof value === "string") {
    // `{{ input.x }}` templates appear in prompts/messages; bare `input.x`
    // references only occur in CONDITION expressions — scanning prose for the
    // bare form would false-positive on ordinary sentences.
    return scanString(value, isExpression ? BARE_INPUT : TEMPLATE_INPUT);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => scanValue(item, isExpression));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      scanValue(child, isExpression || key === "expression"),
    );
  }
  return [];
}

/**
 * Derive the run-form fields for a workflow by finding every `{{ input.x }}`
 * placeholder (and `input.x` inside condition expressions) in its step
 * configs. Returned in first-seen order, deduplicated, with the step names
 * that consume each input so the form can explain why a field is needed.
 */
export function deriveWorkflowInputs(definition: WorkflowDefinition): WorkflowInputField[] {
  const fields = new Map<string, WorkflowInputField>();
  for (const step of definition.steps) {
    for (const key of scanValue(step.config, false)) {
      const existing = fields.get(key);
      if (existing) {
        if (!existing.usedBy.includes(step.name)) existing.usedBy.push(step.name);
      } else {
        fields.set(key, { key, label: prettifyInputLabel(key), usedBy: [step.name] });
      }
    }
  }
  return Array.from(fields.values());
}
