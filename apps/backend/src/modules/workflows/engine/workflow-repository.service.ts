import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { validateDefinition } from "./dependency-resolver";
import { REFERENCE_TEMPLATES } from "./reference-templates";
import { TriggerService } from "./trigger.service";
import { WorkflowDefinition, WorkflowDefinitionSchema } from "./workflow-definition.schema";

/**
 * Workflow persistence: create/update/list/get/delete plus immutable version
 * history. Definitions are validated against the engine's structural rules on
 * every write, so an invalid graph can never be stored — the "create
 * workflows without code changes" guarantee holds because the same validation
 * the engine uses at runtime is enforced at authoring time.
 */
@Injectable()
export class WorkflowRepositoryService {
  private readonly logger = new Logger(WorkflowRepositoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly triggers: TriggerService,
  ) {}

  private parseDefinition(raw: unknown): WorkflowDefinition {
    const parsed = WorkflowDefinitionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(`Invalid workflow definition: ${parsed.error.message}`);
    }
    const errors = validateDefinition(parsed.data).filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      throw new BadRequestException(
        `Workflow definition has ${String(errors.length)} error(s): ${errors.map((e) => e.message).join("; ")}`,
      );
    }
    return parsed.data;
  }

  async create(input: {
    organizationId: string;
    userId: string;
    name: string;
    description?: string;
    definition: unknown;
    triggerType?: string;
    triggerConfig?: Record<string, unknown>;
    tags?: string[];
    category?: string;
  }): Promise<unknown> {
    const definition = this.parseDefinition(input.definition);
    const workflowId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const slug = await this.uniqueSlug(input.organizationId, input.name);

    const workflow = await this.prisma.workflow.create({
      data: {
        category: input.category,
        createdBy: input.userId,
        currentVersionId: versionId,
        definition: definition as any,
        description: input.description ?? "",
        id: workflowId,
        name: input.name,
        organizationId: input.organizationId,
        slug,
        status: "ACTIVE",
        tags: input.tags ?? [],
        triggerConfig: (input.triggerConfig ?? {}) as any,
        triggerType: input.triggerType ?? "MANUAL",
        versions: {
          create: {
            changelog: "Initial version",
            definition: definition as any,
            id: versionId,
            publishedBy: input.userId,
            triggerConfig: (input.triggerConfig ?? {}) as any,
            versionNumber: 1,
          },
        },
      },
    });

    await this.syncSchedule(workflow.id, input.triggerType, input.triggerConfig);
    this.logger.log(`Created workflow ${workflow.id} (${input.name})`);
    return workflow;
  }

  /** Update a workflow, creating a new immutable version snapshot. */
  async update(
    workflowId: string,
    organizationId: string,
    userId: string,
    input: {
      name?: string;
      description?: string;
      definition?: unknown;
      status?: string;
      triggerType?: string;
      triggerConfig?: Record<string, unknown>;
      tags?: string[];
      changelog?: string;
    },
  ): Promise<unknown> {
    const existing = await this.requireWorkflow(workflowId, organizationId);
    const definition = input.definition ? this.parseDefinition(input.definition) : undefined;

    let currentVersionId = existing.currentVersionId;
    if (definition) {
      const versionCount = await this.prisma.workflowVersion.count({ where: { workflowId } });
      const versionId = crypto.randomUUID();
      await this.prisma.workflowVersion.create({
        data: {
          changelog: input.changelog ?? `Update v${String(versionCount + 1)}`,
          definition: definition as any,
          id: versionId,
          publishedBy: userId,
          triggerConfig: (input.triggerConfig ?? existing.triggerConfig) as any,
          versionNumber: versionCount + 1,
          workflowId,
        },
      });
      currentVersionId = versionId;
    }

    const workflow = await this.prisma.workflow.update({
      data: {
        category: input.tags ? undefined : undefined,
        currentVersionId,
        definition: (definition ?? existing.definition) as any,
        description: input.description ?? existing.description,
        name: input.name ?? existing.name,
        status: input.status ?? existing.status,
        tags: input.tags ?? existing.tags,
        triggerConfig: (input.triggerConfig ?? existing.triggerConfig) as any,
        triggerType: input.triggerType ?? existing.triggerType,
        version: { increment: 1 },
      },
      where: { id: workflowId },
    });

    await this.syncSchedule(
      workflowId,
      input.triggerType ?? existing.triggerType,
      (input.triggerConfig ?? existing.triggerConfig) as Record<string, unknown>,
    );
    return workflow;
  }

  async list(organizationId: string): Promise<unknown[]> {
    return this.prisma.workflow.findMany({
      orderBy: { updatedAt: "desc" },
      where: { deletedAt: null, organizationId },
    });
  }

  async get(workflowId: string, organizationId: string): Promise<unknown> {
    return this.requireWorkflow(workflowId, organizationId);
  }

  async versions(workflowId: string, organizationId: string): Promise<unknown[]> {
    await this.requireWorkflow(workflowId, organizationId);
    return this.prisma.workflowVersion.findMany({
      orderBy: { versionNumber: "desc" },
      where: { workflowId },
    });
  }

  /** Roll a workflow back to a prior version by snapshotting it as the newest. */
  async rollback(
    workflowId: string,
    organizationId: string,
    userId: string,
    versionNumber: number,
  ): Promise<unknown> {
    await this.requireWorkflow(workflowId, organizationId);
    const target = await this.prisma.workflowVersion.findFirst({
      where: { versionNumber, workflowId },
    });
    if (!target) {
      throw new NotFoundException(`Version ${String(versionNumber)} not found`);
    }
    return this.update(workflowId, organizationId, userId, {
      changelog: `Rollback to v${String(versionNumber)}`,
      definition: target.definition,
    });
  }

  async remove(workflowId: string, organizationId: string): Promise<void> {
    await this.requireWorkflow(workflowId, organizationId);
    await this.prisma.workflow.update({
      data: { deletedAt: new Date(), status: "ARCHIVED" },
      where: { id: workflowId },
    });
  }

  /** Seed the built-in reference templates for an organization (idempotent). */
  async seedReferenceTemplates(
    organizationId: string,
    userId: string,
  ): Promise<{ seeded: number }> {
    let seeded = 0;
    for (const template of REFERENCE_TEMPLATES) {
      const existing = await this.prisma.workflow.findFirst({
        where: { organizationId, slug: template.slug },
      });
      if (existing) continue;

      await this.create({
        category: template.category,
        definition: template.definition,
        description: template.description,
        name: template.name,
        organizationId,
        tags: template.tags,
        userId,
      });
      seeded += 1;
    }
    this.logger.log(`Seeded ${String(seeded)} reference template(s) for org ${organizationId}`);
    return { seeded };
  }

  private async syncSchedule(
    workflowId: string,
    triggerType: string | undefined,
    triggerConfig: Record<string, unknown> | undefined,
  ): Promise<void> {
    if (triggerType === "SCHEDULED" && triggerConfig) {
      const workflow = await this.prisma.workflow.findUnique({ where: { id: workflowId } });
      if (workflow) {
        await this.triggers.registerSchedule({
          id: workflowId,
          organizationId: workflow.organizationId,
          triggerConfig,
        });
      }
    }
  }

  private async uniqueSlug(organizationId: string, name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "workflow";
    let slug = base;
    let suffix = 1;
    while (await this.prisma.workflow.findFirst({ where: { organizationId, slug } })) {
      slug = `${base}-${String(suffix++)}`;
    }
    return slug;
  }

  private async requireWorkflow(workflowId: string, organizationId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { deletedAt: null, id: workflowId, organizationId },
    });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found`);
    }
    return workflow;
  }
}
