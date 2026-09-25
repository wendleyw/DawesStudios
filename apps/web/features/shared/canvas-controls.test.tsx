import { render, screen } from "@testing-library/react";
import { ReactFlowProvider, useStoreApi } from "@xyflow/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { CanvasControls } from "./canvas-controls";

function Harness({
  zoom,
  minZoom = 0.5,
  maxZoom = 2,
}: {
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
}) {
  const store = useStoreApi();
  useEffect(() => {
    store.setState({ transform: [0, 0, zoom], minZoom, maxZoom });
  }, [store, zoom, minZoom, maxZoom]);
  return <CanvasControls />;
}

describe("CanvasControls", () => {
  it("reads zoom out, the zoom level, zoom in, then fit, in one horizontal pill", () => {
    const { container } = render(
      <ReactFlowProvider>
        <Harness zoom={0.514} />
      </ReactFlowProvider>,
    );
    const pill = container.querySelector(".react-flow__controls.canvas-zoom.horizontal");
    expect(pill).not.toBeNull();
    expect(pill).toHaveTextContent("Zoom 51%");
    expect(
      screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Zoom Out", "Zoom In", "Fit View"]);
  });

  it("follows the canvas zoom", () => {
    const { container, rerender } = render(
      <ReactFlowProvider>
        <Harness zoom={1} />
      </ReactFlowProvider>,
    );
    expect(container.querySelector(".canvas-zoom-level")).toHaveTextContent("Zoom 100%");
    rerender(
      <ReactFlowProvider>
        <Harness zoom={1.2} />
      </ReactFlowProvider>,
    );
    expect(container.querySelector(".canvas-zoom-level")).toHaveTextContent("Zoom 120%");
  });

  it("disables zoom out at the minimum and zoom in at the maximum", () => {
    const { rerender } = render(
      <ReactFlowProvider>
        <Harness zoom={0.5} />
      </ReactFlowProvider>,
    );
    expect(screen.getByRole("button", { name: "Zoom Out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zoom In" })).toBeEnabled();
    rerender(
      <ReactFlowProvider>
        <Harness zoom={2} />
      </ReactFlowProvider>,
    );
    expect(screen.getByRole("button", { name: "Zoom In" })).toBeDisabled();
  });

  it("keeps a consumer's own fit label", () => {
    render(
      <ReactFlowProvider>
        <CanvasControls fitLabel="Fit board to view" />
      </ReactFlowProvider>,
    );
    expect(screen.getByRole("button", { name: "Fit board to view" })).toBeInTheDocument();
  });
});
