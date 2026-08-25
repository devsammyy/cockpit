import { Injectable, Logger } from "@nestjs/common";
import { TokenUsage } from "@qwen-autopilot/shared-types";

@Injectable()
export class CostTrackerService {
  private readonly logger = new Logger(CostTrackerService.name);
  private readonly executionCosts = new Map<string, number>();

  // Cost per 1,000,000 tokens in micro-dollars ($0.000001)
  private readonly modelRates: Record<string, { input: number; output: number }> = {
    "qwen-turbo": { input: 300, output: 600 },
    "qwen-plus": { input: 1000, output: 2000 },
    "qwen-max": { input: 6000, output: 12000 },
    default: { input: 1500, output: 2000 },
  };

  /**
   * Estimate micro-dollars cost for token usage.
   */
  calculateCost(model: string, usage: TokenUsage): number {
    const rate = this.modelRates[model] ??
      this.modelRates["default"] ?? { input: 1500, output: 2000 };
    const inputCost = (usage.promptTokens / 1_000_000) * rate.input;
    const outputCost = (usage.completionTokens / 1_000_000) * rate.output;
    return Math.round(inputCost + outputCost);
  }

  /**
   * Track token usage and associate cost with an execution.
   */
  async track(executionId: string, model: string, usage: TokenUsage): Promise<number> {
    const cost = this.calculateCost(model, usage);
    const current = this.executionCosts.get(executionId) || 0;
    const updated = current + cost;
    this.executionCosts.set(executionId, updated);
    this.logger.debug(
      `Tracked ${cost} micro-dollars for execution ${executionId}. Total: ${updated}`,
    );
    return cost;
  }

  /**
   * Retrieve total estimated cost for a given execution.
   */
  async getCost(executionId: string): Promise<number> {
    return this.executionCosts.get(executionId) || 0;
  }
}
