import { render, screen } from "@testing-library/react";
import { Coins } from "lucide-react";
import { describe, expect, test } from "vitest";

import { StatCard } from "./stat-card";

describe("StatCard", () => {
  test("renders label, value, and hint", () => {
    // Arrange & Act
    render(<StatCard hint="last 30 days" icon={Coins} label="Tokens" value="1.2M" />);

    // Assert
    expect(screen.getByText("Tokens")).toBeInTheDocument();
    expect(screen.getByText("1.2M")).toBeInTheDocument();
    expect(screen.getByText("last 30 days")).toBeInTheDocument();
  });

  test("shows a skeleton instead of the value while loading", () => {
    render(<StatCard isLoading label="Tokens" value="1.2M" />);
    expect(screen.queryByText("1.2M")).not.toBeInTheDocument();
  });

  test("colors trend direction semantically", () => {
    render(<StatCard label="Success" trend={{ direction: "down", value: "-4%" }} value="92%" />);
    expect(screen.getByText("-4%")).toHaveClass("text-destructive");
  });
});
