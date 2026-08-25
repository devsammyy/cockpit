import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { describe, expect, test } from "vitest";

import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  test("renders title, description, and action slot", () => {
    // Arrange & Act
    render(
      <EmptyState
        action={<button type="button">Create one</button>}
        description="Nothing here yet."
        icon={Inbox}
        title="No items"
      />,
    );

    // Assert
    expect(screen.getByRole("heading", { name: "No items" })).toBeInTheDocument();
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create one" })).toBeInTheDocument();
  });
});
