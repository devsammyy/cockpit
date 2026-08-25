import { Injectable, Logger } from "@nestjs/common";

import type { ToolExecutionContext } from "./tool-execution-context";

/** Declarative auth spec for a connector call. */
export interface ConnectorAuthConfig {
  /** NONE | BEARER | API_KEY | BASIC */
  type?: string;
  /** Credential key resolved via the mediated context.getSecret(). */
  credentialKey?: string;
  /** Header name for API_KEY auth (default: "Authorization"). */
  headerName?: string;
}

/**
 * Fully declarative connector call. No field here is connector-specific code —
 * a new REST/GraphQL integration is just a different config object, which is
 * why the execution engine never needs per-connector logic.
 */
export interface ConnectorInvokeConfig {
  baseUrl?: string;
  /** Path (or absolute URL), `{{ input.x }}`-interpolated. */
  endpoint: string;
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  /** Request body template for write methods (interpolated). */
  body?: unknown;
  auth?: ConnectorAuthConfig;
  /** When true, POST a `{ query, variables }` GraphQL envelope. */
  graphql?: boolean;
  graphqlQuery?: string;
}

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /\.internal$/i,
  /\.local$/i,
];

/**
 * Executes declarative connector configs over HTTP(S). Provides SSRF egress
 * control (private/loopback targets are blocked), mediated secret injection,
 * and cooperative cancellation via the sandbox's AbortSignal. Timeout,
 * concurrency, and retry are owned by the pipeline, so this stays a thin,
 * side-effecting transport.
 */
@Injectable()
export class ConnectorInvokerService {
  private readonly logger = new Logger(ConnectorInvokerService.name);

  async invoke(
    config: ConnectorInvokeConfig,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const url = this.buildUrl(config, input);
    this.assertPublicUrl(url);

    const method = (config.method ?? (config.graphql ? "POST" : "GET")).toUpperCase();
    const headers = this.buildHeaders(config, input);
    await this.applyAuth(config.auth, headers, context);

    const body = this.buildBody(config, input, method, headers);

    const response = await fetch(url.toString(), {
      method,
      headers,
      body,
      signal: context.signal,
    });

    const text = await response.text();
    const parsed = this.tryParseJson(text);
    if (!response.ok) {
      const detail = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
      throw new Error(
        `Connector request failed (HTTP ${response.status}): ${detail.slice(0, 300)}`,
      );
    }
    return parsed;
  }

  private buildUrl(config: ConnectorInvokeConfig, input: Record<string, unknown>): URL {
    const endpoint = interpolate(config.endpoint, input);
    const base = config.baseUrl ? interpolate(config.baseUrl, input) : undefined;
    const url = base
      ? new URL(endpoint, base.endsWith("/") ? base : `${base}/`)
      : new URL(endpoint);
    for (const [key, template] of Object.entries(config.query ?? {})) {
      url.searchParams.set(key, interpolate(template, input));
    }
    return url;
  }

  private assertPublicUrl(url: URL): void {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Connector URL protocol not allowed: ${url.protocol}`);
    }
    if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
      throw new Error(`Connector target host is not permitted: ${url.hostname}`);
    }
  }

  private buildHeaders(
    config: ConnectorInvokeConfig,
    input: Record<string, unknown>,
  ): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [key, template] of Object.entries(config.headers ?? {})) {
      headers[key] = interpolate(template, input);
    }
    return headers;
  }

  private async applyAuth(
    auth: ConnectorAuthConfig | undefined,
    headers: Record<string, string>,
    context: ToolExecutionContext,
  ): Promise<void> {
    if (!auth?.type || auth.type === "NONE" || !auth.credentialKey) {
      return;
    }
    const secret = await context.getSecret(auth.credentialKey);
    if (!secret) {
      this.logger.warn(`Connector auth credential "${auth.credentialKey}" is not configured`);
      return;
    }
    switch (auth.type) {
      case "BEARER":
        headers["Authorization"] = `Bearer ${secret}`;
        break;
      case "BASIC":
        headers["Authorization"] = `Basic ${Buffer.from(secret).toString("base64")}`;
        break;
      case "API_KEY":
        headers[auth.headerName ?? "Authorization"] = secret;
        break;
      default:
        break;
    }
  }

  private buildBody(
    config: ConnectorInvokeConfig,
    input: Record<string, unknown>,
    method: string,
    headers: Record<string, string>,
  ): string | undefined {
    if (method === "GET" || method === "HEAD") {
      return undefined;
    }
    let payload: unknown;
    if (config.graphql) {
      payload = { query: config.graphqlQuery ?? "", variables: input };
    } else if (config.body !== undefined) {
      payload = interpolateDeep(config.body, input);
    } else {
      payload = input;
    }
    if (!hasHeader(headers, "content-type")) {
      headers["Content-Type"] = "application/json";
    }
    return JSON.stringify(payload);
  }

  private tryParseJson(text: string): unknown {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

/** Replace `{{ path }}` tokens with values resolved from `vars` (dot paths supported). */
export function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.[\]]+)\s*\}\}/g, (_match, path: string) => {
    const value = resolvePath(vars, path);
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  });
}

/** Recursively interpolate every string in a template object/array. */
export function interpolateDeep(value: unknown, vars: Record<string, unknown>): unknown {
  if (typeof value === "string") return interpolate(value, vars);
  if (Array.isArray(value)) return value.map((item) => interpolateDeep(item, vars));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = interpolateDeep(val, vars);
    }
    return out;
  }
  return value;
}

function resolvePath(source: Record<string, unknown>, path: string): unknown {
  const parts = path
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let current: unknown = source;
  for (const part of parts) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}
