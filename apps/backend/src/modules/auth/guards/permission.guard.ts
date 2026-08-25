import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.permissions || !Array.isArray(user.permissions)) {
      throw new ForbiddenException("Access denied: missing user permissions context");
    }

    // Check if user has all required permissions
    const hasAll = requiredPermissions.every((perm) => user.permissions.includes(perm));
    if (!hasAll) {
      throw new ForbiddenException("Access denied: insufficient permissions");
    }

    // Tenant Isolation Check
    // If the request carries an orgId (params/query/body), ensure it matches the
    // user's active org. GET requests have no body under Fastify, so every access
    // must be optional — reading a key off an undefined body would throw a 500.
    const reqOrgId =
      request.params?.["orgId"] ?? request.query?.["orgId"] ?? request.body?.["orgId"];
    if (reqOrgId && reqOrgId !== user.orgId) {
      throw new ForbiddenException("Access denied: tenant isolation mismatch");
    }

    return true;
  }
}
