import { Test } from "@nestjs/testing";
import { PolicyEngineService } from "./policy-engine.service";
import { PrismaService } from "../../infrastructure/database/prisma.service";

describe("PolicyEngineService", () => {
  let service: PolicyEngineService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      toolPolicy: {
        findFirst: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PolicyEngineService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = moduleRef.get<PolicyEngineService>(PolicyEngineService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("permits execution by default if no policy rule exists", async () => {
    prismaMock.toolPolicy.findFirst.mockResolvedValueOnce(null);
    const res = await service.evaluate("org_1", "my_tool", "user_1");
    expect(res.allowed).toBe(true);
    expect(res.requiresApproval).toBe(false);
  });

  it("blocks execution if user is not in the policy allowedUsers limit list", async () => {
    prismaMock.toolPolicy.findFirst.mockResolvedValueOnce({
      toolName: "restricted_tool",
      maxDurationMs: 15000,
      allowedUsers: ["user_2"],
      requiresApproval: false,
    });

    const res = await service.evaluate("org_1", "restricted_tool", "user_1");
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("is not in the allowed users list");
  });

  it("evaluates requiresApproval flag from DB policy settings", async () => {
    prismaMock.toolPolicy.findFirst.mockResolvedValueOnce({
      toolName: "critical_tool",
      maxDurationMs: 20000,
      allowedUsers: [],
      requiresApproval: true,
    });

    const res = await service.evaluate("org_1", "critical_tool", "user_1");
    expect(res.allowed).toBe(true);
    expect(res.requiresApproval).toBe(true);
  });
});
