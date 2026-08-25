export function createRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export type JsonParseResult =
  | {
      data: unknown;
      success: true;
    }
  | {
      success: false;
    };

export function safeJsonParse(value: string): JsonParseResult {
  try {
    return { data: JSON.parse(value) as unknown, success: true };
  } catch {
    return { success: false };
  }
}
