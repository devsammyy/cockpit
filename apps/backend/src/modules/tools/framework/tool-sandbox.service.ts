import { Injectable } from "@nestjs/common";

/** Thrown when a tool invocation exceeds its wall-clock budget. */
export class SandboxTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Tool execution exceeded its ${timeoutMs}ms timeout`);
    this.name = "SandboxTimeoutError";
  }
}

/** Thrown when a run is cancelled (caller abort) before or during execution. */
export class SandboxCancelledError extends Error {
  constructor() {
    super("Tool execution was cancelled");
    this.name = "SandboxCancelledError";
  }
}

interface Bucket {
  active: number;
  readonly waiters: (() => void)[];
}

export interface SandboxRunOptions {
  /** Concurrency bucket key, e.g. `${orgId}:${toolName}`. */
  bucket: string;
  /** Max concurrent runs allowed in this bucket (>= 1). */
  concurrency: number;
  /** Hard wall-clock budget for the invocation. */
  timeoutMs: number;
  /** Caller cancellation signal (run cancel, request abort). */
  signal: AbortSignal;
}

/**
 * The execution boundary every tool invocation passes through. It provides
 * provider-independent isolation guarantees — a hard timeout, cooperative
 * cancellation (a fresh {@link AbortSignal} the tool must honor), and a
 * per-bucket concurrency limit — without any tool- or connector-specific
 * knowledge.
 *
 * Concurrency is enforced in-process here; the seam for distributed limits
 * (a Redis token bucket) is the {@link acquire}/{@link release} pair, which is
 * where a multi-instance deployment would coordinate.
 */
@Injectable()
export class ToolSandboxService {
  private readonly buckets = new Map<string, Bucket>();

  async run<T>(opts: SandboxRunOptions, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (opts.signal.aborted) {
      throw new SandboxCancelledError();
    }

    await this.acquire(opts.bucket, Math.max(1, opts.concurrency));

    // Child controller so we can abort the tool on timeout OR caller cancel,
    // without mutating the caller's signal.
    const controller = new AbortController();
    const onCallerAbort = (): void => controller.abort();
    opts.signal.addEventListener("abort", onCallerAbort, { once: true });

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new SandboxTimeoutError(opts.timeoutMs));
        }, opts.timeoutMs);
      });
      return await Promise.race([fn(controller.signal), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
      opts.signal.removeEventListener("abort", onCallerAbort);
      this.release(opts.bucket);
    }
  }

  private acquire(key: string, limit: number): Promise<void> {
    const bucket = this.buckets.get(key) ?? { active: 0, waiters: [] };
    this.buckets.set(key, bucket);

    if (bucket.active < limit) {
      bucket.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      bucket.waiters.push(() => {
        bucket.active += 1;
        resolve();
      });
    });
  }

  private release(key: string): void {
    const bucket = this.buckets.get(key);
    if (!bucket) return;
    bucket.active = Math.max(0, bucket.active - 1);
    const next = bucket.waiters.shift();
    if (next) {
      next();
    } else if (bucket.active === 0) {
      this.buckets.delete(key);
    }
  }
}
