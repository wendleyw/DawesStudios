"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Closes an open panel on a pointer going down outside `ref`'s subtree: `board-period-picker.tsx`,
 * `board-toolbar.tsx` and `workspace/client-switcher.tsx` each hand-rolled this same
 * `pointerdown`/`contains` listener. Attaches nothing while `active` is false, and always detaches
 * its own listener on cleanup, deactivation or unmount. Callers keep their own extras — focus
 * management on open, an Escape key handler — exactly as they were; this hook owns only the
 * outside-pointerdown concern.
 *
 * `onDismiss` is read through a ref rather than the effect's dependency list, so a caller passing a
 * fresh inline callback on every render (the common case: `() => setOpen(false)`) does not cause
 * the listener to be removed and re-added on every render — only `active` toggling does.
 */
export function useDismissOnOutsideClick<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  onDismiss: () => void,
) {
  const latestDismiss = useRef(onDismiss);
  useEffect(() => {
    latestDismiss.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!active) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !ref.current?.contains(event.target))
        latestDismiss.current();
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [active, ref]);
}
