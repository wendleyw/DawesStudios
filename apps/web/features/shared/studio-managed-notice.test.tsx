import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudioManagedNotice } from "./studio-managed-notice";

describe("StudioManagedNotice", () => {
  it("states who manages the area as the page heading, inside the shared empty state, with a way back", () => {
    render(<StudioManagedNotice area="Credits" />);
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Credits are managed by the studio.",
    });
    expect(heading.closest(".empty-state")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Back to your work" })).toHaveAttribute(
      "href",
      "/home",
    );
  });
});
