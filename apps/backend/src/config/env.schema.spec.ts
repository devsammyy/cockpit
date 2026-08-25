import { validateEnvironment } from "./env.schema";

describe("validateEnvironment", () => {
  it("coerces numeric environment values and keeps required secrets external", () => {
    const config = validateEnvironment({
      DATABASE_URL: "postgresql://autopilot:password@localhost:5432/autopilot",
      JWT_ACCESS_TOKEN_SECRET: "a-development-secret-with-32-characters",
      PORT: "4100",
      REDIS_PORT: "6380",
    });

    expect(config.PORT).toBe(4100);
    expect(config.REDIS_PORT).toBe(6380);
    expect(config.API_PREFIX).toBe("api/v1");
  });

  it("rejects invalid database URLs", () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: "not-a-url",
        JWT_ACCESS_TOKEN_SECRET: "a-development-secret-with-32-characters",
      }),
    ).toThrow("Invalid environment configuration");
  });
});
