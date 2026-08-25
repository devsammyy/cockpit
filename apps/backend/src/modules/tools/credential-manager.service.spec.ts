import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { CredentialManagerService } from "./credential-manager.service";
import { PrismaService } from "../../infrastructure/database/prisma.service";

describe("CredentialManagerService", () => {
  let service: CredentialManagerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CredentialManagerService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => "a-development-secret-with-32-characters"),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<CredentialManagerService>(CredentialManagerService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("encrypts and decrypts sensitive values to yield identical source text", () => {
    const secretValue = "github_token_secret_123";
    const encrypted = service.encrypt(secretValue);

    expect(encrypted.encrypted).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();

    const decrypted = service.decrypt(encrypted.encrypted, encrypted.iv, encrypted.tag);
    expect(decrypted).toBe(secretValue);
  });
});
