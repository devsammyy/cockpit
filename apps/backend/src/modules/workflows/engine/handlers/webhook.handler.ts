import { BadRequestException, Injectable, Logger } from "@nestjs/common";

import { StepExecutionContext, StepHandler, StepResult } from "../step-handler.interface";
import { compileTemplate, resolveArgs } from "../template.util";
import { WorkflowStep } from "../workflow-definition.schema";

const WEBHOOK_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_CHARS = 4_000;

/** Basic SSRF guard: block loopback/link-local/private targets. */
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /\.internal$/i,
];

/**
 * WEBHOOK — calls an external HTTP endpoint. Config:
 *   url (required, http/https, private ranges blocked)
 *   method (GET | POST | PUT, default POST)
 *   body (object, {{ vars }} interpolated), headers (string map)
 */
@Injectable()
export class WebhookHandler implements StepHandler {
  readonly type = "WEBHOOK";
  private readonly logger = new Logger(WebhookHandler.name);

  async execute(step: WorkflowStep, context: StepExecutionContext): Promise<StepResult> {
    const rawUrl = compileTemplate(String(step.config["url"] ?? ""), context.variables);
    const url = this.validateUrl(rawUrl);
    const method = ["GET", "POST", "PUT"].includes(String(step.config["method"]))
      ? String(step.config["method"])
      : "POST";

    const body =
      method === "GET"
        ? undefined
        : JSON.stringify(
            resolveArgs(
              (step.config["body"] as Record<string, any> | undefined) ?? {},
              context.variables,
            ),
          );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((step.config["headers"] as Record<string, string> | undefined) ?? {}),
    };

    this.logger.log(`Webhook ${method} ${url.hostname} for execution ${context.executionId}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, WEBHOOK_TIMEOUT_MS);

    try {
      const response = await fetch(url, { body, headers, method, signal: controller.signal });
      const text = (await response.text()).slice(0, MAX_RESPONSE_CHARS);

      if (!response.ok) {
        throw new Error(`Webhook responded ${String(response.status)}: ${text}`);
      }

      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep raw text
      }

      return { output: { body: parsed, status: response.status } };
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateUrl(raw: string): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException(`Webhook url is not a valid URL: "${raw}"`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new BadRequestException("Webhook url must use http(s)");
    }
    if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
      throw new BadRequestException("Webhook url targets a blocked host range");
    }
    return url;
  }
}
