import { z } from "zod";

const clientEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.url().default("http://localhost:4000/api/v1"),
  NEXT_PUBLIC_APP_NAME: z.string().default("Qwen Autopilot"),
});

export const clientEnvironment = clientEnvironmentSchema.parse({
  NEXT_PUBLIC_API_BASE_URL: process.env["NEXT_PUBLIC_API_BASE_URL"],
  NEXT_PUBLIC_APP_NAME: process.env["NEXT_PUBLIC_APP_NAME"],
});
