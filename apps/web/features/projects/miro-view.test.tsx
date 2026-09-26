import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasVersion } from "./project-data";
import { MiroView } from "./miro-view";

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
  it("embeds the current frame with autoplay and offers it in Miro", () => {
    render(
      <MiroView linked={[v3, v2]} current={v3} deliverables={deliverables} onSelect={() => {}} />,
    );
    expect(screen.getByTitle("Miro board for Key visual · V3")).toHaveAttribute(
      "src",
      "https://miro.com/app/live-embed/uXjVKabc123%3D/?autoplay=true&moveToWidget=345",
    );
    const open = screen.getByRole("link", { name: /Open in Miro/ });
    expect(open).toHaveAttribute(
      "href",
      "https://miro.com/app/board/uXjVKabc123%3D/?moveToWidget=345",
    );
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("lists only the linked versions and reports a change", () => {
    const onSelect = vi.fn();
    render(
      <MiroView linked={[v3, v2]} current={v3} deliverables={deliverables} onSelect={onSelect} />,
    );
    const select = screen.getByLabelText("Miro frame");
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.textContent)).toEqual([
      "Key visual · V3",
      "Key visual · V2",
    ]);
    fireEvent.change(select, { target: { value: "v2" } });
    expect(onSelect).toHaveBeenCalledWith("v2");
  });

  it("renders the asset strip when given", () => {
    render(
      <MiroView
        linked={[v3]}
        current={v3}
        deliverables={deliverables}
        onSelect={() => {}}
        strip={<p>strip</p>}
      />,
    );
    expect(screen.getByText("strip")).toBeInTheDocument();
  });
});
