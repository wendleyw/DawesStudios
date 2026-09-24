// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/supabase";
import { ProjectCreditsChip } from "./project-credits-chip";

const fixture = vi.hoisted(() => ({
  credits: 3 as number | null,
  isPending: false,
  isError: false,
}));
vi.mock("./credit-data", () => ({
  useProjectCreditUse: () => ({
    isPending: fixture.isPending,
    isError: fixture.isError,
    data: fixture.isPending || fixture.isError ? undefined : fixture.credits,
  }),
}));

function viewer(role: Profile["role"]): Profile {
  return { id: "viewer-1", display_name: "Ada Lovelace", role, avatar_url: null };
}

function reset() {
  fixture.credits = 3;
  fixture.isPending = false;
  fixture.isError = false;
}

describe("ProjectCreditsChip", () => {
  it("tells a client how many credits the project used, as information only", () => {
    reset();
    const { container } = render(<ProjectCreditsChip projectId="p1" viewer={viewer("client")} />);
    const chip = container.querySelector(".project-credits-chip");
    expect(chip).toHaveTextContent("3 credits used by this project");
    expect(chip).toHaveAttribute("title", "Credits used by this project");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows for the studio too, with a singular for one credit", () => {
    reset();
    fixture.credits = 1;
    const { container } = render(<ProjectCreditsChip projectId="p1" viewer={viewer("agency")} />);
    expect(container.querySelector(".project-credits-chip")).toHaveTextContent(
      "1 credit used by this project",
    );
  });

  it("renders nothing for a designer, who never sees billing", () => {
    reset();
    const { container } = render(<ProjectCreditsChip projectId="p1" viewer={viewer("designer")} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while loading, after an error, or without a debit", () => {
    for (const state of [{ isPending: true }, { isError: true }, { credits: null }]) {
      reset();
      Object.assign(fixture, state);
      const { container, unmount } = render(
        <ProjectCreditsChip projectId="p1" viewer={viewer("client")} />,
      );
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
