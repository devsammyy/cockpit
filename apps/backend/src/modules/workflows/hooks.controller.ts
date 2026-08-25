import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { TriggerService } from "./engine/trigger.service";

/**
 * Public inbound webhooks — the entry point for external systems that cannot
 * hold a user JWT (monitoring alerts, inbound-email parsers, CRMs, CI).
 *
 * Authentication is a per-workflow secret issued by
 * POST /workflows/:id/triggers/webhook, passed as the `x-hook-token` header
 * (or `?token=` for systems that cannot set headers). The global rate limiter
 * and request logging still apply; the token is compared timing-safe.
 */
@ApiTags("hooks")
@Controller("hooks")
export class HooksController {
  private readonly logger = new Logger(HooksController.name);

  constructor(private readonly triggers: TriggerService) {}

  @Post("workflows/:workflowId")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Fire a webhook-triggered workflow (public, token-authenticated)" })
  @ApiHeader({ name: "x-hook-token", required: false })
  @ApiResponse({ status: 202, description: "Execution accepted and queued" })
  @ApiResponse({ status: 401, description: "Invalid webhook token" })
  @ApiResponse({ status: 409, description: "Webhook trigger not enabled" })
  async fire(
    @Param("workflowId", ParseUUIDPipe) workflowId: string,
    @Headers("x-hook-token") headerToken: string | undefined,
    @Query("token") queryToken: string | undefined,
    @Body() body: unknown,
  ) {
    // Non-object payloads (plain text, arrays) are wrapped so step templates
    // can always reference {{ input.payload }}.
    const payload: Record<string, unknown> =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : { payload: body ?? null };

    this.logger.log(`Inbound webhook for workflow ${workflowId}`);
    const result = await this.triggers.fireWebhook(workflowId, headerToken ?? queryToken, payload);
    return { data: result, success: true };
  }
}
