import { z } from "zod";

/**
 * Convert a stored JSON-Schema fragment into a Zod schema so persisted tool
 * definitions get the same runtime input/output validation as code tools.
 *
 * A pragmatic subset is supported — object (with `properties`/`required`/
 * `additionalProperties`), string, number, integer, boolean, and array —
 * which covers the shapes tools actually declare. Anything unrecognized
 * degrades to `z.unknown()` so an exotic schema never crashes the loader.
 */
export function jsonSchemaToZod(schema: unknown): z.ZodType {
  if (!schema || typeof schema !== "object") {
    return z.unknown();
  }
  const node = schema as Record<string, unknown>;

  switch (node["type"]) {
    case "string":
      return z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(jsonSchemaToZod(node["items"]));
    case "object":
      return objectSchema(node);
    default:
      // A bare `{ properties: {...} }` with no explicit type is treated as an object.
      return node["properties"] ? objectSchema(node) : z.unknown();
  }
}

function objectSchema(node: Record<string, unknown>): z.ZodType {
  const properties = (node["properties"] as Record<string, unknown> | undefined) ?? {};
  const requiredList = Array.isArray(node["required"]) ? (node["required"] as string[]) : [];
  const required = new Set(requiredList);

  const shape: Record<string, z.ZodType> = {};
  for (const [key, value] of Object.entries(properties)) {
    const field = jsonSchemaToZod(value);
    shape[key] = required.has(key) ? field : field.optional();
  }

  // additionalProperties === false ⇒ reject extra keys; otherwise keep them.
  return node["additionalProperties"] === false ? z.strictObject(shape) : z.looseObject(shape);
}
