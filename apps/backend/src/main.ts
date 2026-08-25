// Tracing must be imported before any instrumented module (http, fastify, pg, ioredis).
import "./observability/tracing";

import compression from "@fastify/compress";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ClassSerializerInterceptor, ValidationPipe, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory, Reflector } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor";
import type { EnvironmentVariables } from "./config/env.schema";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: true }),
    { bufferLogs: true },
  );

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const logger = app.get(Logger);
  const rateLimitMax = config.get("RATE_LIMIT_MAX", { infer: true });
  const rateLimitWindow = config.get("RATE_LIMIT_WINDOW", { infer: true });

  app.useLogger(logger);
  app.setGlobalPrefix(config.get("API_PREFIX", { infer: true }), { exclude: ["metrics"] });
  app.enableVersioning({ type: VersioningType.URI });
  app.enableShutdownHooks();

  await app.register(helmet, { global: true });
  await app.register(compression, { global: true });
  await app.register(cors, {
    credentials: true,
    origin: config
      .get("CORS_ORIGINS", { infer: true })
      .split(",")
      .map((origin) => origin.trim()),
  });
  await app.register(rateLimit, {
    global: true,
    max: rateLimitMax,
    timeWindow: rateLimitWindow,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new RequestIdInterceptor(),
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Qwen Autopilot API")
    .setDescription("Enterprise AI Autopilot Agent platform API foundation.")
    .setVersion(config.get("APP_VERSION", { infer: true }))
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document, {
    jsonDocumentUrl: "docs/openapi.json",
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(config.get("PORT", { infer: true }), config.get("HOST", { infer: true }));
}

void bootstrap();
