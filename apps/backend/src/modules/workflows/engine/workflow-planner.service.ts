import { Injectable, Logger } from "@nestjs/common";

import { StructuredOutputEngine } from "../../ai-provider/structured-output.engine";
import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { ToolRegistryService } from "../../tools/tool-registry.service";
import { validateDefinition } from "./dependency-resolver";
import {
  WorkflowDefinition,
  WorkflowDefinitionSchema,
  WorkflowStep,
} from "./workflow-definition.schema";

export interface PlanResult {
  definition: WorkflowDefinition;
  estimates: {
    estimatedDurationMs: number;
    estimatedCostMicroUsd: number;
    approvalRequired: boolean;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    risks: string[];
  };
  issues: string[];
}

// Coarse per-step-type duration/cost priors used for planning estimates.
const STEP_DURATION_MS: Record<string, number> = {
  AGENT_TASK: 6000,
  APPROVAL: 0,
  CONDITION: 50,
  DELAY: 1000,
  END: 0,
  MEMORY: 400,
  START: 0,
  SUB_WORKFLOW: 8000,
  TOOL_CALL: 1500,
  WEBHOOK: 1200,
};
const AGENT_STEP_COST_MICRO_USD = 3000; // ~one qwen-plus turn

/**
 * The planning engine. Turns a natural-language objective into an executable,
 * validated workflow DAG using Qwen structured output, grounded in the
 * organization's actual registered tools, then derives duration/cost/risk
 * estimates and approval requirements. Falls back to a safe minimal graph if
 * structured planning fails, so a run can always proceed.
 */
@Injectable()
export class WorkflowPlannerService {
  private readonly logger = new Logger(WorkflowPlannerService.name);

  constructor(
    private readonly structuredEngine: StructuredOutputEngine,
    private readonly prisma: PrismaService,
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  async plan(goal: string): Promise<PlanResult> {
    this.logger.log(`Planning workflow for goal: "${goal}"`);
    const toolCatalog = this.toolRegistry
      .getAll()
      .map((tool) => `- ${tool.metadata.name}: ${tool.metadata.description}`)
      .join("\n");

    const systemPrompt = `You are an autonomous business process planner.
Translate the user's natural-language goal into an executable workflow DAG.

Node types and required config:
- START: entry (exactly one).
- AGENT_TASK: Qwen reasoning turn. config.promptTemplate (use {{ stepId.output }} to reference prior outputs).
- TOOL_CALL: invoke a registered tool. config.toolName + config.arguments.
- CONDITION: boolean branch. config.expression; connect outgoing edges labelled "true" and "false".
- APPROVAL: human gate before a sensitive action. config.message.
- DELAY: wait. config.durationMs.
- WEBHOOK: external HTTP call. config.url, config.method, config.body.
- MEMORY: config.operation ("retrieve" with config.query | "store" with config.key/config.value).
- END: termination (at least one).

Only reference tools from this catalog:
${toolCatalog || "(no tools registered — avoid TOOL_CALL)"}

Insert an APPROVAL node before any irreversible or high-impact action (sending
external messages, financial actions, escalations). Give every node a unique
short id. Connect nodes with connections; label CONDITION edges "true"/"false".
Output only valid JSON matching the schema.`;

    const userPrompt = `Goal: "${goal}"\nProduce the workflow graph as JSON.`;

    let definition: WorkflowDefinition;
    try {
      definition = await this.structuredEngine.parse(
        `${systemPrompt}\n\n${userPrompt}`,
        WorkflowDefinitionSchema,
      );
      // Guard against malformed graphs from the model.
      const issues = validateDefinition(definition).filter((issue) => issue.severity === "error");
      if (issues.length > 0) {
        this.logger.warn(
          `Planner produced invalid graph (${issues.length} errors); using fallback`,
        );
        definition = this.fallbackDefinition(goal);
      }
    } catch (error) {
      this.logger.error(`AI planning failed: ${(error as Error).message}. Using fallback graph.`);
      definition = this.fallbackDefinition(goal);
    }

    const estimates = this.estimate(definition);
    definition.metadata = estimates;
    const issues = validateDefinition(definition).map((issue) => issue.message);

    return { definition, estimates, issues };
  }

  /** Derive duration/cost/risk estimates and approval requirement from the graph. */
  estimate(definition: WorkflowDefinition): PlanResult["estimates"] {
    let durationMs = 0;
    let costMicroUsd = 0;
    const risks: string[] = [];

    for (const step of definition.steps) {
      durationMs += STEP_DURATION_MS[step.type] ?? 1000;
      if (step.type === "AGENT_TASK") costMicroUsd += AGENT_STEP_COST_MICRO_USD;
      if (step.type === "TOOL_CALL" || step.type === "WEBHOOK") {
        risks.push(`External side effect: ${step.name}`);
      }
      if (step.type === "SUB_WORKFLOW") {
        risks.push(`Nested workflow expands scope: ${step.name}`);
      }
    }

    const approvalRequired = definition.steps.some(
      (step) => step.type === "APPROVAL" || step.config["requiresApproval"] === true,
    );

    const sideEffects = risks.length;
    const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
      sideEffects >= 3 ? "HIGH" : sideEffects >= 1 ? "MEDIUM" : "LOW";

    return {
      approvalRequired,
      estimatedCostMicroUsd: costMicroUsd,
      estimatedDurationMs: durationMs,
      riskLevel,
      risks,
    };
  }

  private fallbackDefinition(goal: string): WorkflowDefinition {
    const steps: WorkflowStep[] = [
      { config: {}, id: "start", name: "Start", type: "START" },
      {
        config: {
          promptTemplate: `Interpret and execute this business goal step by step: ${goal}`,
          systemPrompt: "You are an autonomous business operations assistant.",
        },
        id: "interpret",
        name: "Interpret goal",
        type: "AGENT_TASK",
      },
      { config: {}, id: "end", name: "End", type: "END" },
    ];
    return {
      connections: [
        { fromStepId: "start", toStepId: "interpret" },
        { fromStepId: "interpret", toStepId: "end" },
      ],
      steps,
    };
  }
}
