import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BriefingSummary } from "./briefing-summary";
import type { BriefingDraft } from "./briefing-model";

vi.mock("@/features/workspace/workspace-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/workspace/workspace-data")>()),
  useDateFormat: () => ({ formatDate: () => "Sep 23" }),
}));

const draft: BriefingDraft = {
  serviceId: "blog",
  campaignId: "campaign",
  title: "Autumn article",
  overview: "An article about the autumn range.",
  goals: "More newsletter sign-ups",
  direction: { audience: "Commuters" },
  deliverables: [],
  dueDate: "",
};

/** The value a summary label names, found through the description list that pairs them. */
function valueOf(label: string) {
  const term = screen.getByText(label, { selector: "dt" });
  return term.nextElementSibling;
}

describe("BriefingSummary creative direction", () => {
  it("names every value, including the overview, the way the editor labels its fields", () => {
    render(<BriefingSummary draft={draft} campaignName="Autumn" />);
    expect(valueOf("Overview")).toHaveTextContent("An article about the autumn range.");
    expect(valueOf("Goals")).toHaveTextContent("More newsletter sign-ups");
    expect(valueOf("Audience")).toHaveTextContent("Commuters");
    expect(valueOf("Content & assets")).toHaveTextContent("Not provided");
    for (const label of ["Overview", "Goals", "Audience", "Content & assets"])
      expect(valueOf(label)?.tagName).toBe("DD");
  });

  it("keeps a missing overview visible as its own labelled value", () => {
    render(<BriefingSummary draft={{ ...draft, overview: "" }} campaignName="Autumn" />);
    expect(valueOf("Overview")).toHaveTextContent("No overview added.");
  });
});
