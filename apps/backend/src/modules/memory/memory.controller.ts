import { Controller, Get, Post, Body, UseGuards, Logger, Inject } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
} from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, MinLength } from "class-validator";
import { SemanticMemory, SEMANTIC_MEMORY } from "./memory.interface";
import { ReflectionEngineService } from "./reflection-engine.service";
import { ContextBuilderService } from "./context-builder.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PrismaService } from "../../infrastructure/database/prisma.service";

class AddKnowledgeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;
}

class SearchQueryDto {
  @ApiProperty({ description: "The semantic search query." })
  @IsString()
  @MinLength(1)
  text!: string;
}

@ApiTags("memory")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("memory")
export class MemoryController {
  private readonly logger = new Logger(MemoryController.name);

  constructor(
    @Inject(SEMANTIC_MEMORY) private readonly semanticMemory: SemanticMemory,
    private readonly reflectionEngine: ReflectionEngineService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("knowledge")
  @ApiOperation({
    summary: "Index a new corporate knowledge document into organization context index",
  })
  async addKnowledge(@CurrentUser("orgId") orgId: string, @Body() dto: AddKnowledgeDto) {
    this.logger.log(`Indexing corporate knowledge document: ${dto.title}`);
    const mockVector = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);

    const record = await this.prisma.knowledgeItem.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: orgId,
        title: dto.title,
        content: dto.content,
        tags: dto.tags ?? [],
        source: dto.source,
        embedding: mockVector as any,
      },
    });

    // Also copy inside semantic memory database indices
    await this.semanticMemory.store(dto.content, mockVector, {
      orgId,
      category: "KNOWLEDGE",
      title: dto.title,
    });

    return { success: true, data: record };
  }

  @Get("knowledge")
  @ApiOperation({ summary: "List corporate knowledge documents indexed for the organization" })
  async getKnowledge(@CurrentUser("orgId") orgId: string) {
    const list = await this.prisma.knowledgeItem.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: list };
  }

  @Get("reflections")
  @ApiOperation({ summary: "List execution reflections recorded by agent run cycles" })
  async getReflections(@CurrentUser("orgId") orgId: string) {
    const list = await this.prisma.reflectionRecord.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: list };
  }

  @Post("search")
  @ApiOperation({ summary: "Perform similarity search query against semantic memories" })
  async searchMemories(@CurrentUser("orgId") orgId: string, @Body() dto: SearchQueryDto) {
    this.logger.log(`Performing semantic memory retrieval search for query: "${dto.text}"`);
    const mockVector = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);

    const results = await this.semanticMemory.search(mockVector, 5);
    // Filter results matching user org context
    const filtered = results.filter(
      (res) => res.metadata["orgId"] === orgId || !res.metadata["orgId"],
    );

    return { success: true, data: filtered };
  }

  @Get("explore")
  @ApiOperation({ summary: "Explore summaries of preference and execution memories" })
  async exploreMemories(@CurrentUser("orgId") orgId: string) {
    const count = await this.prisma.memoryEntry.count({
      where: { organizationId: orgId, deletedAt: null },
    });
    const categoriesStats = await this.prisma.memoryEntry.groupBy({
      by: ["category"],
      where: { organizationId: orgId, deletedAt: null },
      _count: true,
    });

    return {
      success: true,
      data: {
        totalMemories: count,
        categories: categoriesStats.map((stat) => ({
          category: stat.category,
          count: stat._count,
        })),
      },
    };
  }
}
