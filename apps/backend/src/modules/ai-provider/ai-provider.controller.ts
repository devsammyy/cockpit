import { Controller, Get, Post, Body, UseGuards, Logger } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
} from "@nestjs/swagger";
import { IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from "class-validator";
import { ModelRegistryService } from "./model-registry.service";
import { AiProviderManagerService } from "./ai-provider-manager.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PrismaService } from "../../infrastructure/database/prisma.service";

class SandboxExecutionDto {
  @ApiProperty({ description: "The user prompt to send to the model." })
  @IsString()
  @MinLength(1)
  prompt!: string;

  @ApiProperty({ description: "Identifier of the model to run, e.g. qwen-turbo." })
  @IsString()
  @MinLength(1)
  modelId!: string;

  @ApiPropertyOptional({ description: "Sampling temperature (0–2).", default: 0.7 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ description: "Maximum output tokens." })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTokens?: number;
}

@ApiTags("ai-provider")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("ai")
export class AiProviderController {
  private readonly logger = new Logger(AiProviderController.name);

  constructor(
    private readonly modelRegistry: ModelRegistryService,
    private readonly providerManager: AiProviderManagerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("models")
  @ApiOperation({ summary: "List active models with capabilities" })
  async getModels() {
    const data = await this.modelRegistry.getActiveModels();
    return { success: true, data };
  }

  @Get("quotas")
  @ApiOperation({ summary: "Retrieve organization daily/monthly token limits and usage" })
  async getQuotas(@CurrentUser("orgId") orgId: string) {
    let data = await this.prisma.tokenQuota.findFirst({
      where: { organizationId: orgId },
    });

    if (!data) {
      data = await this.prisma.tokenQuota.create({
        data: {
          id: crypto.randomUUID(),
          organizationId: orgId,
          dailyLimit: 1000000,
          monthlyLimit: 20000000,
        },
      });
    }

    return { success: true, data };
  }

  @Post("sandbox")
  @ApiOperation({ summary: "Execute sandbox prompt for playground testing" })
  async executeSandbox(@CurrentUser("orgId") orgId: string, @Body() dto: SandboxExecutionDto) {
    this.logger.log(`Executing sandbox prompt on model: ${dto.modelId}`);
    const startTime = Date.now();

    const result = await this.providerManager.chat([{ role: "user", content: dto.prompt }], {
      modelId: dto.modelId,
      orgId,
      temperature: dto.temperature ?? 0.7,
      maxTokens: dto.maxTokens,
    });

    const durationMs = Date.now() - startTime;
    return {
      success: true,
      data: {
        output: result.message.content,
        usage: result.usage,
        latencyMs: durationMs,
      },
    };
  }
}
