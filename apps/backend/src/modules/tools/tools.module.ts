import { Module, Global, OnApplicationBootstrap, Logger } from "@nestjs/common";
import { ToolRegistryService } from "./tool-registry.service";
import { CredentialManagerService } from "./credential-manager.service";
import { PolicyEngineService } from "./policy-engine.service";
import { ToolExecutorService } from "./tool-executor.service";
import { McpClientService } from "./mcp-client.service";
import { SlackConnector, GitHubConnector, EmailConnector } from "./connector-framework";
import { EventDispatcherService } from "./framework/event-dispatcher.service";
import { AuditPipelineService } from "./framework/audit-pipeline.service";
import { ToolSandboxService } from "./framework/tool-sandbox.service";
import { PermissionEngineService } from "./framework/permission-engine.service";
import { ConnectorInvokerService } from "./framework/connector-invoker.service";
import { ToolLoaderService } from "./framework/tool-loader.service";
import { ConnectorRegistryService } from "./framework/connector-registry.service";
import { ToolApprovalService } from "./framework/tool-approval.service";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { ToolsController } from "./tools.controller";

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    ToolRegistryService,
    CredentialManagerService,
    PolicyEngineService,
    ToolExecutorService,
    McpClientService,
    // ── Tool Execution Framework core services ──
    EventDispatcherService,
    AuditPipelineService,
    ToolSandboxService,
    PermissionEngineService,
    ConnectorInvokerService,
    ToolLoaderService,
    ConnectorRegistryService,
    ToolApprovalService,
    SlackConnector,
    GitHubConnector,
    EmailConnector,
  ],
  controllers: [ToolsController],
  exports: [
    ToolRegistryService,
    CredentialManagerService,
    PolicyEngineService,
    ToolExecutorService,
    McpClientService,
    EventDispatcherService,
    AuditPipelineService,
    ToolSandboxService,
    PermissionEngineService,
    ConnectorInvokerService,
    ToolLoaderService,
    ConnectorRegistryService,
    ToolApprovalService,
  ],
})
export class ToolsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(ToolsModule.name);

  constructor(
    private readonly registry: ToolRegistryService,
    private readonly loader: ToolLoaderService,
    private readonly slack: SlackConnector,
    private readonly github: GitHubConnector,
    private readonly email: EmailConnector,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // 1. Register built-in code (reference) connectors.
    this.registry.register(this.slack);
    this.registry.register(this.github);
    this.registry.register(this.email);

    // 2. Materialize persisted, declarative tool definitions (best-effort — a DB
    //    hiccup must never block boot; MCP tools self-register via the MCP client).
    try {
      await this.loader.loadPersistedTools();
    } catch (err) {
      this.logger.warn(`Persisted tool load skipped: ${(err as Error).message}`);
    }
  }
}
