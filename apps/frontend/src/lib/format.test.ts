import { describe, expect, test } from "vitest";

import {
  formatCompact,
  formatCostMicroUsd,
  formatDuration,
  formatPercent,
  percentOf,
  shortId,
} from "./format";

describe("format utilities", () => {
  test("formatCostMicroUsd converts micro-dollars to currency", () => {
    // Arrange & Act & Assert
    expect(formatCostMicroUsd(1_500_000)).toBe("$1.50");
    expect(formatCostMicroUsd(0)).toBe("$0.00");
    expect(formatCostMicroUsd(500)).toBe("<$0.01");
    expect(formatCostMicroUsd(null)).toBe("—");
  });

  test("formatDuration scales units sensibly", () => {
    expect(formatDuration(340)).toBe("340ms");
    expect(formatDuration(2400)).toBe("2.4s");
    expect(formatDuration(65_000)).toBe("1m 05s");
    expect(formatDuration(null)).toBe("—");
  });

  test("formatCompact abbreviates large numbers", () => {
    expect(formatCompact(1_250_000)).toBe("1.3M");
    expect(formatCompact(999)).toBe("999");
  });

  test("shortId truncates long identifiers", () => {
    expect(shortId("9f0c1e2a-1234-5678-9abc-def012345678")).toBe("9f0c1e2a…");
    expect(shortId("short")).toBe("short");
    expect(shortId(null)).toBe("—");
  });

  test("percent helpers clamp to 100", () => {
    expect(formatPercent(50, 200)).toBe("25%");
    expect(formatPercent(500, 200)).toBe("100%");
    expect(percentOf(0, 0)).toBe(0);
  });
});
