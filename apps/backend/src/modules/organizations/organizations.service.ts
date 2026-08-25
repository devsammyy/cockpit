import { Injectable, ForbiddenException, NotFoundException, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { EnvironmentVariables } from "../../config/env.schema";

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * List all members inside an organization.
   */
  async listMembers(orgId: string): Promise<any[]> {
    return this.prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
            lastLoginAt: true,
          },
        },
        role: true,
      },
    });
  }

  /**
   * Simulates inviting a member to the organization by directly adding them if user exists,
   * or creating a pending member placeholder.
   */
  async inviteMember(orgId: string, email: string, roleName: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException(`User with email ${email} not registered on the platform`);
    }

    const role = await this.prisma.role.findFirst({
      where: { organizationId: orgId, name: roleName },
    });

    if (!role) {
      throw new NotFoundException(`Role ${roleName} not found in this organization`);
    }

    const existingMembership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
    });

    if (existingMembership) {
      throw new ForbiddenException("User is already a member of this organization");
    }

    return this.prisma.organizationMember.create({
      data: {
        id: crypto.randomUUID(),
        organizationId: orgId,
        userId: user.id,
        roleId: role.id,
        status: "ACTIVE",
      },
      include: {
        user: true,
        role: true,
      },
    });
  }

  /**
   * Swaps user's active tenant and issues a new access token if membership is verified.
   */
  async switchOrganization(userId: string, orgId: string): Promise<{ accessToken: string }> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: userId,
        },
      },
      include: {
        user: true,
        role: true,
      },
    });

    if (membership?.status !== "ACTIVE") {
      throw new ForbiddenException("You do not have access to this organization");
    }

    const payload = {
      sub: membership.userId,
      email: membership.user.email,
      orgId: membership.organizationId,
      role: membership.role.name,
      permissions: membership.role.permissions,
    };

    const secret = this.configService.get<string>("JWT_ACCESS_TOKEN_SECRET", { infer: true });
    const ttl = this.configService.get<string>("JWT_ACCESS_TOKEN_TTL", { infer: true });

    const accessToken = this.jwtService.sign(payload, {
      secret,
      expiresIn: ttl as any,
    });

    this.logger.log(`User ${userId} switched active organization context to ${orgId}`);
    return { accessToken };
  }

  /**
   * Updates settings configuration for the organization.
   */
  async updateSettings(orgId: string, settings: any): Promise<any> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException("Organization not found");
    }

    const currentSettings = org.settings as Record<string, any>;
    const updatedSettings = { ...currentSettings, ...settings };

    return this.prisma.organization.update({
      where: { id: orgId },
      data: {
        settings: updatedSettings,
      },
    });
  }
}
