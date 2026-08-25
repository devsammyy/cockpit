import { ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";

import { TriggerService } from "./trigger.service";

describe("TriggerService — webhook triggers", () => {
  const ORG = "org-1";
  const WORKFLOW_ID = "9f6a2f6e-64c8-4bcb-a2c8-3f9a3d1c0001";

  let prisma: {
    workflow: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  };
  let lifecycle: { start: jest.Mock };
  let queue: { upsertJobScheduler: jest.Mock; removeJobScheduler: jest.Mock };
  let service: TriggerService;

  const workflowRow = (overrides: Record<string, unknown> = {}) => ({
    createdBy: "user-1",
    deletedAt: null,
    id: WORKFLOW_ID,
    organizationId: ORG,
    status: "ACTIVE",
    triggerConfig: { enabled: true, secret: "s3cr3t-token" },
    triggerType: "WEBHOOK",
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      workflow: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    lifecycle = { start: jest.fn().mockResolvedValue({ executionId: "exec-1" }) };
    queue = {
      removeJobScheduler: jest.fn().mockResolvedValue(undefined),
      upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
    };
    service = new TriggerService(prisma as never, lifecycle as never, queue as never);
  });

  describe("fireWebhook", () => {
    it("starts an execution with the payload as input when the token matches", async () => {
      prisma.workflow.findFirst.mockResolvedValue(workflowRow());

      const result = await service.fireWebhook(WORKFLOW_ID, "s3cr3t-token", {
        alert: "cpu-high",
      });

      expect(result).toEqual({ executionId: "exec-1" });
      expect(lifecycle.start).toHaveBeenCalledWith({
        input: { alert: "cpu-high" },
        organizationId: ORG,
        triggerType: "WEBHOOK",
        userId: "user-1",
        workflowId: WORKFLOW_ID,
      });
    });

    it("rejects an invalid token with 401 and never starts an execution", async () => {
      prisma.workflow.findFirst.mockResolvedValue(workflowRow());

      await expect(service.fireWebhook(WORKFLOW_ID, "wrong-token!", {})).rejects.toThrow(
        UnauthorizedException,
      );
      expect(lifecycle.start).not.toHaveBeenCalled();
    });

    it("rejects a missing token", async () => {
      prisma.workflow.findFirst.mockResolvedValue(workflowRow());
      await expect(service.fireWebhook(WORKFLOW_ID, undefined, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("409s when the workflow is not webhook-triggered", async () => {
      prisma.workflow.findFirst.mockResolvedValue(workflowRow({ triggerType: "MANUAL" }));
      await expect(service.fireWebhook(WORKFLOW_ID, "s3cr3t-token", {})).rejects.toThrow(
        ConflictException,
      );
    });

    it("409s when the webhook was disabled", async () => {
      prisma.workflow.findFirst.mockResolvedValue(
        workflowRow({ triggerConfig: { enabled: false, secret: "s3cr3t-token" } }),
      );
      await expect(service.fireWebhook(WORKFLOW_ID, "s3cr3t-token", {})).rejects.toThrow(
        ConflictException,
      );
    });

    it("404s for an unknown workflow", async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);
      await expect(service.fireWebhook(WORKFLOW_ID, "s3cr3t-token", {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("enableWebhook", () => {
    it("stores a fresh secret and returns the hook path", async () => {
      prisma.workflow.findFirst.mockResolvedValue(workflowRow({ triggerType: "MANUAL" }));

      const result = await service.enableWebhook(WORKFLOW_ID, ORG);

      expect(result.path).toBe(`/hooks/workflows/${WORKFLOW_ID}`);
      expect(result.secret).toMatch(/^[0-9a-f]{48}$/);
      expect(prisma.workflow.update).toHaveBeenCalledWith({
        data: {
          triggerConfig: { enabled: true, secret: result.secret },
          triggerType: "WEBHOOK",
        },
        where: { id: WORKFLOW_ID },
      });
    });

    it("rotates the secret on repeat calls", async () => {
      prisma.workflow.findFirst.mockResolvedValue(workflowRow());
      const first = await service.enableWebhook(WORKFLOW_ID, ORG);
      const second = await service.enableWebhook(WORKFLOW_ID, ORG);
      expect(first.secret).not.toBe(second.secret);
    });

    it("404s when the workflow belongs to another org", async () => {
      prisma.workflow.findFirst.mockResolvedValue(null);
      await expect(service.enableWebhook(WORKFLOW_ID, "other-org")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("disableTriggers", () => {
    it("resets to MANUAL and removes any schedule", async () => {
      prisma.workflow.findFirst.mockResolvedValue(workflowRow());

      await service.disableTriggers(WORKFLOW_ID, ORG);

      expect(prisma.workflow.update).toHaveBeenCalledWith({
        data: { triggerConfig: {}, triggerType: "MANUAL" },
        where: { id: WORKFLOW_ID },
      });
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(`schedule:${WORKFLOW_ID}`);
    });
  });

  describe("enableSchedule", () => {
    it("stores the cron and registers a repeatable job", async () => {
      prisma.workflow.findFirst.mockResolvedValue(workflowRow({ triggerType: "MANUAL" }));

      await service.enableSchedule(WORKFLOW_ID, ORG, "0 9 * * 1-5", { region: "eu" });

      expect(prisma.workflow.update).toHaveBeenCalledWith({
        data: {
          triggerConfig: { cron: "0 9 * * 1-5", input: { region: "eu" } },
          triggerType: "SCHEDULED",
        },
        where: { id: WORKFLOW_ID },
      });
      expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
        `schedule:${WORKFLOW_ID}`,
        { pattern: "0 9 * * 1-5" },
        expect.objectContaining({ name: "scheduled" }),
      );
    });
  });
});
