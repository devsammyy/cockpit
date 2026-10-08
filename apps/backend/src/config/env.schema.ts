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

  // ── Qwen / DashScope (Legacy / Default) ──
  QWEN_API_KEY: z.string().default("mock-key"),
  QWEN_API_URL: z.string().default("https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),

  // ── OpenAI ──
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_API_URL: z.string().optional().default("https://api.openai.com/v1"),
  OPENAI_ORG_ID: z.string().optional(),

  // ── Anthropic (via LiteLLM or proxy) ──
  ANTHROPIC_API_KEY: z.string().optional(),

  // ── LiteLLM ──
  LITELLM_BASE_URL: z.string().optional(),
  LITELLM_API_URL: z.string().optional(),
  LITELLM_API_KEY: z.string().optional(),
  LITELLM_VIRTUAL_KEY: z.string().optional(),
  LITELLM_TEAM_ID: z.string().optional(),
  LITELLM_FALLBACK_MODELS: z.string().optional(),

  // ── NVIDIA NIM ──
  NIM_BASE_URL: z.string().optional(),
  NIM_API_KEY: z.string().optional(),
  NGC_API_KEY: z.string().optional(),
  NIM_MODEL_REPOSITORY: z.string().optional(),
  NIM_ENABLE_PROFILING: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  // ── Custom Providers (OpenAI-compatible) ──
  // Configure via: CUSTOM_PROVIDER_<NAME>_URL, CUSTOM_PROVIDER_<NAME>_KEY, etc.
  // Example: CUSTOM_PROVIDER_MYMODEL_URL=http://localhost:8000/v1
  //          CUSTOM_PROVIDER_MYMODEL_KEY=my-key
  //          CUSTOM_PROVIDER_MYMODEL_DEFAULT_MODEL=my-model
  //          CUSTOM_PROVIDER_MYMODEL_PRIORITY=50
});

export type EnvironmentVariables = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const parsedConfig = environmentSchema.safeParse(config);

  if (!parsedConfig.success) {
    throw new Error(`Invalid environment configuration: ${parsedConfig.error.message}`);
  }

  return parsedConfig.data;
}