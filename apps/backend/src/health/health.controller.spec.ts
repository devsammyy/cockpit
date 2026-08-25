import { ServiceUnavailableException } from "@nestjs/common";

import { HealthController } from "./health.controller";
import type { HealthResponse, HealthService } from "./health.service";

function createHealthResponse(status: "ok" | "error"): HealthResponse {
  return {
    dependencies: { postgres: status, redis: status },
    service: "test-service",
    status,
    timestamp: new Date().toISOString(),
    uptimeSeconds: 10,
    version: "0.0.0-test",
  };
}

describe("HealthController", () => {
  test("live returns ok without touching dependencies", () => {
    // Arrange
    const healthServiceMock = { check: jest.fn() } as unknown as HealthService;
    const controller = new HealthController(healthServiceMock);

    // Act
    const result = controller.live();

    // Assert
    expect(result.status).toBe("ok");
    expect(healthServiceMock.check).not.toHaveBeenCalled();
  });

  test("ready returns health payload when dependencies are reachable", async () => {
    // Arrange
    const healthServiceMock = {
      check: jest.fn().mockResolvedValue(createHealthResponse("ok")),
    } as unknown as HealthService;
    const controller = new HealthController(healthServiceMock);

    // Act
    const result = await controller.ready();

    // Assert
    expect(result.status).toBe("ok");
  });

  test("ready throws 503 when a dependency is down", async () => {
    // Arrange
    const healthServiceMock = {
      check: jest.fn().mockResolvedValue(createHealthResponse("error")),
    } as unknown as HealthService;
    const controller = new HealthController(healthServiceMock);

    // Act & Assert
    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });

  test("startup throws 503 until dependencies become reachable", async () => {
    // Arrange
    const healthServiceMock = {
      check: jest
        .fn()
        .mockResolvedValueOnce(createHealthResponse("error"))
        .mockResolvedValueOnce(createHealthResponse("ok")),
    } as unknown as HealthService;
    const controller = new HealthController(healthServiceMock);

    // Act & Assert
    await expect(controller.startup()).rejects.toThrow(ServiceUnavailableException);
    await expect(controller.startup()).resolves.toMatchObject({ status: "ok" });
  });
});
