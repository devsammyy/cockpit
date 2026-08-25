import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";

import { Tool, ToolMetadata } from "./tool.interface";
import type { ToolExecutionContext } from "./framework/tool-execution-context";

export interface ConnectorMetadata extends ToolMetadata {
  connectorType: string;
}

/**
 * Base class for connector-style tools. Connectors resolve their secrets
 * through the mediated {@link ToolExecutionContext.getSecret} — never by
 * reaching into the credential store directly — so secret access is auditable
 * and sandbox-governed. {@link secret} guards the agent-runtime path, which may
 * invoke a tool without a full execution context.
 */
export abstract class Connector extends Tool {
  abstract override readonly metadata: ConnectorMetadata;

  protected async secret(
    context: ToolExecutionContext | undefined,
    key: string,
  ): Promise<string | null> {
    if (context && typeof context.getSecret === "function") {
      return context.getSecret(key);
    }
    return null;
  }
}

@Injectable()
export class SlackConnector extends Connector {
  private readonly logger = new Logger(SlackConnector.name);

  readonly metadata: ConnectorMetadata = {
    name: "slack_send_message",
    description: "Post a message to a specific Slack channel",
    connectorType: "slack",
    category: "communication",
    riskLevel: "MEDIUM",
    inputSchema: z.object({
      channel: z.string(),
      text: z.string(),
    }),
    outputSchema: z.object({
      status: z.string(),
      ts: z.string(),
    }),
    timeoutMs: 15000,
    retryAttempts: 2,
  };

  async execute(
    input: { channel: string; text: string },
    context?: ToolExecutionContext,
  ): Promise<{ status: string; ts: string }> {
    const token = await this.secret(context, "SLACK_API_TOKEN");
    if (!token) {
      throw new Error(
        'Slack credential missing — store a credential with key "SLACK_API_TOKEN" on the Tools page.',
      );
    }

    this.logger.log(`[Slack] posting to ${input.channel}`);
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      body: JSON.stringify({ channel: input.channel, text: input.text }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      method: "POST",
      signal: AbortSignal.timeout(this.metadata.timeoutMs ?? 15000),
    });

    const body = (await response.json()) as { ok?: boolean; error?: string; ts?: string };
    if (!response.ok || body.ok !== true) {
      throw new Error(`Slack API error: ${body.error ?? `HTTP ${String(response.status)}`}`);
    }
    return { status: "ok", ts: body.ts ?? "" };
  }
}

@Injectable()
export class EmailConnector extends Connector {
  private readonly logger = new Logger(EmailConnector.name);

  readonly metadata: ConnectorMetadata = {
    name: "email_send",
    description: "Send an email (interview invitations, notifications, reports) via Resend",
    connectorType: "email",
    category: "communication",
    riskLevel: "MEDIUM",
    inputSchema: z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
      from: z.string().optional(),
    }),
    outputSchema: z.object({
      id: z.string(),
      status: z.string(),
    }),
    timeoutMs: 15000,
    retryAttempts: 2,
  };

  async execute(
    input: { to: string; subject: string; body: string; from?: string },
    context?: ToolExecutionContext,
  ): Promise<{ id: string; status: string }> {
    const token = await this.secret(context, "RESEND_API_KEY");
    if (!token) {
      throw new Error(
        'Email credential missing — store a credential with key "RESEND_API_KEY" on the Tools page.',
      );
    }

    this.logger.log(`[Email] sending "${input.subject}" to ${input.to}`);
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        // Resend's sandbox sender works out of the box; a verified domain
        // sender can be supplied per call via `from`.
        from: input.from ?? "Qwen Autopilot <onboarding@resend.dev>",
        subject: input.subject,
        text: input.body,
        to: [input.to],
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(this.metadata.timeoutMs ?? 15000),
    });

    const body = (await response.json()) as { id?: string; message?: string };
    if (!response.ok) {
      throw new Error(
        `Email API error ${String(response.status)}: ${body.message ?? "unknown error"}`,
      );
    }
    return { id: body.id ?? "", status: "sent" };
  }
}

@Injectable()
export class GitHubConnector extends Connector {
  private readonly logger = new Logger(GitHubConnector.name);

  readonly metadata: ConnectorMetadata = {
    name: "github_create_issue",
    description: "Create an issue on a GitHub repository",
    connectorType: "github",
    category: "vcs",
    riskLevel: "MEDIUM",
    inputSchema: z.object({
      owner: z.string(),
      repo: z.string(),
      title: z.string(),
      body: z.string(),
    }),
    outputSchema: z.object({
      issueUrl: z.string(),
      number: z.number(),
    }),
    timeoutMs: 20000,
  };

  async execute(
    input: { owner: string; repo: string; title: string; body: string },
    context?: ToolExecutionContext,
  ): Promise<{ issueUrl: string; number: number }> {
    const token = await this.secret(context, "GITHUB_PERSONAL_ACCESS_TOKEN");
    if (!token) {
      throw new Error(
        'GitHub credential missing — store a credential with key "GITHUB_PERSONAL_ACCESS_TOKEN" on the Tools page.',
      );
    }

    this.logger.log(`[GitHub] creating issue in ${input.owner}/${input.repo}`);
    const url = `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues`;
    const response = await fetch(url, {
      body: JSON.stringify({ body: input.body, title: input.title }),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "qwen-autopilot",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      method: "POST",
      signal: AbortSignal.timeout(this.metadata.timeoutMs ?? 20000),
    });

    if (response.status !== 201) {
      const detail = await response.text();
      throw new Error(`GitHub API error ${String(response.status)}: ${detail.slice(0, 200)}`);
    }
    const issue = (await response.json()) as { html_url?: string; number?: number };
    return { issueUrl: issue.html_url ?? "", number: issue.number ?? 0 };
  }
}
