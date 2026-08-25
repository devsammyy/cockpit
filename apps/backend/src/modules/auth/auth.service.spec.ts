import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { ConflictException } from "@nestjs/common";

describe("AuthService", () => {
  let service: AuthService;
  let prismaMock: any;
  let jwtMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      organization: {
        create: jest.fn(),
      },
      role: {
        create: jest.fn(),
      },
      organizationMember: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(prismaMock);
      }),
    };

    jwtMock = {
      sign: jest.fn().mockReturnValue("mock-access-token"),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
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

    service = moduleRef.get<AuthService>(AuthService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("register", () => {
    it("throws ConflictException if email is already taken", async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: "user_1" });
      await expect(
        service.register({ email: "taken@example.com", passwordHash: "123", displayName: "Name" }),
      ).rejects.toThrow(ConflictException);
    });

    it("registers user and provisions workspace organization", async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValueOnce({
        id: "u1",
        email: "new@example.com",
        displayName: "Name",
      });
      prismaMock.organization.create.mockResolvedValueOnce({ id: "o1" });

      const res = await service.register({
        email: "new@example.com",
        passwordHash: "password123",
        displayName: "Name",
      });
      expect(res.id).toBe("u1");
      expect(res.defaultOrgId).toBe("o1");
    });
  });
});
