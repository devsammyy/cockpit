import type { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";

import type { EnvironmentVariables } from "../config/env.schema";
import type { PrismaService } from "../infrastructure/database/prisma.service";
import { HealthService } from "./health.service";

function createConfigMock(): ConfigService<EnvironmentVariables, true> {
  const values: Record<string, unknown> = {
    APP_NAME: "test-service",
    APP_VERSION: "0.0.0-test",
  };

  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

function createPrismaMock(shouldFail = false): PrismaService {
  return {
    $queryRaw: shouldFail
      ? jest.fn().mockRejectedValue(new Error("connection refused"))
      : jest.fn().mockResolvedValue([{ "?column?": 1 }]),
  } as unknown as PrismaService;
}

describe("HealthService", () => {
  test("reports ok when postgres and redis are reachable", async () => {
    // Arrange
    const redisMock = {
      connect: jest.fn(),
      ping: jest.fn().mockResolvedValue("PONG"),
      status: "ready",
    } as unknown as Redis;
    const service = new HealthService(createConfigMock(), createPrismaMock(), redisMock);

    // Act
    const result = await service.check();

    // Assert
    expect(result.status).toBe("ok");
    expect(result.dependencies).toEqual({ postgres: "ok", redis: "ok" });
  });

  test("does not call connect on an already-connected redis client", async () => {
    // Arrange: connect() rejects when called on a live connection, which used
    // to flip health to error from the second check onwards.
    const redisMock = {
      connect: jest.fn().mockRejectedValue(new Error("Redis is already connecting/connected")),
      ping: jest.fn().mockResolvedValue("PONG"),
      status: "ready",
    } as unknown as Redis;
    const service = new HealthService(createConfigMock(), createPrismaMock(), redisMock);

    // Act
    const first = await service.check();
    const second = await service.check();

    // Assert
    expect(redisMock.connect).not.toHaveBeenCalled();
    expect(first.dependencies.redis).toBe("ok");
    expect(second.dependencies.redis).toBe("ok");
  });

  test("connects lazily when the redis socket has not been opened yet", async () => {
    // Arrange
    const redisMock = {
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue("PONG"),
      status: "wait",
    } as unknown as Redis;
    const service = new HealthService(createConfigMock(), createPrismaMock(), redisMock);

    // Act
    const result = await service.check();

    // Assert
    expect(redisMock.connect).toHaveBeenCalledTimes(1);
    expect(result.dependencies.redis).toBe("ok");
  });

  test("reports error status when postgres is unreachable", async () => {
    // Arrange
    const redisMock = {
      connect: jest.fn(),
      ping: jest.fn().mockResolvedValue("PONG"),
      status: "ready",
    } as unknown as Redis;
    const service = new HealthService(createConfigMock(), createPrismaMock(true), redisMock);

    // Act
    const result = await service.check();

    // Assert
    expect(result.status).toBe("error");
    expect(result.dependencies.postgres).toBe("error");
  });
});
