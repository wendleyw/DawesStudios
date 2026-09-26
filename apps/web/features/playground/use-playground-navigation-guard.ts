"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { FullscreenLayerPhase } from "@/features/shared/use-fullscreen-layer";

/**
 * Guards unsaved Playground work against same-tab navigation away from it: a full page
 * reload/close (the browser's native `beforeunload` prompt), a same-tab link click elsewhere in
 * the app (intercepted and held behind an inline notice instead of navigating), and the dialog's
 * own Escape/cancel/close attempt. All three route through the same `requestClose` gate, which
 * also defers to an in-flight save or deletion (`busy`) and to the still-synchronous `locks` set
 * a save/delete holds before its status update has rendered.
 */
export function usePlaygroundNavigationGuard({
  busy,
  unsavedCount,
  phase,
  beginExit,
  locks,
  layer,
}: {
  busy: boolean;
  unsavedCount: number;
  phase: FullscreenLayerPhase;
  beginExit: () => void;
  locks: RefObject<Set<string>>;
  layer: RefObject<HTMLDialogElement | null>;
}) {
  const [closeRequested, setCloseRequested] = useState(false);
  const [navigationBlocked, setNavigationBlocked] = useState(false);

  useEffect(() => {
    if (!unsavedCount) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsavedCount]);

  useEffect(() => {
    if (!busy && !unsavedCount) return;
    const guardNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self"))
        return;
      const destination = new URL(link.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setNavigationBlocked(true);
      setCloseRequested(true);
    };
    document.addEventListener("click", guardNavigation, true);
    return () => document.removeEventListener("click", guardNavigation, true);
  }, [busy, unsavedCount]);

  const requestClose = useCallback(() => {
    if (busy || locks.current.size || phase === "exiting") return;
    if (unsavedCount) {
      setNavigationBlocked(false);
      setCloseRequested(true);
    } else beginExit();
  }, [busy, phase, unsavedCount, beginExit, locks]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const active = document.activeElement;
      if (active !== document.body && !layer.current?.contains(active)) return;
      // Saving can disable the focused button and move browser focus to body. Keep Escape
      // routed through the same unsaved/busy guard even in that case.
      event.preventDefault();
      requestClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [requestClose, layer]);

  return { closeRequested, setCloseRequested, navigationBlocked, requestClose };
}
