import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDismissOnOutsideClick } from "./use-dismiss-on-outside-click";

function pointerDownOn(target: Element) {
  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
}

describe("useDismissOnOutsideClick", () => {
  it("calls onDismiss for a pointerdown outside the ref's element", () => {
    const inside = document.body.appendChild(document.createElement("div"));
    const outside = document.body.appendChild(document.createElement("button"));
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnOutsideClick({ current: inside }, true, onDismiss));

    pointerDownOn(outside);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not call onDismiss for a pointerdown inside the ref's element", () => {
    const inside = document.body.appendChild(document.createElement("div"));
    const innerButton = inside.appendChild(document.createElement("button"));
    const onDismiss = vi.fn();
    renderHook(() => useDismissOnOutsideClick({ current: inside }, true, onDismiss));

    pointerDownOn(innerButton);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("attaches no listener while inactive", () => {
    const inside = document.body.appendChild(document.createElement("div"));
    const outside = document.body.appendChild(document.createElement("button"));
    const onDismiss = vi.fn();
    const addSpy = vi.spyOn(document, "addEventListener");
    renderHook(() => useDismissOnOutsideClick({ current: inside }, false, onDismiss));

    expect(addSpy).not.toHaveBeenCalledWith("pointerdown", expect.anything());
    pointerDownOn(outside);
    expect(onDismiss).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it("removes its listener on unmount", () => {
    const inside = document.body.appendChild(document.createElement("div"));
    const outside = document.body.appendChild(document.createElement("button"));
    const onDismiss = vi.fn();
    const { unmount } = renderHook(() =>
      useDismissOnOutsideClick({ current: inside }, true, onDismiss),
    );

    unmount();
    pointerDownOn(outside);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("keeps calling the latest onDismiss across re-renders without needing to re-subscribe", () => {
    const inside = document.body.appendChild(document.createElement("div"));
    const outside = document.body.appendChild(document.createElement("button"));
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onDismiss }: { onDismiss: () => void }) =>
        useDismissOnOutsideClick({ current: inside }, true, onDismiss),
      { initialProps: { onDismiss: first } },
    );

    rerender({ onDismiss: second });
    pointerDownOn(outside);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
