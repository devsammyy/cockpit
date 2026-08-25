import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  test("renders a humanized status label", () => {
    // Arrange & Act
    render(<StatusBadge status="PENDING_APPROVAL" />);

    // Assert
    expect(screen.getByText("pending approval")).toBeInTheDocument();
  });

  test("shows a live pulse indicator for running states", () => {
    // Arrange & Act
    const { container } = render(<StatusBadge status="RUNNING" />);

    // Assert
    expect(container.querySelector(".animate-ping")).not.toBeNull();
  });

  test("does not pulse for terminal states", () => {
    const { container } = render(<StatusBadge status="COMPLETED" />);
    expect(container.querySelector(".animate-ping")).toBeNull();
  });

  test("falls back gracefully for unknown or missing statuses", () => {
    render(<StatusBadge status={null} />);
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });
});
