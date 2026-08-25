import { jsonSchemaToZod } from "./json-schema.util";

describe("jsonSchemaToZod", () => {
  it("builds an object schema honoring required vs optional fields", () => {
    const schema = jsonSchemaToZod({
      type: "object",
      properties: { owner: { type: "string" }, count: { type: "number" } },
      required: ["owner"],
    });
    expect(schema.safeParse({ owner: "acme" }).success).toBe(true);
    expect(schema.safeParse({ count: 3 }).success).toBe(false); // missing required owner
    expect(schema.safeParse({ owner: "acme", count: "no" }).success).toBe(false); // wrong type
  });

  it("accepts extra keys unless additionalProperties is false", () => {
    const loose = jsonSchemaToZod({ type: "object", properties: {}, required: [] });
    expect(loose.safeParse({ anything: 1 }).success).toBe(true);

    const strict = jsonSchemaToZod({
      type: "object",
      properties: { a: { type: "string" } },
      required: [],
      additionalProperties: false,
    });
    expect(strict.safeParse({ a: "x", b: 2 }).success).toBe(false);
  });

  it("supports primitives and arrays", () => {
    expect(jsonSchemaToZod({ type: "string" }).safeParse("x").success).toBe(true);
    expect(jsonSchemaToZod({ type: "number" }).safeParse(1).success).toBe(true);
    expect(jsonSchemaToZod({ type: "boolean" }).safeParse(true).success).toBe(true);
    const arr = jsonSchemaToZod({ type: "array", items: { type: "string" } });
    expect(arr.safeParse(["a", "b"]).success).toBe(true);
    expect(arr.safeParse([1]).success).toBe(false);
  });

  it("degrades unknown schemas to permissive validation", () => {
    expect(jsonSchemaToZod(undefined).safeParse({ any: "thing" }).success).toBe(true);
    expect(jsonSchemaToZod({ type: "wat" }).safeParse(42).success).toBe(true);
  });
});
