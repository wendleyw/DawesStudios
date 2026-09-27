import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasVersion } from "./project-data";
import { MiroBar, MiroReviewBar, MiroView } from "./miro-view";

const link = { boardId: "uXjVKabc123=", widgetId: "345" };
const v3 = {
  id: "v3",
  deliverableId: "d",
  number: 3,
  date: "2026-09-20",
  status: "pending",
  miro: link,
} as CanvasVersion & { miro: typeof link };
const v2 = {
  id: "v2",
  deliverableId: "d",
  number: 2,
  date: "2026-09-10",
  status: "approved",
  miro: { ...link, widgetId: "222" },
} as CanvasVersion;
const deliverables = [{ id: "d", name: "Key visual" }];

describe("MiroView", () => {
  it("embeds the current frame with autoplay", () => {
    render(<MiroView current={v3} deliverables={deliverables} />);
    expect(screen.getByTitle("Miro board for Key visual · V3")).toHaveAttribute(
      "src",
      "https://miro.com/app/live-embed/uXjVKabc123%3D/?autoplay=true&moveToWidget=345",
    );
  });

  it("renders the asset strip when given", () => {
    render(<MiroView current={v3} deliverables={deliverables} strip={<p>strip</p>} />);
    expect(screen.getByText("strip")).toBeInTheDocument();
  });
});

describe("MiroBar", () => {
  function renderBar(onSelect = vi.fn(), linked: CanvasVersion[] = [v3, v2]) {
    render(
      <MiroBar
        back={<button>Back</button>}
        title="Campaign"
        name="Key visual"
        due="Due Nov 29"
        tone="client"
        lead={<span>channel tabs</span>}
        linked={linked}
        current={v3}
        onSelect={onSelect}
        viewControl={<span>view switch</span>}
        menu={<span>menu content</span>}
      />,
    );
    return onSelect;
  }

  it("names the project and deliverable and offers the current frame in Miro", () => {
    renderBar();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Campaign/Key visual");
    expect(screen.getByText("view switch")).toBeInTheDocument();
    // The shown version's status sits beside the version toggle.
    expect(screen.getByText("In review")).toBeInTheDocument();
    expect(screen.getByText("Due Nov 29")).toBeInTheDocument();
    const open = screen.getByRole("link", { name: /Open in Miro/ });
    expect(open).toHaveAttribute(
      "href",
      "https://miro.com/app/board/uXjVKabc123%3D/?moveToWidget=345",
    );
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("toggles between the shown deliverable's linked versions, oldest first", () => {
    const other = { ...v2, id: "o1", deliverableId: "other", number: 1 } as CanvasVersion;
    const onSelect = renderBar(vi.fn(), [v3, v2, other]);
    const group = screen.getByRole("group", { name: "Miro version" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["V2", "V3"]);
    expect(within(group).getByRole("button", { name: "V3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(group).getByRole("button", { name: "V3" }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(within(group).getByRole("button", { name: "V2" }));
    expect(onSelect).toHaveBeenCalledWith("v2");
  });

  it("puts the channel on the tinted second row, with the versions and status", () => {
    const { container } = render(
      <MiroBar
        back={<button>Back</button>}
        title="Campaign"
        name="Key visual"
        due="Due Nov 29"
        tone="internal"
        lead={<span>channel tabs</span>}
        linked={[v3]}
        current={v3}
        onSelect={vi.fn()}
        viewControl={null}
        menu={null}
      />,
    );
    expect(container.querySelector(".miro-bar")).toHaveClass("is-internal");
    const context = container.querySelector(".miro-bar-context");
    expect(context).toHaveTextContent("channel tabs");
    expect(context).toHaveTextContent("In review");
    expect(context).not.toHaveTextContent("Due Nov 29");
  });

  it("keeps secondary items behind More", () => {
    renderBar();
    const more = screen.getByRole("button", { name: "More" });
    expect(screen.queryByText("menu content")).not.toBeInTheDocument();
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("menu content")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByText("menu content"), { key: "Escape" });
    expect(screen.queryByText("menu content")).not.toBeInTheDocument();
  });

  it("returns focus to More when Escape closes the menu", () => {
    renderBar();
    const more = screen.getByRole("button", { name: "More" });
    fireEvent.click(more);
    fireEvent.keyDown(screen.getByText("menu content"), { key: "Escape" });
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute("aria-expanded", "false");
  });
});

describe("MiroReviewBar", () => {
  it("asks for a decision on the shown frame", () => {
    const onDecide = vi.fn();
    render(<MiroReviewBar label="Key visual · V3" onDecide={onDecide} />);
    const bar = screen.getByRole("group", { name: "Review this version" });
    expect(bar).toHaveTextContent("Key visual · V3");
    fireEvent.click(within(bar).getByRole("button", { name: "Request changes" }));
    expect(onDecide).toHaveBeenLastCalledWith("changes_requested");
    fireEvent.click(within(bar).getByRole("button", { name: "Approve" }));
    expect(onDecide).toHaveBeenLastCalledWith("approved");
  });
});
