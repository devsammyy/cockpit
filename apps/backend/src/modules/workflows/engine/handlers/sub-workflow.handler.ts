import { BadRequestException, Inject, Injectable, forwardRef } from "@nestjs/common";

import { PrismaService } from "../../../../infrastructure/database/prisma.service";
import { WorkflowExecutorService } from "../workflow-executor.service";
import { resolveArgs } from "../template.util";
import { StepExecutionContext, StepHandler, StepResult } from "../step-handler.interface";
import { WorkflowDefinition } from "../workflow-definition.schema";
import { WorkflowStep } from "../workflow-definition.schema";

const MAX_SUB_WORKFLOW_DEPTH = 3;

/**
 * SUB_WORKFLOW — runs another workflow inline as a child execution and merges
 * its output back. Config: workflowId (required), input (object, interpolated).
 * Depth-bounded to prevent runaway recursion. Sub-workflows run synchronously
 * within the parent step (they cannot themselves contain approval pauses).
 */
@Injectable()
export class SubWorkflowHandler implements StepHandler {
  readonly type = "SUB_WORKFLOW";

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WorkflowExecutorService))
    private readonly executor: WorkflowExecutorService,
  ) {}

  async execute(step: WorkflowStep, context: StepExecutionContext): Promise<StepResult> {
    if (context.depth >= MAX_SUB_WORKFLOW_DEPTH) {
      throw new BadRequestException(
        `Sub-workflow nesting exceeded the maximum depth of ${String(MAX_SUB_WORKFLOW_DEPTH)}`,
      );
    }

    const workflowId = String(step.config["workflowId"] ?? "");
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, organizationId: context.organizationId, deletedAt: null },
    });
    if (!workflow) {
      throw new BadRequestException(`Sub-workflow ${workflowId} not found in this organization`);
    }

    const input = resolveArgs(
      (step.config["input"] as Record<string, any> | undefined) ?? {},
      context.variables,
    );

    const childResult = await this.executor.runInline({
      definition: workflow.definition as unknown as WorkflowDefinition,
      depth: context.depth + 1,
      input,
      organizationId: context.organizationId,
      parentExecutionId: context.executionId,
      userId: context.userId,
      workflowId: workflow.id,
      workflowName: workflow.name,
    });

    return {
      costMicroUsd: childResult.costMicroUsd,
      output: {
        childExecutionId: childResult.executionId,
        status: childResult.status,
        variables: childResult.variables,
      },
      tokensUsed: childResult.tokensUsed,
    };
  }
}
