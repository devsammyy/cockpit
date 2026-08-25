import { Controller, Get, Post, Patch, Body, UseGuards, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";
import { OrganizationsService } from "./organizations.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard } from "../auth/guards/permission.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

class InviteMemberDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  roleName!: string;
}

class SwitchOrgDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  orgId!: string;
}

@ApiTags("organizations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("organizations")
export class OrganizationsController {
  private readonly logger = new Logger(OrganizationsController.name);

  constructor(private readonly orgService: OrganizationsService) {}

  @Get("members")
  @RequirePermissions("organization:read")
  @ApiOperation({ summary: "List members of the current active organization" })
  async listMembers(@CurrentUser("orgId") orgId: string) {
    this.logger.log(`Fetching members for organization: ${orgId}`);
    const data = await this.orgService.listMembers(orgId);
    return { success: true, data };
  }

  @Post("invite")
  @RequirePermissions("organization:manage-members")
  @ApiOperation({ summary: "Invite a new member to the current active organization" })
  async invite(@CurrentUser("orgId") orgId: string, @Body() dto: InviteMemberDto) {
    this.logger.log(`Inviting user ${dto.email} to organization: ${orgId}`);
    const data = await this.orgService.inviteMember(orgId, dto.email, dto.roleName);
    return { success: true, data };
  }

  @Post("switch")
  @ApiOperation({ summary: "Switch the active organization context and receive a new access JWT" })
  async switch(@CurrentUser("sub") userId: string, @Body() dto: SwitchOrgDto) {
    this.logger.log(`User ${userId} switching organization context to ${dto.orgId}`);
    const data = await this.orgService.switchOrganization(userId, dto.orgId);
    return { success: true, data };
  }

  @Patch("settings")
  @RequirePermissions("organization:update")
  @ApiOperation({ summary: "Update active organization settings" })
  async updateSettings(@CurrentUser("orgId") orgId: string, @Body() settings: any) {
    this.logger.log(`Updating settings for organization: ${orgId}`);
    const data = await this.orgService.updateSettings(orgId, settings);
    return { success: true, data };
  }
}
