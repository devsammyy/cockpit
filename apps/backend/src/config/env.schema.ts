import { z } from "zod";

const environmentSchema = z.object({
  API_PREFIX: z.string().default("api/v1"),
  APP_NAME: z.string().default("qwen-autopilot-api"),
  APP_VERSION: z.string().default("0.1.0"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.url(),
  HOST: z.string().default("0.0.0.0"),
  JWT_ACCESS_TOKEN_SECRET: z.string().min(32),
  JWT_ACCESS_TOKEN_TTL: z.string().default("15m"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  METRICS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  OTEL_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().default(""),
  OTEL_SERVICE_NAME: z.string().default("qwen-autopilot-api"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PASSWORD: z.string().optional().default(""),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  QWEN_API_KEY: z.string().default("mock-key"),
  QWEN_API_URL: z.string().default("https://dashscope.aliyuncs.com/compatible-mode/v1"),
});

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const parsedConfig = environmentSchema.safeParse(config);

  if (!parsedConfig.success) {
    throw new Error(`Invalid environment configuration: ${parsedConfig.error.message}`);
  }

  return parsedConfig.data;
}
