import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaygroundViewport } from "./playground-viewport";

type TestNode = { id: string; position: { x: number; y: number }; width: number; height: number };
const canvas = vi.hoisted(() => ({
  width: 1258,
  height: 770,
  panZoom: true,
  // Actual controlled nodes retain explicit dimensions, but xyflow clears their measured flag.
  nodesInitialized: false,
  nodes: [] as TestNode[],
  viewport: { x: 0, y: 0, zoom: 1 },
  setViewport: vi.fn(async (viewport: { x: number; y: number; zoom: number }) => {
    canvas.viewport = viewport;
    return true;
  }),
  getNode: vi.fn((id: string) => canvas.nodes.find((node) => node.id === id)),
  getNodes: vi.fn(() => canvas.nodes),
  getViewport: vi.fn(() => canvas.viewport),
}));
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    getViewportForBounds: actual.getViewportForBounds,
    useStore: (selector: (state: typeof canvas) => unknown) => selector(canvas),
    useNodesInitialized: () => canvas.nodesInitialized,
    useReactFlow: () => ({
      getNodesBounds: actual.getNodesBounds,
      setViewport: canvas.setViewport,
      getNodes: canvas.getNodes,
      getNode: canvas.getNode,
      getViewport: canvas.getViewport,
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  canvas.width = 1258;
  canvas.height = 770;
  canvas.panZoom = true;
  canvas.nodesInitialized = false;
  canvas.viewport = { x: 0, y: 0, zoom: 1 };
  canvas.nodes = [{ id: "selected-note", position: { x: 700, y: 400 }, width: 280, height: 220 }];
});

function expectNodeInsideCanvas() {
  const node = canvas.nodes[0];
  const { x, y, zoom } = canvas.viewport;
  expect(node.position.x * zoom + x).toBeGreaterThanOrEqual(0);
  expect(node.position.y * zoom + y).toBeGreaterThanOrEqual(0);
  expect((node.position.x + node.width) * zoom + x).toBeLessThanOrEqual(canvas.width);
  expect((node.position.y + node.height) * zoom + y).toBeLessThanOrEqual(canvas.height);
}

describe("Playground responsive viewport", () => {
  it("keeps an unmeasured controlled note visible after desktop becomes mobile", () => {
    const { rerender } = render(<PlaygroundViewport selectedId="selected-note" />);
    expect(canvas.setViewport).not.toHaveBeenCalled();

    canvas.width = 390;
    canvas.height = 251;
    rerender(<PlaygroundViewport selectedId="selected-note" />);

    expect(canvas.nodesInitialized).toBe(false);
    expect(canvas.setViewport).toHaveBeenCalledTimes(1);
    expectNodeInsideCanvas();
  });

  it("waits for pan/zoom readiness on a freshly opened mobile board", () => {
    canvas.width = 390;
    canvas.height = 251;
    canvas.panZoom = false;
    const { rerender } = render(<PlaygroundViewport selectedId={null} />);
    expect(canvas.setViewport).not.toHaveBeenCalled();

    canvas.panZoom = true;
    rerender(<PlaygroundViewport selectedId={null} />);

    expect(canvas.setViewport).toHaveBeenCalledTimes(1);
    expectNodeInsideCanvas();
  });

  it("fits stored items that arrive after the canvas is ready", () => {
    const savedNode = { ...canvas.nodes[0], position: { x: 3000, y: -4000 } };
    canvas.nodes = [];
    const { rerender } = render(<PlaygroundViewport selectedId={null} />);
    expect(canvas.setViewport).not.toHaveBeenCalled();

    canvas.nodes = [savedNode];
    rerender(<PlaygroundViewport selectedId={null} />);

    expect(canvas.setViewport).toHaveBeenCalledTimes(1);
    expectNodeInsideCanvas();
  });

  it("does not move the canvas while controlled note objects change during typing", async () => {
    canvas.nodes[0].position.x = 2000;
    function Editor() {
      const [text, setText] = useState("");
      canvas.nodes = canvas.nodes.map((node) => ({ ...node }));
      return (
        <>
          <PlaygroundViewport selectedId="selected-note" />
          <label>
            Note text
            <input value={text} onChange={(event) => setText(event.target.value)} />
          </label>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Editor />);
    await user.type(screen.getByLabelText("Note text"), "An uninterrupted idea");

    expect(canvas.setViewport).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Note text")).toHaveValue("An uninterrupted idea");
  });
});
