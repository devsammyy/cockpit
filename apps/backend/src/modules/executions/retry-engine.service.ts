import { Injectable, Logger } from "@nestjs/common";

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  backoffFactor: number;
  onRetry?: (error: Error, attempt: number) => void;
}

@Injectable()
export class RetryEngineService {
  private readonly logger = new Logger(RetryEngineService.name);

  /**
   * Execute an asynchronous function, retrying with exponential backoff if it throws.
   */
  async execute<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
    const { maxAttempts, initialDelayMs, backoffFactor, onRetry } = options;

    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (error) {
        attempt++;
        if (attempt >= maxAttempts) {
          this.logger.error(
            `Function execution failed after ${attempt} attempts: ${(error as Error).message}`,
          );
          throw error;
        }

        if (onRetry) {
          try {
            onRetry(error as Error, attempt);
          } catch (callbackErr) {
            this.logger.error("Error in onRetry callback", callbackErr);
          }
        }

        const delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
        this.logger.warn(
          `Execution failed on attempt ${attempt}. Retrying in ${delay}ms... Error: ${(error as Error).message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
