"use client";

import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";

export type PlaygroundClosePhase = "entering" | "active" | "exiting";

/**
 * The Playground dialog's open/close lifecycle: the native top-layer dialog is shown and body
 * scroll is locked on mount, the heading takes focus, and both are restored to the opener on
 * unmount. `phase` drives the entering/active/exiting CSS slide animation and the `inert`
 * attribute; `animationend` is authoritative and a short timer completes the transition when CSS
 * is unavailable or reduced motion cancels the animation before its event fires.
 */
export function usePlaygroundCloseLifecycle({ onClose }: { onClose: () => void }) {
  const layer = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const closeCompleted = useRef(false);
  const restoreFocusAfterExit = useRef(false);
  const [phase, setPhase] = useState<PlaygroundClosePhase>("entering");

  const completeClose = useCallback(() => {
    if (closeCompleted.current) return;
    closeCompleted.current = true;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const element = layer.current;
    if (!element) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    // The native top layer escapes the project's canvas clipping and makes the covered app inert.
    element.showModal();
    document.body.style.overflow = "hidden";
    heading.current?.focus({ preventScroll: true });
    return () => {
      const focusStayedInLayer =
        element.contains(document.activeElement) ||
        (restoreFocusAfterExit.current && document.activeElement === document.body);
      element.close();
      document.body.style.overflow = previousOverflow;
      if (focusStayedInLayer && previousFocus?.isConnected) {
        // The project removes its underlay's inert state in the same unmount. A suspended
        // upload dialog may already restore focus itself; never override that destination.
        requestAnimationFrame(() => {
          if (document.activeElement === document.body && previousFocus.isConnected)
            previousFocus.focus({ preventScroll: true });
        });
      }
    };
  }, []);

  useEffect(() => {
    if (phase === "active") return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // animationend is authoritative; the timer also completes when CSS is unavailable or
    // an accessibility preference cancels an animation before its event is dispatched.
    const timer = window.setTimeout(
      () => (phase === "exiting" ? completeClose() : setPhase("active")),
      reducedMotion ? 0 : 300,
    );
    return () => window.clearTimeout(timer);
  }, [phase, completeClose]);

  const beginExit = useCallback(() => {
    restoreFocusAfterExit.current =
      document.activeElement === document.body || !!layer.current?.contains(document.activeElement);
    setPhase("exiting");
  }, []);

  function handleAnimationEnd(event: AnimationEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    if (phase === "exiting" && event.animationName === "playground-layer-exit") completeClose();
    if (phase === "entering" && event.animationName === "playground-layer-enter")
      setPhase("active");
  }

  return { layer, heading, phase, beginExit, handleAnimationEnd };
}
