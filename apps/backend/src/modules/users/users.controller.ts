import { Controller, Get, Patch, Body, UseGuards, Logger } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiPropertyOptional,
} from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @ApiOperation({ summary: "Retrieve authenticated user's profile" })
  @ApiResponse({ status: 200, description: "Successfully retrieved profile" })
  async getProfile(@CurrentUser("sub") userId: string) {
    this.logger.log(`Fetching profile for user: ${userId}`);
    const data = await this.usersService.getProfile(userId);
    return { success: true, data };
  }

  @Patch("me")
  @ApiOperation({ summary: "Update profile displayName or avatar" })
  @ApiResponse({ status: 200, description: "Profile updated successfully" })
  async updateProfile(@CurrentUser("sub") userId: string, @Body() dto: UpdateProfileDto) {
    this.logger.log(`Updating profile for user: ${userId}`);
    const data = await this.usersService.updateProfile(userId, dto);
    return { success: true, data };
  }
}
