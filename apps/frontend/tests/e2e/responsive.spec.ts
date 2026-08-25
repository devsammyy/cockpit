import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { height: 640, name: "mobile", width: 360 },
  { height: 1024, name: "tablet", width: 768 },
  { height: 900, name: "desktop", width: 1440 },
];

test.describe("Responsive login surface", () => {
  for (const viewport of VIEWPORTS) {
    test(`renders without horizontal overflow at ${viewport.name} (${String(viewport.width)}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ height: viewport.height, width: viewport.width });
      await page.goto("/login");
      await page.waitForSelector("form");

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    });
  }
});
