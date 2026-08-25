import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { ExecutionEventsService } from "./engine/execution-events.service";
import { TriggerService } from "./engine/trigger.service";
import { WorkflowLifecycleService } from "./engine/workflow-lifecycle.service";
import { WorkflowPlannerService } from "./engine/workflow-planner.service";
import { WorkflowRepositoryService } from "./engine/workflow-repository.service";
import {
  CreateWorkflowDto,
  EmitEventDto,
  EnableScheduleDto,
  PlanGoalDto,
  RollbackVersionDto,
  StartExecutionDto,
  UpdateWorkflowDto,
} from "./dto/workflow.dto";

/**
 * Workflow management + execution API. Every route is org-scoped through the
 * authenticated principal (multi-tenancy) and guarded by JWT auth (identity).
 */
@ApiTags("workflows")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("workflows")
export class WorkflowsController {
  private readonly logger = new Logger(WorkflowsController.name);

  constructor(
    private readonly repository: WorkflowRepositoryService,
    private readonly lifecycle: WorkflowLifecycleService,
    private readonly planner: WorkflowPlannerService,
    private readonly triggers: TriggerService,
    private readonly events: ExecutionEventsService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Workflow CRUD ──

  @Get()
  @ApiOperation({ summary: "List workflows for the organization" })
  async list(@CurrentUser("orgId") orgId: string) {
    return { data: await this.repository.list(orgId), success: true };
  }

  @Post()
  @ApiOperation({ summary: "Create a workflow from a declarative definition" })
  async create(
    @CurrentUser("orgId") orgId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: CreateWorkflowDto,
  ) {
    const workflow = await this.repository.create({
      category: dto.category,
      definition: dto.definition,
      description: dto.description,
      name: dto.name,
      organizationId: orgId,
      tags: dto.tags,
      triggerConfig: dto.triggerConfig,
      triggerType: dto.triggerType,
      userId,
    });
    return { data: workflow, success: true };
  }

  @Post("templates/seed")
  @ApiOperation({ summary: "Seed the built-in reference workflow templates" })
  async seedTemplates(@CurrentUser("orgId") orgId: string, @CurrentUser("sub") userId: string) {
    const result = await this.repository.seedReferenceTemplates(orgId, userId);
    return { count: result.seeded, success: true };
  }

  @Get("templates")
  @ApiOperation({ summary: "List workflows (templates) for the organization" })
  async templates(@CurrentUser("orgId") orgId: string) {
    return { data: await this.repository.list(orgId), success: true };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a workflow by id" })
  async get(@CurrentUser("orgId") orgId: string, @Param("id") id: string) {
    return { data: await this.repository.get(id, orgId), success: true };
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a workflow (creates a new version)" })
  async update(
    @CurrentUser("orgId") orgId: string,
    @CurrentUser("sub") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return { data: await this.repository.update(id, orgId, userId, dto), success: true };
  }

  @Delete(":id")
  @ApiOperation({ summary: "Archive a workflow" })
  async remove(@CurrentUser("orgId") orgId: string, @Param("id") id: string) {
    await this.repository.remove(id, orgId);
    return { success: true };
  }

  // ── Versioning ──

  @Get(":id/versions")
  @ApiOperation({ summary: "List version history for a workflow" })
  async versions(@CurrentUser("orgId") orgId: string, @Param("id") id: string) {
    return { data: await this.repository.versions(id, orgId), success: true };
  }

  @Post(":id/rollback")
  @ApiOperation({ summary: "Roll a workflow back to a prior version" })
  async rollback(
    @CurrentUser("orgId") orgId: string,
    @CurrentUser("sub") userId: string,
    @Param("id") id: string,
    @Body() dto: RollbackVersionDto,
  ) {
    return {
      data: await this.repository.rollback(id, orgId, userId, dto.versionNumber),
      success: true,
    };
  }

  // ── Planning ──

  @Post("plan")
  @ApiOperation({ summary: "Plan a workflow from a natural-language goal (optionally execute)" })
  async plan(
    @CurrentUser("orgId") orgId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: PlanGoalDto,
  ) {
    const plan = await this.planner.plan(dto.goal);

    if (!dto.execute) {
      return { data: plan, success: true };
    }

    const workflow = (await this.repository.create({
      category: "AI Planned",
      definition: plan.definition,
      description: `AI-planned workflow for goal: ${dto.goal}`,
      name: `AI Planned: ${dto.goal.slice(0, 48)}`,
      organizationId: orgId,
      tags: ["ai-planned"],
      userId,
    })) as { id: string };

    const { executionId } = await this.lifecycle.start({
      input: { goal: dto.goal },
      organizationId: orgId,
      userId,
      workflowId: workflow.id,
    });

    return {
      data: {
        estimates: plan.estimates,
        executionId,
        plannedGraph: plan.definition,
        workflowId: workflow.id,
      },
      success: true,
    };
  }

  /** Backwards-compatible alias for the phase-3 console. */
  @Post("plan-and-execute")
  @ApiOperation({ summary: "Plan and immediately execute a workflow from a goal (alias of /plan)" })
  async planAndExecute(
    @CurrentUser("orgId") orgId: string,
    @CurrentUser("sub") userId: string,
    @Body() body: { goal: string },
  ) {
    const result = await this.plan(orgId, userId, { execute: true, goal: body.goal });
    const data = result.data as {
      executionId: string;
      workflowId: string;
      plannedGraph: unknown;
    };
    return {
      executionId: data.executionId,
      plannedGraph: data.plannedGraph,
      status: "RUNNING",
      success: true,
      workflowId: data.workflowId,
    };
  }

  // ── Execution control (human-in-the-loop) ──

  @Post(":id/execute")
  @ApiOperation({ summary: "Start an execution of a stored workflow" })
  async execute(
    @CurrentUser("orgId") orgId: string,
    @CurrentUser("sub") userId: string,
    @Param("id") id: string,
    @Body() dto: StartExecutionDto,
  ) {
    const { executionId } = await this.lifecycle.start({
      input: dto.input,
      organizationId: orgId,
      userId,
      workflowId: id,
    });
    return { data: { executionId, status: "PENDING" }, success: true };
  }

  @Get("executions/list")
  @ApiOperation({ summary: "List executions for the organization" })
  async listExecutions(@CurrentUser("orgId") orgId: string) {
    const data = await this.prisma.execution.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      where: { organizationId: orgId },
    });
    return { data, success: true };
  }

  @Get("executions/:executionId")
  @ApiOperation({ summary: "Get a single execution" })
  async getExecution(
    @CurrentUser("orgId") orgId: string,
    @Param("executionId") executionId: string,
  ) {
    const data = await this.prisma.execution.findFirst({
      where: { id: executionId, organizationId: orgId },
    });
    return { data, success: true };
  }

  @Get("executions/:executionId/steps")
  @ApiOperation({ summary: "List step executions for a run" })
  async getSteps(@Param("executionId") executionId: string) {
    const data = await this.prisma.stepExecution.findMany({
      orderBy: { startedAt: "asc" },
      where: { executionId },
    });
    return { data, success: true };
  }

  @Get("executions/:executionId/events")
  @ApiOperation({ summary: "Get the execution timeline" })
  async getEvents(@Param("executionId") executionId: string) {
    return { data: await this.events.list(executionId), success: true };
  }

  @Post("executions/:executionId/pause")
  @ApiOperation({ summary: "Pause a running execution" })
  async pauseExecution(
    @CurrentUser("orgId") orgId: string,
    @Param("executionId") executionId: string,
  ) {
    await this.lifecycle.pause(executionId, orgId);
    return { success: true };
  }

  @Post("executions/:executionId/resume")
  @ApiOperation({ summary: "Resume a paused execution" })
  async resumeExecution(
    @CurrentUser("orgId") orgId: string,
    @Param("executionId") executionId: string,
  ) {
    await this.lifecycle.resume(executionId, orgId);
    return { success: true };
  }

  @Post("executions/:executionId/cancel")
  @ApiOperation({ summary: "Cancel an execution" })
  async cancelExecution(
    @CurrentUser("orgId") orgId: string,
    @Param("executionId") executionId: string,
  ) {
    await this.lifecycle.cancel(executionId, orgId);
    return { success: true };
  }

  @Post("executions/:executionId/retry")
  @ApiOperation({ summary: "Retry a failed execution" })
  async retryExecution(
    @CurrentUser("orgId") orgId: string,
    @Param("executionId") executionId: string,
  ) {
    const result = await this.lifecycle.retry(executionId, orgId);
    return { data: result, success: true };
  }

  // ── Event trigger ──

  @Post("events/emit")
  @ApiOperation({ summary: "Emit an application event to fan out to event-driven workflows" })
  async emitEvent(@CurrentUser("orgId") orgId: string, @Body() dto: EmitEventDto) {
    const started = await this.triggers.emit(orgId, dto.event, dto.payload ?? {});
    return { data: { started }, success: true };
  }

  // ── Trigger management (webhook / schedule) ──

  @Post(":id/triggers/webhook")
  @ApiOperation({
    summary: "Enable (or rotate) the public webhook trigger — returns the hook URL and secret",
  })
  async enableWebhook(@CurrentUser("orgId") orgId: string, @Param("id") id: string) {
    const { path, secret } = await this.triggers.enableWebhook(id, orgId);
    return {
      data: {
        header: "x-hook-token",
        hookPath: `/api/v1${path}`,
        secret,
        usage: `curl -X POST <host>/api/v1${path} -H 'x-hook-token: ${secret}' -H 'Content-Type: application/json' -d '{"your":"payload"}'`,
      },
      success: true,
    };
  }

  @Post(":id/triggers/schedule")
  @ApiOperation({ summary: "Enable a cron schedule trigger for a workflow" })
  async enableSchedule(
    @CurrentUser("orgId") orgId: string,
    @Param("id") id: string,
    @Body() dto: EnableScheduleDto,
  ) {
    await this.triggers.enableSchedule(id, orgId, dto.cron, dto.input);
    return { data: { cron: dto.cron, workflowId: id }, success: true };
  }

  @Delete(":id/triggers")
  @ApiOperation({ summary: "Disable webhook/schedule triggers (back to manual)" })
  async disableTriggers(@CurrentUser("orgId") orgId: string, @Param("id") id: string) {
    await this.triggers.disableTriggers(id, orgId);
    return { data: { triggerType: "MANUAL", workflowId: id }, success: true };
  }
}
