import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import type { EnvironmentVariables } from "../../../config/env.schema";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: any }>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or malformed authorization header");
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      throw new UnauthorizedException("Authorization token is missing");
    }

    try {
      const secret = this.configService.get<string>("JWT_ACCESS_TOKEN_SECRET", { infer: true });
      const payload = await this.jwtService.verifyAsync(token, { secret });

      // Inject decoded payload properties into request context
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired authorization token");
    }
  }
}
