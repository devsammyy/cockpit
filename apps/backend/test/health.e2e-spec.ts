import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { TestingModule } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";

describe("Health endpoint", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env["DATABASE_URL"] ??=
      "postgresql://autopilot:change-me-local-only@localhost:5432/autopilot";
    process.env["JWT_ACCESS_TOKEN_SECRET"] ??= "a-development-secret-with-32-characters";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns health status", async () => {
    const server = app.getHttpServer() as Server;

    await request(server)
      .get("/health")
      .expect((response) => {
        expect([200, 503]).toContain(response.status);
        expect(response.body).toBeDefined();
      });
  });
});
