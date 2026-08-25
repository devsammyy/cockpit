import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { OrganizationsService } from "./organizations.service";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { ForbiddenException } from "@nestjs/common";

describe("OrganizationsService", () => {
  let service: OrganizationsService;
  let prismaMock: any;
  let jwtMock: any;

  beforeEach(async () => {
    prismaMock = {
      organizationMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    jwtMock = {
      sign: jest.fn().mockReturnValue("new-mock-org-token"),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "JWT_ACCESS_TOKEN_SECRET")
                return "a-development-secret-with-32-characters";
              if (key === "JWT_ACCESS_TOKEN_TTL") return "15m";
              return "";
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<OrganizationsService>(OrganizationsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("switchOrganization", () => {
    it("throws ForbiddenException if user has no membership in organization", async () => {
      prismaMock.organizationMember.findUnique.mockResolvedValueOnce(null);
      await expect(service.switchOrganization("user_1", "org_2")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("issues a new token when membership is verified", async () => {
      prismaMock.organizationMember.findUnique.mockResolvedValueOnce({
        userId: "user_1",
        organizationId: "org_2",
        status: "ACTIVE",
        user: { email: "user@example.com" },
        role: { name: "Admin", permissions: ["agent:read"] },
      });

      const res = await service.switchOrganization("user_1", "org_2");
      expect(res.accessToken).toBe("new-mock-org-token");
      expect(jwtMock.sign).toHaveBeenCalled();
    });
  });
});
