/**
 * Variable interpolation + expression evaluation shared by step handlers.
 * Extracted from the phase-2 engine so every handler resolves {{ paths }}
 * identically.
 */

/** Replace {{ dotted.path }} placeholders with values from the variable bag. */
export function compileTemplate(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const keys = key.split(".");
    let val: any = context;
    for (const k of keys) {
      if (val === undefined || val === null) return "";
      val = val[k];
    }
    if (val === undefined) return "";
    return typeof val === "object" ? JSON.stringify(val) : String(val);
  });
}

/** Resolve every string value of an argument template through compileTemplate. */
export function resolveArgs(
  argTemplates: Record<string, any>,
  context: Record<string, any>,
): Record<string, any> {
  const resolved: Record<string, any> = {};
  for (const [key, value] of Object.entries(argTemplates)) {
    if (typeof value === "string") {
      resolved[key] = compileTemplate(value, context);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      resolved[key] = resolveArgs(value as Record<string, any>, context);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Evaluate a boolean branch expression against the variable bag.
 * Same sandboxing posture as phase 2 (expressions are authored by trusted
 * workflow designers within the organization, never by external callers).
 */
export function evaluateExpression(expression: string, context: Record<string, any>): boolean {
  try {
    const evalFn = new Function("context", `with (context) { return !!(${expression}); }`);
    return evalFn(context) as boolean;
  } catch {
    return false;
  }
}
