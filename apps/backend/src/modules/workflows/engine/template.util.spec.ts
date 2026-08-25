import { compileTemplate, evaluateExpression, resolveArgs } from "./template.util";

describe("template.util", () => {
  test("interpolates nested dotted paths", () => {
    const context = { s1: { output: "hello" }, user: { name: "Ada" } };
    expect(compileTemplate("{{ s1.output }} {{ user.name }}", context)).toBe("hello Ada");
  });

  test("renders objects as JSON and missing paths as empty", () => {
    const context = { obj: { a: 1 } };
    expect(compileTemplate("{{ obj }}", context)).toBe('{"a":1}');
    expect(compileTemplate("[{{ missing.path }}]", context)).toBe("[]");
  });

  test("resolves {{ input.field }} — the contract run inputs are seeded under", () => {
    // Regression: run inputs must be reachable as input.<field> because every
    // template (and the planner) references them that way. If the engine seeds
    // variables without the `input` namespace, prompts silently go blank.
    const context = { input: { candidates: "Jane, Bob", requirements: "Senior Java" } };
    expect(
      compileTemplate("Rank {{ input.candidates }} for {{ input.requirements }}", context),
    ).toBe("Rank Jane, Bob for Senior Java");
  });

  test("resolveArgs interpolates strings recursively but preserves non-strings", () => {
    const context = { id: "42" };
    const result = resolveArgs(
      { count: 3, nested: { ref: "id-{{ id }}" }, ref: "{{ id }}" },
      context,
    );
    expect(result).toEqual({ count: 3, nested: { ref: "id-42" }, ref: "42" });
  });

  test("evaluateExpression evaluates against the variable bag", () => {
    expect(
      evaluateExpression("classify.output.includes('Critical')", {
        classify: { output: "Critical issue" },
      }),
    ).toBe(true);
    expect(evaluateExpression("a > b", { a: 2, b: 5 })).toBe(false);
  });

  test("evaluateExpression returns false on malformed expressions", () => {
    expect(evaluateExpression("this is not valid ***", {})).toBe(false);
  });
});
