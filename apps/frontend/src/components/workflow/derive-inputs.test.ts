import { describe, expect, test } from "vitest";

import type { WorkflowDefinition } from "@/lib/api/types";
import { deriveWorkflowInputs, prettifyInputLabel } from "./derive-inputs";

const HIRING: WorkflowDefinition = {
  connections: [],
  steps: [
    { config: {}, id: "start", name: "Applications received", type: "START" },
    {
      config: {
        promptTemplate:
          "Evaluate each candidate against the job requirements {{ input.requirements }}:\n{{ input.candidates }}",
        systemPrompt: "You are an impartial technical recruiter.",
      },
      id: "evaluate",
      name: "Evaluate candidates",
      type: "AGENT_TASK",
    },
    {
      config: { promptTemplate: "Rank the candidates: {{ evaluate.output }}" },
      id: "rank",
      name: "Rank candidates",
      type: "AGENT_TASK",
    },
    {
      // Second reference to the same input must not duplicate the field.
      config: { message: "Schedule interviews per {{ input.requirements }}" },
      id: "schedule",
      name: "Schedule interviews",
      type: "TOOL_CALL",
    },
    { config: {}, id: "end", name: "Complete", type: "END" },
  ],
};

describe("deriveWorkflowInputs", () => {
  test("finds every {{ input.x }} placeholder once, in first-seen order", () => {
    const fields = deriveWorkflowInputs(HIRING);
    expect(fields.map((f) => f.key)).toEqual(["requirements", "candidates"]);
  });

  test("records which steps consume each input", () => {
    const fields = deriveWorkflowInputs(HIRING);
    const requirements = fields.find((f) => f.key === "requirements");
    expect(requirements?.usedBy).toEqual(["Evaluate candidates", "Schedule interviews"]);
  });

  test("ignores step-output references like {{ evaluate.output }}", () => {
    const fields = deriveWorkflowInputs(HIRING);
    expect(fields.some((f) => f.key === "output")).toBe(false);
  });

  test("finds bare input.x references inside condition expressions only", () => {
    const definition: WorkflowDefinition = {
      connections: [],
      steps: [
        {
          config: { expression: "input.amount > 1000" },
          id: "gate",
          name: "Large amount?",
          type: "CONDITION",
        },
        {
          // Prose mentioning "input." patterns outside expressions is ignored.
          config: { promptTemplate: "Summarize the user input. Do not echo input verbatim." },
          id: "summarize",
          name: "Summarize",
          type: "AGENT_TASK",
        },
      ],
    };
    const fields = deriveWorkflowInputs(definition);
    expect(fields.map((f) => f.key)).toEqual(["amount"]);
  });

  test("scans nested config objects and arrays", () => {
    const definition: WorkflowDefinition = {
      connections: [],
      steps: [
        {
          config: { arguments: { entry: "{{ input.invoice }}", tags: ["{{ input.department }}"] } },
          id: "post",
          name: "Post entry",
          type: "TOOL_CALL",
        },
      ],
    };
    expect(deriveWorkflowInputs(definition).map((f) => f.key)).toEqual(["invoice", "department"]);
  });

  test("returns an empty list for workflows with no inputs", () => {
    const definition: WorkflowDefinition = {
      connections: [],
      steps: [
        {
          config: { promptTemplate: "Do the daily report." },
          id: "a",
          name: "A",
          type: "AGENT_TASK",
        },
      ],
    };
    expect(deriveWorkflowInputs(definition)).toEqual([]);
  });
});

describe("prettifyInputLabel", () => {
  test("humanizes camelCase and snake_case keys", () => {
    expect(prettifyInputLabel("purchaseOrder")).toBe("Purchase Order");
    expect(prettifyInputLabel("job_requirements")).toBe("Job Requirements");
    expect(prettifyInputLabel("candidates")).toBe("Candidates");
  });
});
