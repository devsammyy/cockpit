import { Inject, Injectable, Logger } from "@nestjs/common";

import { STEP_HANDLERS, StepHandler } from "./step-handler.interface";

/**
 * Resolves a WorkflowStep.type to its handler. Handlers are collected via the
 * STEP_HANDLERS multi-provider, so the orchestrator has no switch over node
 * types — new node types are added by binding a handler in the module.
 */
@Injectable()
export class StepHandlerRegistry {
  private readonly logger = new Logger(StepHandlerRegistry.name);
  private readonly handlers = new Map<string, StepHandler>();

  constructor(@Inject(STEP_HANDLERS) handlers: StepHandler[]) {
    for (const handler of handlers) {
      this.handlers.set(handler.type, handler);
    }
    this.logger.log(`Registered step handlers: ${[...this.handlers.keys()].join(", ")}`);
  }

  get(type: string): StepHandler | undefined {
    return this.handlers.get(type);
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  supportedTypes(): string[] {
    return [...this.handlers.keys()];
  }
}
