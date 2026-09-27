import { act, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFocusReturn } from "./use-panel-focus-return";

// A trigger that is disabled while its layer is open, as the Playground button is: focus can only
// land on it once the render that closes the layer has committed.
function Harness({ onlyFromBody = false }: { onlyFromBody?: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useFocusReturn();
  return (
    <>
      <button ref={trigger} disabled={open} onClick={() => setOpen(true)}>
        Open
      </button>
      <button>Elsewhere</button>
      {open && (
        <button
          onClick={() => {
            // Closed from outside React's event flow, as the layer's exit timer does.
            window.setTimeout(() => {
              setOpen(false);
              returnFocus(trigger, { onlyFromBody });
            });
          }}
        >
          Close
        </button>
      )}
    </>
  );
}

describe("useFocusReturn", () => {
  afterEach(() => vi.useRealTimers());

  it("focuses a trigger that is only enabled by the closing render", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    act(() => screen.getByRole("button", { name: "Open" }).click());
    act(() => screen.getByRole("button", { name: "Close" }).click());
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("leaves focus alone when it already moved and only a lost focus is restored", async () => {
    vi.useFakeTimers();
    render(<Harness onlyFromBody />);
    act(() => screen.getByRole("button", { name: "Open" }).click());
    act(() => screen.getByRole("button", { name: "Close" }).click());
    act(() => screen.getByRole("button", { name: "Elsewhere" }).focus());
    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
  });
});
