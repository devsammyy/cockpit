import { Module } from "@nestjs/common";
import { AiProviderModule } from "../ai-provider/ai-provider.module";
import { ToolsModule } from "../tools/tools.module";
import { PromptBuilderService } from "./prompt-builder.service";
import { PlannerService } from "./planner.service";
import { ApprovalEngineService } from "./approval-engine.service";
import { RetryEngineService } from "./retry-engine.service";
import { CostTrackerService } from "./cost-tracker.service";
import { TelemetryService } from "./telemetry.service";
import { AgentRuntimeService } from "./agent-runtime.service";

@Module({
  imports: [AiProviderModule, ToolsModule],
  providers: [
    PromptBuilderService,
    PlannerService,
    ApprovalEngineService,
    RetryEngineService,
    CostTrackerService,
    TelemetryService,
    AgentRuntimeService,
  ],
  exports: [
    PromptBuilderService,
    PlannerService,
    ApprovalEngineService,
    RetryEngineService,
    CostTrackerService,
    TelemetryService,
    AgentRuntimeService,
  ],
})
export class ExecutionsModule {}
