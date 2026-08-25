import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { z } from "zod";

import { PrismaService } from "../../infrastructure/database/prisma.service";
import { CredentialManagerService } from "./credential-manager.service";
import { PolicyEngineService } from "./policy-engine.service";
import { ToolRegistryService } from "./tool-registry.service";
import { ToolExecutorService } from "./tool-executor.service";
import { AuditPipelineService } from "./framework/audit-pipeline.service";
import { EventDispatcherService } from "./framework/event-dispatcher.service";
import { PermissionEngineService } from "./framework/permission-engine.service";
import { ToolSandboxService } from "./framework/tool-sandbox.service";
import { ToolApprovalService } from "./framework/tool-approval.service";

describe("ToolExecutorService", () => {
  let service: ToolExecutorService;
  let registryMock: any;
  let policyMock: any;
  let permissionMock: any;
  let prismaMock: any;

  const passthroughTool = {
    metadata: {
      name: "my_tool",
      description: "d",
      inputSchema: z.looseObject({}),
    },
    execute: jest.fn(),
  };

  beforeEach(async () => {
    registryMock = {
      get: jest.fn().mockReturnValue(passthroughTool),
      invoke: jest.fn().mockResolvedValue({ status: "success" }),
    };
    policyMock = {
      evaluateExecution: jest.fn().mockResolvedValue({
        allowed: true,
        requiresApproval: false,
        maxDurationMs: 10_000,
        concurrencyLimit: null,
      }),
    };
    permissionMock = {
      check: jest.fn().mockResolvedValue({ allowed: true, missing: [] }),
    };
    prismaMock = {
      toolExecutionHistory: { create: jest.fn(), update: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ToolExecutorService,
        ToolSandboxService,
        EventDispatcherService,
        { provide: ToolRegistryService, useValue: registryMock },
        { provide: PolicyEngineService, useValue: policyMock },
        { provide: PermissionEngineService, useValue: permissionMock },
        { provide: CredentialManagerService, useValue: { resolveSecret: jest.fn() } },
        {
          provide: AuditPipelineService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ToolApprovalService,
          useValue: { request: jest.fn().mockResolvedValue({ id: "appr_1" }) },
        },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = moduleRef.get(ToolExecutorService);
  });

  it("is defined", () => {
    expect(service).toBeDefined();
  });

  it("runs the tool directly when permission and policy permit", async () => {
    const res = await service.execute(
      "my_tool",
      { param: 1 },
      { orgId: "org_1", userId: "user_1" },
    );
    expect(res.success).toBe(true);
    expect(res.status).toBe("COMPLETED");
    expect(registryMock.invoke).toHaveBeenCalledWith(
      passthroughTool,
      { param: 1 },
      expect.any(Object),
    );
  });

  it("denies with ForbiddenException when the caller lacks permissions", async () => {
    permissionMock.check.mockResolvedValueOnce({ allowed: false, missing: ["tool:run"] });
    await expect(
      service.execute("my_tool", {}, { orgId: "org_1", userId: "user_1" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(registryMock.invoke).not.toHaveBeenCalled();
  });

  it("denies with BadRequestException when input fails schema validation", async () => {
    registryMock.get.mockReturnValueOnce({
      metadata: { name: "strict", description: "d", inputSchema: z.object({ param: z.number() }) },
      execute: jest.fn(),
    });
    await expect(
      service.execute("strict", {}, { orgId: "org_1", userId: "user_1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(registryMock.invoke).not.toHaveBeenCalled();
  });

  it("denies with ForbiddenException when policy blocks the run", async () => {
    policyMock.evaluateExecution.mockResolvedValueOnce({
      allowed: false,
      requiresApproval: false,
      maxDurationMs: 0,
      concurrencyLimit: null,
      code: "POLICY_VIOLATION",
      reason: "Blocked tool",
    });
    await expect(
      service.execute("my_tool", {}, { orgId: "org_1", userId: "user_1" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns PENDING_APPROVAL without blocking when approval is required", async () => {
    policyMock.evaluateExecution.mockResolvedValueOnce({
      allowed: true,
      requiresApproval: true,
      maxDurationMs: 10_000,
      concurrencyLimit: null,
    });

    const res = await service.execute("my_tool", {}, { orgId: "org_1", userId: "user_1" });
    expect(res.success).toBe(false);
    expect(res.status).toBe("PENDING_APPROVAL");
    expect(res.approvalId).toBe("appr_1");
    expect(registryMock.invoke).not.toHaveBeenCalled();
  });

  it("skips the approval gate for WORKFLOW-sourced runs", async () => {
    policyMock.evaluateExecution.mockResolvedValueOnce({
      allowed: true,
      requiresApproval: true,
      maxDurationMs: 10_000,
      concurrencyLimit: null,
    });

    const res = await service.execute(
      "my_tool",
      {},
      { orgId: "org_1", userId: "user_1", source: "WORKFLOW" },
    );
    expect(res.status).toBe("COMPLETED");
    expect(registryMock.invoke).toHaveBeenCalled();
  });

  it("fails the run when output fails schema validation", async () => {
    registryMock.get.mockReturnValueOnce({
      metadata: {
        name: "typed_out",
        description: "d",
        inputSchema: z.looseObject({}),
        outputSchema: z.object({ ok: z.boolean() }),
      },
      execute: jest.fn(),
    });
    registryMock.invoke.mockResolvedValueOnce({ wrong: 1 });

    await expect(
      service.execute("typed_out", {}, { orgId: "org_1", userId: "user_1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
