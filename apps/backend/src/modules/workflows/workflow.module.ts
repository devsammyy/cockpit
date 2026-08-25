import { BullModule } from "@nestjs/bullmq";
import { Global, Module, OnModuleInit } from "@nestjs/common";

import { DatabaseModule } from "../../infrastructure/database/database.module";
import { ExecutionsModule } from "../executions/executions.module";
import { MemoryModule } from "../memory/memory.module";
import { ToolsModule } from "../tools/tools.module";
import { ApprovalsController } from "./approvals.controller";
import { HooksController } from "./hooks.controller";
import { WorkflowsController } from "./workflows.controller";
import { ApprovalCoordinatorService } from "./engine/approval-coordinator.service";
import { DecisionEngineService } from "./engine/decision-engine.service";
import { ExecutionEventsService } from "./engine/execution-events.service";
import { AgentTaskHandler } from "./engine/handlers/agent-task.handler";
import { ApprovalHandler } from "./engine/handlers/approval.handler";
import { ConditionHandler } from "./engine/handlers/condition.handler";
import { DelayHandler } from "./engine/handlers/delay.handler";
import { MemoryHandler } from "./engine/handlers/memory.handler";
import { SubWorkflowHandler } from "./engine/handlers/sub-workflow.handler";
import { ToolCallHandler } from "./engine/handlers/tool-call.handler";
import { WebhookHandler } from "./engine/handlers/webhook.handler";
import { WORKFLOW_EXECUTIONS_QUEUE } from "./engine/queue.constants";
import { RecoveryManagerService } from "./engine/recovery-manager.service";
import { STEP_HANDLERS } from "./engine/step-handler.interface";
import { StepHandlerRegistry } from "./engine/step-handler.registry";
import { TriggerService } from "./engine/trigger.service";
import { WorkflowExecutionProcessor } from "./engine/workflow-execution.processor";
import { WorkflowExecutorService } from "./engine/workflow-executor.service";
import { WorkflowLifecycleService } from "./engine/workflow-lifecycle.service";
import { WorkflowPlannerService } from "./engine/workflow-planner.service";
import { WorkflowRepositoryService } from "./engine/workflow-repository.service";

/**
 * The Autonomous Business Workflow Engine.
 *
 * Wiring notes:
 * - Step handlers are collected into a multi-provider (STEP_HANDLERS) so the
 *   orchestrator core has zero node-type logic — adding a node type means
 *   adding a handler class here, nothing else.
 * - Execution runs on a BullMQ queue (background jobs, bounded concurrency),
 *   so the HTTP layer never blocks on a workflow and runs survive restarts.
 * - Scheduled workflows are registered as repeatable jobs on boot.
 */
const STEP_HANDLER_CLASSES = [
  AgentTaskHandler,
  ToolCallHandler,
  ConditionHandler,
  ApprovalHandler,
  DelayHandler,
  WebhookHandler,
  MemoryHandler,
  SubWorkflowHandler,
];

@Global()
@Module({
  controllers: [WorkflowsController, ApprovalsController, HooksController],
  exports: [
    WorkflowExecutorService,
    WorkflowLifecycleService,
    WorkflowPlannerService,
    WorkflowRepositoryService,
    TriggerService,
    ApprovalCoordinatorService,
  ],
  imports: [
    DatabaseModule,
    ExecutionsModule,
    ToolsModule,
    MemoryModule,
    BullModule.registerQueue({ name: WORKFLOW_EXECUTIONS_QUEUE }),
  ],
  providers: [
    // Handlers
    ...STEP_HANDLER_CLASSES,
    {
      inject: STEP_HANDLER_CLASSES,
      provide: STEP_HANDLERS,
      useFactory: (...handlers) => handlers,
    },
    StepHandlerRegistry,
    // Engine services
    DecisionEngineService,
    RecoveryManagerService,
    ExecutionEventsService,
    ApprovalCoordinatorService,
    WorkflowExecutorService,
    WorkflowLifecycleService,
    WorkflowPlannerService,
    WorkflowRepositoryService,
    TriggerService,
    WorkflowExecutionProcessor,
  ],
})
export class WorkflowModule implements OnModuleInit {
  constructor(private readonly triggers: TriggerService) {}

  async onModuleInit(): Promise<void> {
    await this.triggers.bootstrapSchedules();
  }
}
