import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automated WCAG scans on the public surfaces. Authenticated pages are
 * covered by the same design-system components, so violations caught here
 * indicate systemic issues.
 */
test.describe("Accessibility", () => {
  test("login page has no serious or critical WCAG violations", async ({ page }) => {
    await page.goto("/login");
    await page.waitForSelector("form");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const severe = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(severe, JSON.stringify(severe, null, 2)).toHaveLength(0);
  });

  test("register page has no serious or critical WCAG violations", async ({ page }) => {
    await page.goto("/register");
    await page.waitForSelector("form");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const severe = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(severe, JSON.stringify(severe, null, 2)).toHaveLength(0);
  });
});
