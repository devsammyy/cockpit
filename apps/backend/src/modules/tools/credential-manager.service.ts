import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { EnvironmentVariables } from "../../config/env.schema";

@Injectable()
export class CredentialManagerService {
  private readonly logger = new Logger(CredentialManagerService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService<EnvironmentVariables, true>,
  ) {
    const rawKey = configService.get<string>("JWT_ACCESS_TOKEN_SECRET", { infer: true });
    // Securely derive a 32-byte key from the system JWT secret
    this.encryptionKey = crypto.createHash("sha256").update(rawKey).digest();
  }

  /**
   * Encrypt a sensitive text credential.
   */
  encrypt(value: string): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(12); // 12-byte IV for GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);

    let encrypted = cipher.update(value, "utf8", "hex");
    encrypted += cipher.final("hex");

    const tag = cipher.getAuthTag().toString("hex");

    return {
      encrypted,
      iv: iv.toString("hex"),
      tag,
    };
  }

  /**
   * Decrypt an encrypted credential.
   */
  decrypt(encrypted: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      Buffer.from(iv, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Encrypt and upsert a credential. Updating the secret value is treated as a
   * rotation event (stamps `rotatedAt`). Returns metadata only — never the value.
   */
  async storeCredential(
    orgId: string,
    name: string,
    key: string,
    value: string,
    opts?: {
      scope?: "ORGANIZATION" | "USER";
      userId?: string;
      provider?: string;
      description?: string;
      expiresAt?: Date | null;
    },
  ): Promise<{ id: string; name: string; key: string }> {
    const { encrypted, iv, tag } = this.encrypt(value);

    const existing = await this.prisma.credential.findFirst({
      where: { organizationId: orgId, key, deletedAt: null },
    });

    const shared = {
      name,
      description: opts?.description ?? null,
      scope: opts?.scope ?? "ORGANIZATION",
      userId: opts?.userId ?? null,
      provider: opts?.provider ?? "LOCAL",
      encryptedValue: encrypted,
      iv,
      tag,
      expiresAt: opts?.expiresAt ?? null,
    };

    const record = existing
      ? await this.prisma.credential.update({
          where: { id: existing.id },
          data: { ...shared, rotatedAt: new Date() },
        })
      : await this.prisma.credential.create({
          data: { id: crypto.randomUUID(), organizationId: orgId, key, ...shared },
        });

    return { id: record.id, name: record.name, key: record.key };
  }

  /**
   * Resolve a secret for use at execution time. Honors environment overrides
   * (provider = ENV resolves from `process.env[key]`), enforces expiry, and
   * records usage. Never logs the value.
   */
  async resolveSecret(orgId: string, key: string): Promise<string | null> {
    const record = await this.prisma.credential.findFirst({
      where: { organizationId: orgId, key, deletedAt: null },
    });
    if (!record) {
      return null;
    }
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      this.logger.warn(`Credential "${key}" for org ${orgId} has expired`);
      return null;
    }

    let value: string | null;
    if (record.provider === "ENV") {
      value = process.env[key] ?? null;
    } else {
      try {
        value = this.decrypt(record.encryptedValue, record.iv, record.tag);
      } catch (err) {
        this.logger.error(`Decryption failed for key "${key}": ${(err as Error).message}`);
        value = null;
      }
    }

    // Best-effort usage tracking; must never block or fail resolution.
    void this.prisma.credential
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return value;
  }

  /**
   * Retrieve and decrypt a stored credential value (legacy connector path).
   */
  async getDecryptedCredential(orgId: string, key: string): Promise<string | null> {
    return this.resolveSecret(orgId, key);
  }

  /** List credential metadata for an org — never returns secret material. */
  async listCredentials(orgId: string): Promise<
    {
      id: string;
      name: string;
      key: string;
      scope: string;
      provider: string;
      expiresAt: Date | null;
      rotatedAt: Date | null;
      lastUsedAt: Date | null;
      createdAt: Date;
    }[]
  > {
    const rows = await this.prisma.credential.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      key: r.key,
      scope: r.scope,
      provider: r.provider,
      expiresAt: r.expiresAt,
      rotatedAt: r.rotatedAt,
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt,
    }));
  }

  /** Soft-delete a credential by key. */
  async deleteCredential(orgId: string, key: string): Promise<void> {
    await this.prisma.credential.updateMany({
      where: { organizationId: orgId, key, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
