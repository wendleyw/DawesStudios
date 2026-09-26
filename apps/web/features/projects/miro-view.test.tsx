import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasVersion } from "./project-data";
import { MiroControls, MiroView } from "./miro-view";

const link = { boardId: "uXjVKabc123=", widgetId: "345" };
const v3 = {
  id: "v3",
  deliverableId: "d",
  number: 3,
  date: "2026-09-20",
  miro: link,
} as CanvasVersion & { miro: typeof link };
const v2 = {
  id: "v2",
  deliverableId: "d",
  number: 2,
  date: "2026-09-10",
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

describe("MiroControls", () => {
  it("offers the current frame in Miro", () => {
    render(<MiroControls linked={[v3, v2]} current={v3} onSelect={() => {}} />);
    const open = screen.getByRole("link", { name: /Open in Miro/ });
    expect(open).toHaveAttribute(
      "href",
      "https://miro.com/app/board/uXjVKabc123%3D/?moveToWidget=345",
    );
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("toggles between the shown deliverable's linked versions, oldest first", () => {
    const onSelect = vi.fn();
    const other = { ...v2, id: "o1", deliverableId: "other", number: 1 } as CanvasVersion;
    render(<MiroControls linked={[v3, v2, other]} current={v3} onSelect={onSelect} />);
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
});
