import { Controller, Get, Post, Body, Param, UseGuards, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { ToolRegistryService } from "./tool-registry.service";
import { ToolExecutorService } from "./tool-executor.service";
import { CredentialManagerService } from "./credential-manager.service";
import { ToolApprovalService } from "./framework/tool-approval.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PrismaService } from "../../infrastructure/database/prisma.service";

class StoreCredentialDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ description: "Logical key tools reference this secret by." })
  @IsString()
  @MinLength(1)
  key!: string;

  @ApiProperty({ description: "The secret value; encrypted at rest, never logged." })
  @IsString()
  @MinLength(1)
  value!: string;
}

class ToolExecuteRequestDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  toolName!: string;

  @ApiProperty({ type: "object", additionalProperties: true, default: {} })
  @IsOptional()
  @IsObject()
  arguments?: Record<string, unknown>;
}

class DecideApprovalDto {
  @ApiProperty({ enum: ["APPROVE", "REJECT"] })
  @IsIn(["APPROVE", "REJECT"])
  action!: "APPROVE" | "REJECT";
}

@ApiTags("tools")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("tools")
export class ToolsController {
  private readonly logger = new Logger(ToolsController.name);

  constructor(
    private readonly registry: ToolRegistryService,
    private readonly executor: ToolExecutorService,
    private readonly credentialManager: CredentialManagerService,
    private readonly toolApproval: ToolApprovalService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("catalog")
  @ApiOperation({ summary: "List metadata specifications for all active tools in registry" })
  getTools() {
    const list = this.registry.getAll().map((tool) => ({
      name: tool.metadata.name,
      description: tool.metadata.description,
      timeoutMs: tool.metadata.timeoutMs,
      retryAttempts: tool.metadata.retryAttempts,
    }));
    return { success: true, data: list };
  }

  @Post("credentials")
  @ApiOperation({ summary: "Securely store a secret credential API key inside org vault" })
  async storeCredential(@CurrentUser("orgId") orgId: string, @Body() dto: StoreCredentialDto) {
    const record = await this.credentialManager.storeCredential(
      orgId,
      dto.name,
      dto.key,
      dto.value,
    );
    return {
      success: true,
      data: {
        id: record.id,
        name: record.name,
        key: record.key,
      },
    };
  }

  @Get("approvals")
  @ApiOperation({ summary: "List tool executions awaiting durable approval" })
  async getApprovals(@CurrentUser("orgId") orgId: string) {
    const data = await this.toolApproval.listPendingExecutions(orgId);
    return { success: true, data };
  }

  @Post("approvals/:id/decide")
  @ApiOperation({ summary: "Approve or reject a pending tool execution (resumes on approve)" })
  async decideApproval(
    @CurrentUser("orgId") orgId: string,
    @CurrentUser("sub") userId: string,
    @Param("id") id: string,
    @Body() dto: DecideApprovalDto,
  ) {
    await this.toolApproval.decide(id, orgId, userId, dto.action);
    return { success: true };
  }

  @Post("execute")
  @ApiOperation({ summary: "Execute tool inside the sandbox framework pipeline" })
  async executeTool(
    @CurrentUser("orgId") orgId: string,
    @CurrentUser("sub") userId: string,
    @Body() dto: ToolExecuteRequestDto,
  ) {
    this.logger.log(`Invoking tool execution sandbox for: ${dto.toolName}`);
    const res = await this.executor.execute(dto.toolName, dto.arguments ?? {}, { orgId, userId });
    return { success: true, data: res };
  }

  @Get("history")
  @ApiOperation({ summary: "Retrieve logs of past tool executions" })
  async getHistory(@CurrentUser("orgId") orgId: string) {
    const list = await this.prisma.toolExecutionHistory.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: list };
  }
}
