import { useRef, useState } from "react";

/**
 * A project page's side panel, with focus returned on close to whatever opened it. Shared by the
 * legacy canvas (`project-page.tsx`) and the Miro workspace (`project-workspace.tsx`).
 */
export function usePanelFocusReturn<Kind>() {
  const [panel, setPanel] = useState<Kind | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  function closePanel() {
    setPanel(null);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
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
