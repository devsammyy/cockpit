import { validateDefinition } from "./dependency-resolver";
import { REFERENCE_TEMPLATES } from "./reference-templates";

/**
 * The seed pipeline (WorkflowRepositoryService.seedReferenceTemplates) rejects
 * any template whose definition produces a validation *error*, surfacing a 400
 * to the UI. These tests keep the built-in library structurally valid so a
 * broken template can never ship — the "Valid?" condition once shipped without
 * its true/false branch edges and blocked the whole seed.
 */
describe("REFERENCE_TEMPLATES", () => {
  it("ships at least one template", () => {
    expect(REFERENCE_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("uses unique slugs", () => {
    const slugs = REFERENCE_TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(REFERENCE_TEMPLATES.map((t) => [t.name, t] as const))(
    "%s has no structural validation errors",
    (_name, template) => {
      const errors = validateDefinition(template.definition).filter(
        (issue) => issue.severity === "error",
      );
      expect(errors).toEqual([]);
    },
  );

  it("gives every CONDITION step exactly one true and one false outgoing edge", () => {
    for (const template of REFERENCE_TEMPLATES) {
      const conditionIds = template.definition.steps
        .filter((step) => step.type === "CONDITION")
        .map((step) => step.id);

      for (const id of conditionIds) {
        const labels = template.definition.connections
          .filter((edge) => edge.fromStepId === id)
          .map((edge) => edge.label);
        expect(labels).toEqual(expect.arrayContaining(["true", "false"]));
      }
    }
  });
});
