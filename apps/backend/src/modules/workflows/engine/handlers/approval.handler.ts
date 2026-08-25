import { Injectable } from "@nestjs/common";

import { ApprovalCoordinatorService, ApprovalType } from "../approval-coordinator.service";
import { compileTemplate } from "../template.util";
import { StepExecutionContext, StepHandler, StepResult } from "../step-handler.interface";
import { WorkflowStep } from "../workflow-definition.schema";

/**
 * APPROVAL — durable human gate. Creates a pending approval row and returns a
 * pause signal; the orchestrator checkpoints the run to WAITING_APPROVAL and
 * ends the job. The approve decision enqueues a resume job. Config:
 *   message, approverRole, slaMinutes, type (PRE/DURING/POST_EXECUTION)
 */
@Injectable()
export class ApprovalHandler implements StepHandler {
  readonly type = "APPROVAL";

  constructor(private readonly coordinator: ApprovalCoordinatorService) {}

  async execute(step: WorkflowStep, context: StepExecutionContext): Promise<StepResult> {
    const message = compileTemplate(
      String(step.config["message"] ?? "Approval required to continue"),
      context.variables,
    );
    const type = ["PRE_EXECUTION", "DURING_EXECUTION", "POST_EXECUTION"].includes(
      String(step.config["type"]),
    )
      ? (String(step.config["type"]) as ApprovalType)
      : "DURING_EXECUTION";

    const { id } = await this.coordinator.request({
      executionId: context.executionId,
      organizationId: context.organizationId,
      payload: {
        approverRole: step.config["approverRole"] ?? "ADMIN",
        message,
        stepName: step.name,
      },
      slaMinutes:
        typeof step.config["slaMinutes"] === "number" ? step.config["slaMinutes"] : undefined,
      stepId: step.id,
      type,
    });

    return {
      output: { approvalId: id, message, requested: true },
      pause: { approvalId: id, reason: "APPROVAL" },
    };
  }
}
