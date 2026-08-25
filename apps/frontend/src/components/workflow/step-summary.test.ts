import { describe, expect, test } from "vitest";

import type { WorkflowStep } from "@/lib/api/types";
import { summarizeStepConfig } from "./step-summary";

describe("summarizeStepConfig", () => {
  test("summarizes an approval step with role and SLA", () => {
    const step: WorkflowStep = {
      config: { approverRole: "FINANCE_MANAGER", message: "Approve payment", slaMinutes: 480 },
      id: "approval",
      name: "Manager approval",
      type: "APPROVAL",
    };
    expect(summarizeStepConfig(step)).toEqual(["approver FINANCE MANAGER", "SLA 8h"]);
  });

  test("summarizes a tool call with retry, failure policy, and compensation", () => {
    const step = {
      compensation: { toolName: "accounting_reverse_entry" },
      config: { toolName: "accounting_post_entry" },
      id: "post",
      name: "Post to accounting",
      onFailure: "fail",
      retry: { backoffFactor: 2, initialDelayMs: 1000, maxAttempts: 3 },
      type: "TOOL_CALL",
    } as unknown as WorkflowStep;
    expect(summarizeStepConfig(step)).toEqual([
      "tool accounting_post_entry",
      "retries ×3",
      "on failure: fail",
      "auto-undo on downstream failure",
    ]);
  });

  test("summarizes a condition's branch expression", () => {
    const step: WorkflowStep = {
      config: { expression: "input.amount > 1000" },
      id: "gate",
      name: "Large amount?",
      type: "CONDITION",
    };
    expect(summarizeStepConfig(step)).toEqual(["branches on: input.amount > 1000"]);
  });

  test("summarizes agent model and tools", () => {
    const step: WorkflowStep = {
      config: { model: "qwen-plus", promptTemplate: "x", tools: ["slack_send_message"] },
      id: "notify",
      name: "Notify channel",
      type: "AGENT_TASK",
    };
    expect(summarizeStepConfig(step)).toEqual(["model qwen-plus", "tools slack_send_message"]);
  });

  test("returns no facts for a bare prompt-only step", () => {
    const step: WorkflowStep = {
      config: { promptTemplate: "Summarize." },
      id: "s",
      name: "Summarize",
      type: "AGENT_TASK",
    };
    expect(summarizeStepConfig(step)).toEqual([]);
  });
});
