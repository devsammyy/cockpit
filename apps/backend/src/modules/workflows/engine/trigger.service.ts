import * as crypto from "node:crypto";

import { InjectQueue } from "@nestjs/bullmq";
import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Queue } from "bullmq";

import { PrismaService } from "../../../infrastructure/database/prisma.service";
import { WorkflowLifecycleService } from "./workflow-lifecycle.service";
import { ScheduledJobData, WORKFLOW_EXECUTIONS_QUEUE } from "./queue.constants";

/** Constant-time string comparison so token checks don't leak length/prefix. */
function timingSafeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Non-manual workflow triggers.
 *
 * - Scheduled: workflows with triggerType=SCHEDULED and a cron in
 *   triggerConfig.cron are registered as BullMQ repeatable jobs on boot, so
 *   scheduling survives restarts and is distributed across workers.
 * - Event-driven: emit(eventName, payload) fans an application event out to
 *   every ACTIVE workflow whose triggerConfig.event matches, starting one
 *   execution per match with the event payload as input.
 * - Webhook: enableWebhook() issues a per-workflow secret; the public
 *   /hooks/workflows/:id endpoint fires executions for external systems
 *   (monitoring alerts, mail parsers, CRMs) that cannot hold a JWT.
 */
@Injectable()
export class TriggerService {
  private readonly logger = new Logger(TriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: WorkflowLifecycleService,
    @InjectQueue(WORKFLOW_EXECUTIONS_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Register (or refresh) the repeatable BullMQ job for a scheduled workflow.
   * Idempotent: keyed by workflow id so re-registration replaces the pattern.
   */
  async registerSchedule(workflow: {
    id: string;
    organizationId: string;
    triggerConfig: Record<string, unknown>;
  }): Promise<void> {
    const cron =
      typeof workflow.triggerConfig["cron"] === "string" ? workflow.triggerConfig["cron"] : null;
    if (!cron) return;

    const data: ScheduledJobData = {
      organizationId: workflow.organizationId,
      scheduled: true,
      workflowId: workflow.id,
    };
    await this.queue.upsertJobScheduler(
      `schedule:${workflow.id}`,
      { pattern: cron },
      { data, name: "scheduled" },
    );
    this.logger.log(`Registered schedule "${cron}" for workflow ${workflow.id}`);
  }

  async removeSchedule(workflowId: string): Promise<void> {
    try {
      await this.queue.removeJobScheduler(`schedule:${workflowId}`);
    } catch (error) {
      this.logger.warn(`Failed to remove schedule for ${workflowId}: ${(error as Error).message}`);
    }
  }

  /**
   * Fan an application event out to matching event-driven workflows.
   * Returns the executions started.
   */
  async emit(
    organizationId: string,
    eventName: string,
    payload: Record<string, unknown>,
  ): Promise<{ workflowId: string; executionId: string }[]> {
    const workflows = await this.prisma.workflow.findMany({
      where: { deletedAt: null, organizationId, status: "ACTIVE", triggerType: "EVENT" },
    });

    const started: { workflowId: string; executionId: string }[] = [];
    for (const workflow of workflows) {
      const config = (workflow.triggerConfig as Record<string, unknown>) ?? {};
      if (config["event"] !== eventName) continue;

      const { executionId } = await this.lifecycle.start({
        input: { event: eventName, ...payload },
        organizationId,
        triggerType: "EVENT",
        userId: workflow.createdBy,
        workflowId: workflow.id,
      });
      started.push({ executionId, workflowId: workflow.id });
    }

    this.logger.log(
      `Event "${eventName}" triggered ${String(started.length)} workflow(s) in org ${organizationId}`,
    );
    return started;
  }

  // ── Inbound webhook triggers ──

  /**
   * Enable the public webhook trigger for a workflow: generates a fresh
   * secret and returns it. Calling again rotates the secret (old URLs stop
   * working), which is the standard operational answer to a leaked token.
   */
  async enableWebhook(
    workflowId: string,
    organizationId: string,
  ): Promise<{ path: string; secret: string }> {
    const workflow = await this.requireWorkflow(workflowId, organizationId);
    const secret = crypto.randomBytes(24).toString("hex");
    await this.prisma.workflow.update({
      data: {
        triggerConfig: { enabled: true, secret },
        triggerType: "WEBHOOK",
      },
      where: { id: workflow.id },
    });
    await this.removeSchedule(workflow.id);
    this.logger.log(`Webhook trigger enabled for workflow ${workflow.id}`);
    return { path: `/hooks/workflows/${workflow.id}`, secret };
  }

  /** Enable a cron schedule for a workflow (BullMQ repeatable job). */
  async enableSchedule(
    workflowId: string,
    organizationId: string,
    cron: string,
    input?: Record<string, unknown>,
  ): Promise<void> {
    const workflow = await this.requireWorkflow(workflowId, organizationId);
    const triggerConfig: Record<string, unknown> = { cron, ...(input ? { input } : {}) };
    await this.prisma.workflow.update({
      data: { triggerConfig: triggerConfig as Prisma.InputJsonValue, triggerType: "SCHEDULED" },
      where: { id: workflow.id },
    });
    await this.registerSchedule({ id: workflow.id, organizationId, triggerConfig });
  }

  /** Reset a workflow back to manual-only triggering. */
  async disableTriggers(workflowId: string, organizationId: string): Promise<void> {
    const workflow = await this.requireWorkflow(workflowId, organizationId);
    await this.prisma.workflow.update({
      data: { triggerConfig: {}, triggerType: "MANUAL" },
      where: { id: workflow.id },
    });
    await this.removeSchedule(workflow.id);
    this.logger.log(`Triggers disabled for workflow ${workflow.id}`);
  }

  /**
   * Fire a workflow from the public webhook endpoint. Token is compared
   * timing-safe against the stored secret; the request body becomes the
   * execution input. Returns the started execution id.
   */
  async fireWebhook(
    workflowId: string,
    token: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<{ executionId: string }> {
    const workflow = await this.prisma.workflow.findFirst({
      where: { deletedAt: null, id: workflowId },
    });
    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }
    if (workflow.triggerType !== "WEBHOOK") {
      throw new ConflictException("Webhook trigger is not enabled for this workflow");
    }

    const config = (workflow.triggerConfig as Record<string, unknown>) ?? {};
    const secret = typeof config["secret"] === "string" ? config["secret"] : "";
    if (config["enabled"] === false || secret.length === 0) {
      throw new ConflictException("Webhook trigger is not enabled for this workflow");
    }
    if (!token || !timingSafeEquals(token, secret)) {
      throw new UnauthorizedException("Invalid webhook token");
    }

    const { executionId } = await this.lifecycle.start({
      input: payload,
      organizationId: workflow.organizationId,
      triggerType: "WEBHOOK",
      userId: workflow.createdBy,
      workflowId: workflow.id,
    });
    this.logger.log(`Webhook fired workflow ${workflow.id} → execution ${executionId}`);
    return { executionId };
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

  /** Register all scheduled workflows on module init (called by the module). */
  async bootstrapSchedules(): Promise<void> {
    try {
      const scheduled = await this.prisma.workflow.findMany({
        where: { deletedAt: null, status: "ACTIVE", triggerType: "SCHEDULED" },
      });
      for (const workflow of scheduled) {
        await this.registerSchedule({
          id: workflow.id,
          organizationId: workflow.organizationId,
          triggerConfig: (workflow.triggerConfig as Record<string, unknown>) ?? {},
        });
      }
      if (scheduled.length > 0) {
        this.logger.log(`Bootstrapped ${String(scheduled.length)} scheduled workflow(s)`);
      }
    } catch (error) {
      this.logger.warn(`Schedule bootstrap skipped: ${(error as Error).message}`);
    }
  }
}
