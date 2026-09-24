import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompetitorAdsWidget } from "./competitor-ads-widget";
import type { Competitor } from "./competitors-model";

const backend = vi.hoisted(() => ({ competitors: {} as Record<string, unknown> }));
vi.mock("./competitors-data", () => ({ useCompetitors: () => backend.competitors }));
vi.mock("./competitor-form", () => ({
  CompetitorForm: ({ competitor }: { competitor?: Competitor }) => (
    <div role="dialog" aria-label={competitor ? `Edit ${competitor.name}` : "Add competitor"} />
  ),
}));
vi.mock("./competitor-screen", () => ({
  CompetitorScreen: ({ competitor, onEdit }: { competitor: Competitor; onEdit: () => void }) => (
    <div role="dialog" aria-label={competitor.name}>
      <button onClick={onEdit}>Edit</button>
    </div>
  ),
}));

function competitor(id: string, name: string, extra: Partial<Competitor> = {}): Competitor {
  return {
    id,
    client_id: "client-1",
    name,
    website: null,
    meta_page_id: null,
    google_advertiser_id: null,
    tiktok_advertiser: null,
    ...extra,
  };
}

function list(data: Competitor[]) {
  backend.competitors = { isPending: false, error: null, data, refetch: vi.fn() };
}

function renderWidget(props: Partial<Parameters<typeof CompetitorAdsWidget>[0]> = {}) {
  const onRemove = vi.fn();
  const view = render(
    <CompetitorAdsWidget
      clientId="client-1"
      canEdit
      removing={false}
      onRemove={onRemove}
      {...props}
    />,
  );
  return { onRemove, ...view };
}

beforeEach(() => list([]));

describe("CompetitorAdsWidget", () => {
  it("shows each competitor as a tile with its host and matched sources", () => {
    list([
      competitor("c1", "Rival Co", { website: "https://www.rival.example", meta_page_id: "123" }),
      competitor("c2", "Other Brand"),
    ]);
    renderWidget();
    const region = screen.getByRole("region", { name: "Competitor ads" });
    expect(region).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /Rival Co/ })).toHaveTextContent(
      "Rival Corival.exampleMeta · TikTok · Google",
    );
    expect(screen.getByRole("button", { name: /Other Brand/ })).toHaveTextContent("TikTok");
  });

  it("invites the agency to add competitors, and tells a designer none are set", () => {
    renderWidget();
    expect(screen.getByText("Add the competitors you want to follow.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add competitor" })).toBeInTheDocument();
  });

  it("gives a designer no way to add or remove", () => {
    renderWidget({ canEdit: false });
    expect(screen.getByText("The studio has not added competitors yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add competitor" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove competitor ads from the board" }),
    ).not.toBeInTheDocument();
  });

  it("says why nothing more can be added at twelve competitors", () => {
    list(Array.from({ length: 12 }, (_, index) => competitor(`c${index}`, `Rival ${index}`)));
    renderWidget();
    expect(screen.queryByRole("button", { name: "Add competitor" })).not.toBeInTheDocument();
    expect(screen.getByText("Up to 12 competitors")).toBeInTheDocument();
  });

  it("removes itself from the board through the board's handler", async () => {
    const { onRemove } = renderWidget();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Remove competitor ads from the board" }));
    expect(onRemove).toHaveBeenCalled();
  });

  it("opens the form to add, and a competitor's screen from its tile, then its form to edit", async () => {
    list([competitor("c1", "Rival Co")]);
    renderWidget();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add competitor" }));
    expect(screen.getByRole("dialog", { name: "Add competitor" })).toBeInTheDocument();
  });

  it("opens a competitor's screen from its tile and moves to its edit form", async () => {
    list([competitor("c1", "Rival Co")]);
    renderWidget();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Rival Co/ }));
    expect(screen.getByRole("dialog", { name: "Rival Co" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("dialog", { name: "Rival Co" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit Rival Co" })).toBeInTheDocument();
  });

  it("closes a competitor's screen when the competitor is removed elsewhere", async () => {
    list([competitor("c1", "Rival Co")]);
    const { rerender } = renderWidget();
    await userEvent.setup().click(screen.getByRole("button", { name: /Rival Co/ }));
    expect(screen.getByRole("dialog", { name: "Rival Co" })).toBeInTheDocument();
    list([]);
    rerender(
      <CompetitorAdsWidget clientId="client-1" canEdit removing={false} onRemove={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog", { name: "Rival Co" })).not.toBeInTheDocument();
  });

  it("offers Try again when the list cannot be loaded", async () => {
    const refetch = vi.fn();
    backend.competitors = {
      isPending: false,
      error: new Error("offline"),
      data: undefined,
      refetch,
    };
    renderWidget();
    expect(screen.getByRole("alert")).toHaveTextContent("Competitors could not be loaded.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});
