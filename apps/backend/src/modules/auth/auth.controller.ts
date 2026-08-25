import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Register a new SaaS user and workspace" })
  @ApiResponse({ status: 201, description: "User successfully registered" })
  async register(@Body() dto: RegisterDto) {
    this.logger.log(`Received registration request for: ${dto.email}`);
    const data = await this.authService.register(dto);
    return { success: true, data };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Authenticate email/password and retrieve access JWT" })
  @ApiResponse({ status: 200, description: "Successfully logged in" })
  async login(@Body() dto: LoginDto) {
    this.logger.log(`Received login request for: ${dto.email}`);
    const data = await this.authService.login(dto);
    return { success: true, data };
  }
}
