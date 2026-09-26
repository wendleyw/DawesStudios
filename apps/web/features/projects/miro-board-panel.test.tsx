import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MiroBoardPanel } from "./miro-board-panel";

beforeAll(() => {
  // jsdom has no top layer; real focus isolation is covered in E2E.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
});

const link = { boardId: "uXjVKabc123=", widgetId: "345" };

describe("MiroBoardPanel", () => {
  it("embeds the stored frame and offers it in Miro", () => {
    render(<MiroBoardPanel link={link} title="Key visual · V3" onClose={() => {}} />);
    expect(screen.getByTitle("Miro board for Key visual · V3")).toHaveAttribute(
      "src",
      "https://miro.com/app/live-embed/uXjVKabc123%3D/?autoplay=true&moveToWidget=345",
    );
    expect(screen.getByRole("link", { name: /Open in Miro/ })).toHaveAttribute(
      "href",
      "https://miro.com/app/board/uXjVKabc123%3D/?moveToWidget=345",
    );
    expect(screen.getByRole("heading", { name: "Key visual · V3" })).toBeInTheDocument();
  });

  it("closes through Back to project", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<MiroBoardPanel link={link} title="Key visual · V3" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Back to project/ }));
    await act(async () => vi.runAllTimers());
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
