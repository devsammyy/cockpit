import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ApprovalCoordinatorService } from "./engine/approval-coordinator.service";
import { ApprovalDecisionDto } from "./dto/workflow.dto";

/**
 * Durable workflow-approval queue (distinct from the phase-3 in-memory tool
 * approvals). Approvals persist across restarts and drive execution resume.
 */
@ApiTags("workflow-approvals")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("workflow-approvals")
export class ApprovalsController {
  constructor(private readonly coordinator: ApprovalCoordinatorService) {}

  @Get()
  @ApiOperation({ summary: "List pending workflow approvals (escalates overdue ones)" })
  async listPending(@CurrentUser("orgId") orgId: string) {
    return { data: await this.coordinator.listPending(orgId), success: true };
  }

  @Get("execution/:executionId")
  @ApiOperation({ summary: "List approvals for a specific execution" })
  async listForExecution(@Param("executionId") executionId: string) {
    return { data: await this.coordinator.listForExecution(executionId), success: true };
  }

  @Post(":id/decide")
  @ApiOperation({ summary: "Approve or reject a workflow approval (resumes or fails the run)" })
  async decide(
    @CurrentUser("orgId") orgId: string,
    @CurrentUser("sub") userId: string,
    @Param("id") id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    await this.coordinator.decide(id, orgId, userId, dto.action, dto.reason);
    return { success: true };
  }
}
