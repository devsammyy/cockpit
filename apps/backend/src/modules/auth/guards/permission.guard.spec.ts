import { Reflector } from "@nestjs/core";
import { PermissionGuard } from "./permission.guard";
import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";

describe("PermissionGuard", () => {
  let guard: PermissionGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionGuard(reflector);
  });

  const createMockContext = (user: any, params: Record<string, any> = {}): ExecutionContext => {
    const mockRequest = {
      user,
      params,
      query: {},
      body: {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as any;
  };

  it("passes when no permissions are specified", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(null);
    const ctx = createMockContext({ permissions: [] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("passes when user has all required permissions", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["agent:create", "agent:read"]);
    const ctx = createMockContext({ permissions: ["agent:create", "agent:read", "agent:delete"] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("throws ForbiddenException when user lacks permissions", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["agent:create"]);
    const ctx = createMockContext({ permissions: ["agent:read"] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("throws ForbiddenException on cross-tenant orgId path parameter check", () => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["agent:read"]);
    const ctx = createMockContext(
      { orgId: "org_1", permissions: ["agent:read"] },
      { orgId: "org_2" }, // parameter mismatch!
    );
    expect(() => guard.canActivate(ctx)).toThrow("tenant isolation mismatch");
  });

  it("passes on a GET request where body is undefined (no TypeError)", () => {
    // Regression: Fastify GET requests have no body, so `request.body` is
    // undefined. Reading `request.body["orgId"]` used to throw a TypeError and
    // surface as a 500 on every @RequirePermissions GET route.
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(["organization:read"]);
    const mockRequest = {
      user: { orgId: "org_1", permissions: ["organization:read"] },
      params: undefined,
      query: undefined,
      body: undefined,
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as any;
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
