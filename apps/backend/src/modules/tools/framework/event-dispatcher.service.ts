import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter } from "node:events";

/**
 * The typed event contract for the Tool Execution Framework. Payloads are
 * plain data (no secrets) so subscribers — audit, notifications, metrics,
 * future webhooks — stay decoupled from the executor.
 */
export interface ToolFrameworkEventMap {
  "tool.execution.started": {
    executionId: string;
    organizationId: string;
    toolName: string;
    userId: string;
    source: string;
  };
  "tool.execution.completed": {
    executionId: string;
    organizationId: string;
    toolName: string;
    userId: string;
    latencyMs: number;
    attempts: number;
  };
  "tool.execution.failed": {
    executionId: string;
    organizationId: string;
    toolName: string;
    userId: string;
    error: string;
    attempts: number;
  };
  "tool.execution.rejected": {
    executionId: string;
    organizationId: string;
    toolName: string;
    userId: string;
    code: string;
    reason: string;
  };
  "tool.approval.requested": {
    executionId: string;
    organizationId: string;
    toolName: string;
    userId: string;
    approvalId: string;
  };
  "tool.approval.resumed": {
    executionId: string;
    organizationId: string;
    toolName: string;
  };
  "tool.policy.violation": {
    organizationId: string;
    toolName: string;
    userId: string;
    code: string;
    reason: string;
  };
  "connector.health.changed": {
    organizationId: string | null;
    connectorId: string;
    status: string;
  };
  "mcp.health.changed": {
    organizationId: string;
    serverId: string;
    status: string;
  };
}

export type ToolFrameworkEvent = keyof ToolFrameworkEventMap;

/**
 * Provider-independent in-process event bus built on Node's core
 * {@link EventEmitter} — no third-party dependency. Emission is fire-and-forget
 * and fully isolated: a throwing or slow subscriber can never break the emitter
 * or the tool run that published the event.
 */
@Injectable()
export class EventDispatcherService {
  private readonly logger = new Logger(EventDispatcherService.name);
  private readonly emitter = new EventEmitter();

  constructor() {
    // The audit, metrics, and notification subsystems all subscribe; raise the
    // default cap so legitimate fan-out never logs a false "leak" warning.
    this.emitter.setMaxListeners(100);
  }

  /** Publish an event. Never throws. */
  emit<E extends ToolFrameworkEvent>(event: E, payload: ToolFrameworkEventMap[E]): void {
    try {
      this.emitter.emit(event, payload);
    } catch (err) {
      this.logger.warn(`Event dispatch for "${event}" threw: ${(err as Error).message}`);
    }
  }

  /** Subscribe to an event. Returns an unsubscribe function. Handler errors are swallowed. */
  on<E extends ToolFrameworkEvent>(
    event: E,
    handler: (payload: ToolFrameworkEventMap[E]) => void,
  ): () => void {
    const wrapped = (payload: ToolFrameworkEventMap[E]): void => {
      try {
        handler(payload);
      } catch (err) {
        this.logger.warn(`Subscriber for "${event}" threw: ${(err as Error).message}`);
      }
    };
    this.emitter.on(event, wrapped as (...args: unknown[]) => void);
    return () => this.emitter.off(event, wrapped as (...args: unknown[]) => void);
  }
}
