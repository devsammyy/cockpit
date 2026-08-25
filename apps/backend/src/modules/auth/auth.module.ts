import { Module, Global } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { PermissionGuard } from "./guards/permission.guard";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import type { EnvironmentVariables } from "../../config/env.schema";

@Global()
@Module({
  imports: [
    DatabaseModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        secret: config.get<string>("JWT_ACCESS_TOKEN_SECRET", { infer: true }),
        signOptions: {
          expiresIn: config.get<string>("JWT_ACCESS_TOKEN_TTL", { infer: true }) as any,
        },
      }),
    }),
  ],
  providers: [AuthService, JwtAuthGuard, PermissionGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, PermissionGuard, JwtModule],
})
export class AuthModule {}
