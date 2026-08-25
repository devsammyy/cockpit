import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { PolicyEngineService } from "../../tools/policy-engine.service";
import { StepHandlerRegistry } from "./step-handler.registry";
import { WorkflowStep } from "./workflow-definition.schema";

export interface DecisionContext {
  organizationId: string;
  userId: string;
  variables: Record<string, any>;
  /** number of step failures accumulated so far in the run */
  failureCount: number;
}

export type DecisionAction = "PROCEED" | "REQUIRE_APPROVAL" | "BLOCK";

export interface Decision {
  action: DecisionAction;
  /** 0..1 — higher means riskier */
  riskScore: number;
  /** 0..1 — confidence the step should run as planned */
  confidence: number;
  reasons: string[];
}

const RISK_APPROVAL_THRESHOLD = 0.6;
const RISK_BLOCK_THRESHOLD = 0.9;

/**
 * Continuously evaluated gate the orchestrator consults before every step.
 *
 * Synthesizes a risk/confidence assessment from workflow state, org policies,
 * user permissions, tool availability, and accumulated failures, then returns
 * PROCEED / REQUIRE_APPROVAL / BLOCK. This is where "adapt execution when
 * conditions change" lives — a step the planner marked safe can still be
 * gated at runtime if, for example, its tool became unavailable or the run has
 * been failing repeatedly.
 */
@Injectable()
export class DecisionEngineService {
  private readonly logger = new Logger(DecisionEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyEngine: PolicyEngineService,
    private readonly handlers: StepHandlerRegistry,
  ) {}

  async evaluate(step: WorkflowStep, context: DecisionContext): Promise<Decision> {
    const reasons: string[] = [];
    let risk = 0;

    // 1. Node type risk priors
    if (step.type === "TOOL_CALL" || step.type === "WEBHOOK") {
      risk += 0.25;
      reasons.push(`${step.type} performs an external side effect`);
    }
    if (step.type === "SUB_WORKFLOW") {
      risk += 0.15;
      reasons.push("Sub-workflow expands the blast radius");
    }

    // 2. Unsupported node type → hard block (mis-typed definition)
    if (!this.handlers.has(step.type) && step.type !== "START" && step.type !== "END") {
      reasons.push(`No handler registered for step type "${step.type}"`);
      return { action: "BLOCK", confidence: 0, reasons, riskScore: 1 };
    }

    // 3. Tool policy + availability
    if (step.type === "TOOL_CALL") {
      const toolName = String(step.config["toolName"] ?? "");
      try {
        const policy = await this.policyEngine.evaluate(
          context.organizationId,
          toolName,
          context.userId,
        );
        if (!policy.allowed) {
          reasons.push(`Tool "${toolName}" blocked by policy: ${policy.reason ?? "not permitted"}`);
          return { action: "BLOCK", confidence: 0.2, reasons, riskScore: 1 };
        }
        if (policy.requiresApproval) {
          reasons.push(`Tool "${toolName}" requires approval by policy`);
          risk = Math.max(risk, RISK_APPROVAL_THRESHOLD);
        }
      } catch {
        // Policy engine unavailable — proceed but note reduced confidence.
        reasons.push("Policy evaluation unavailable; proceeding with reduced confidence");
        risk += 0.1;
      }
    }

    // 4. Explicit per-step approval flag from the planner/designer
    if (step.config["requiresApproval"] === true) {
      reasons.push("Step is flagged as requiring approval");
      risk = Math.max(risk, RISK_APPROVAL_THRESHOLD);
    }

    // 5. Accumulated failures raise risk (adaptive caution)
    if (context.failureCount > 0) {
      const penalty = Math.min(0.3, context.failureCount * 0.1);
      risk += penalty;
      reasons.push(`${String(context.failureCount)} prior step failure(s) in this run`);
    }

    risk = Math.min(1, risk);
    const confidence = Math.max(0, 1 - risk);

    let action: DecisionAction = "PROCEED";
    if (risk >= RISK_BLOCK_THRESHOLD) action = "BLOCK";
    else if (risk >= RISK_APPROVAL_THRESHOLD) action = "REQUIRE_APPROVAL";

    if (action !== "PROCEED") {
      this.logger.debug(
        `Decision for step ${step.id}: ${action} (risk ${risk.toFixed(2)}) — ${reasons.join("; ")}`,
      );
    }

    return { action, confidence, reasons, riskScore: risk };
  }
}
