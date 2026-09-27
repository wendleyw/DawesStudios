import { useEffect, useRef, useState, type RefObject } from "react";

type FocusRequest = { target: RefObject<HTMLElement | null>; onlyFromBody: boolean };

/**
 * Returns `returnFocus(target)`, which moves focus to `target` once the render that closes a layer
 * has committed. Call it alongside the state change that closes the layer. A frame callback is not
 * enough: React may commit after it runs, while the trigger is still disabled (the Playground
 * button is) or its layer is still mounted, and focusing a disabled element is a silent no-op.
 * With `onlyFromBody`, focus that already moved elsewhere (an upload dialog restoring its own) is
 * left alone.
 */
export function useFocusReturn() {
  const request = useRef<FocusRequest | null>(null);
  // A new object per request guarantees a commit, even when the close changed nothing else.
  const [requested, setRequested] = useState<object | null>(null);
  useEffect(() => {
    const pending = request.current;
    request.current = null;
    if (!pending) return;
    if (!pending.onlyFromBody || document.activeElement === document.body)
      pending.target.current?.focus({ preventScroll: true });
  }, [requested]);
  return (
    target: RefObject<HTMLElement | null>,
    { onlyFromBody = false }: { onlyFromBody?: boolean } = {},
  ) => {
    request.current = { target, onlyFromBody };
    setRequested({});
  };
}

/**
 * A project page's side panel, with focus returned on close to whatever opened it. Shared by the
 * legacy canvas (`project-versions-canvas.tsx`) and the Miro workspace (`project-workspace.tsx`).
 */
export function usePanelFocusReturn<Kind>() {
  const [panel, setPanel] = useState<Kind | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const returnFocus = useFocusReturn();
  function closePanel() {
    setPanel(null);
    returnFocus(trigger);
  }
  /** Opens `next` (remembering the focused trigger), or closes the panel when `next` is null. */
  function changePanel(next: Kind | null) {
    if (!next) {
      closePanel();
      return;
    }
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPanel(next);
  }
  return { panel, setPanel, closePanel, changePanel };
}
