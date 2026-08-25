/**
 * OpenTelemetry tracing bootstrap.
 *
 * Imported first in main.ts so auto-instrumentation can patch http, fastify,
 * ioredis, and pg before the application loads them. Reads process.env
 * directly because it runs before Nest's ConfigModule validation.
 *
 * Enabled with OTEL_ENABLED=true; traces export via OTLP/HTTP to
 * OTEL_EXPORTER_OTLP_ENDPOINT.
 *
 * The OpenTelemetry packages are loaded with a runtime require ONLY when
 * tracing is enabled, so the app boots cleanly even in an environment where
 * those (optional) packages are not installed. A static import here would make
 * the whole process fail to start if the packages were absent — an
 * unacceptable coupling for an opt-in observability feature.
 */

interface OtelSdk {
  start(): void;
  shutdown(): Promise<void>;
}

let sdk: OtelSdk | null = null;

function startTracing(): void {
  if (process.env["OTEL_ENABLED"] !== "true") {
    return;
  }

  try {
    /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
    const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
    const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
    const { resourceFromAttributes } = require("@opentelemetry/resources");
    const { NodeSDK } = require("@opentelemetry/sdk-node");
    const {
      ATTR_SERVICE_NAME,
      ATTR_SERVICE_VERSION,
    } = require("@opentelemetry/semantic-conventions");

    const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];

    const instance: OtelSdk = new NodeSDK({
      instrumentations: [
        getNodeAutoInstrumentations({
          // fs instrumentation is prohibitively noisy for a web workload
          "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
      ],
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: process.env["OTEL_SERVICE_NAME"] ?? "qwen-autopilot-api",
        [ATTR_SERVICE_VERSION]: process.env["APP_VERSION"] ?? "0.1.0",
      }),
      traceExporter: new OTLPTraceExporter(endpoint ? { url: endpoint } : {}),
    });
    /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */

    instance.start();
    sdk = instance;
  } catch (error) {
    // Tracing is best-effort — never let it block application startup.
    console.warn(
      `[tracing] OpenTelemetry enabled but could not start: ${(error as Error).message}`,
    );
  }
}

export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}

process.once("SIGTERM", () => {
  void shutdownTracing();
});

startTracing();
