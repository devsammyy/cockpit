import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { collectNarrative, IoPanel, prettifyLabel } from "./io-panel";

describe("collectNarrative", () => {
  test("labels a step-result section by the step key, not the inner field", () => {
    const output = {
      rank: { output: "## Ranked candidates\nJane is the strongest match for the role.", cost: 3 },
      evaluate: {
        output: "Detailed evaluation of every candidate against the job requirements provided.",
      },
    };
    const sections = collectNarrative(output, "Output");
    expect(sections.map((s) => s.label)).toEqual(["rank", "evaluate"]);
    expect(sections[0]?.text).toContain("Ranked candidates");
  });

  test("recognizes message/result/content wrappers", () => {
    const sections = collectNarrative(
      { approval: { message: "Approve the shortlist before we schedule the interviews please." } },
      "Output",
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]?.label).toBe("approval");
  });

  test("skips bookkeeping keys and short scalars", () => {
    const sections = collectNarrative({ cost: 42, ok: true, id: "abc" }, "Output");
    expect(sections).toEqual([]);
  });

  test("treats a bare narrative string as a single section", () => {
    const sections = collectNarrative(
      "This is a sufficiently long narrative string to render.",
      "Goal",
    );
    expect(sections).toEqual([
      { label: "Goal", text: "This is a sufficiently long narrative string to render." },
    ]);
  });
});

describe("prettifyLabel", () => {
  test("humanizes snake, kebab, and camel case", () => {
    expect(prettifyLabel("evaluate_candidates")).toBe("Evaluate Candidates");
    expect(prettifyLabel("rank-step")).toBe("Rank Step");
    expect(prettifyLabel("finalOutput")).toBe("Final Output");
  });
});

describe("IoPanel", () => {
  test("renders formatted prose by default (not raw JSON)", () => {
    const html = renderToStaticMarkup(
      <IoPanel
        input={{ goal: "Find me 10 backend engineering roles at reputable companies." }}
        isLive={false}
        output={{ summarize: { output: "## Results\n- **Acme** — strong match" } }}
      />,
    );
    expect(html).toContain("Results");
    expect(html).toContain("<strong");
    // The escaped-JSON braces of the raw value should not be the primary render.
    expect(html).not.toContain("{&quot;summarize&quot;");
  });

  test("shows an empty-state message when there is no output", () => {
    const html = renderToStaticMarkup(<IoPanel input={{}} isLive output={null} />);
    expect(html).toContain("No terminal output yet");
  });
});
