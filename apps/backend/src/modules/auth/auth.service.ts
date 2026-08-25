import { Injectable, UnauthorizedException, ConflictException, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { hashPassword, verifyPassword } from "../../common/utils/crypto";
import { EnvironmentVariables } from "../../config/env.schema";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * Registers a new user and automatically spins up a default organization and roles.
   */
  async register(dto: { email: string; passwordHash: string; displayName: string }): Promise<any> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException("User with this email already exists");
    }

    const hashedPassword = await hashPassword(dto.passwordHash);
    const userId = crypto.randomUUID();
    const orgId = crypto.randomUUID();
    const roleId = crypto.randomUUID();
    const memberId = crypto.randomUUID();

    // Create user, default organization, default system role, and membership in a single transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: userId,
          email: dto.email.toLowerCase(),
          passwordHash: hashedPassword,
          displayName: dto.displayName,
          status: "ACTIVE",
        },
      });

      const org = await tx.organization.create({
        data: {
          id: orgId,
          name: `${dto.displayName}'s Workspace`,
          slug: `${dto.displayName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`,
          settings: {
            defaultAIProvider: "QWEN",
            executionTimeoutMs: 60000,
            maxConcurrentExecutions: 5,
            webhookSecret: crypto.randomBytes(32).toString("hex"),
          },
        },
      });

      // Default Owner Role with full permissions
      await tx.role.create({
        data: {
          id: roleId,
          organizationId: orgId,
          name: "Owner",
          description: "Full control over organization resources",
          isSystem: true,
          permissions: [
            "agent:create",
            "agent:read",
            "agent:update",
            "agent:delete",
            "workflow:create",
            "workflow:read",
            "workflow:update",
            "workflow:delete",
            "workflow:execute",
            "execution:read",
            "execution:cancel",
            "organization:read",
            "organization:update",
            "organization:manage-members",
          ],
        },
      });

      await tx.organizationMember.create({
        data: {
          id: memberId,
          organizationId: orgId,
          userId: userId,
          roleId: roleId,
          status: "ACTIVE",
        },
      });

      return { user, org };
    });

    this.logger.log(`Registered user ${userId} and created organization ${orgId}`);
    return {
      id: result.user.id,
      email: result.user.email,
      displayName: result.user.displayName,
      defaultOrgId: result.org.id,
    };
  }

  /**
   * Validates user credentials and signs JWT tokens.
   */
  async login(dto: {
    email: string;
    passwordHash: string;
  }): Promise<{ accessToken: string; user: any }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        memberships: {
          include: {
            organization: true,
            role: true,
          },
        },
      },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const isValid = await verifyPassword(dto.passwordHash, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    // Default to the first active membership organization
    const activeMembership = user.memberships[0];
    if (!activeMembership) {
      throw new UnauthorizedException("User has no active organization membership");
    }

    const payload = {
      sub: user.id,
      email: user.email,
      orgId: activeMembership.organizationId,
      role: activeMembership.role.name,
      permissions: activeMembership.role.permissions,
    };

    const secret = this.configService.get<string>("JWT_ACCESS_TOKEN_SECRET", { infer: true });
    const ttl = this.configService.get<string>("JWT_ACCESS_TOKEN_TTL", { infer: true });

    const accessToken = this.jwtService.sign(payload, {
      secret,
      expiresIn: ttl as any,
    });

    // Record last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        activeOrgId: activeMembership.organizationId,
        role: activeMembership.role.name,
      },
    };
  }
}
