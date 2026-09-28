"use client";

import { useEffect, type RefObject } from "react";

/**
 * A single row of links that scrolls sideways on narrow screens: centres the current link
 * (`aria-current="page"`), clear of the faded edges, and marks the edges that hide more links with
 * `data-more-start` / `data-more-end`, which globals.css fades so the row reads as scrollable.
 * The row and its links settle after layout and the web font load, so both are observed.
 * `key` re-runs the reveal when the current link changes (the route).
 */
export function useScrollRow(row: RefObject<HTMLElement | null>, key: string) {
  useEffect(() => {
    const element = row.current;
    if (!element) return;
    let active = true;
    const mark = () => {
      const hidden = element.scrollWidth - element.clientWidth;
      element.toggleAttribute("data-more-start", hidden > 1 && element.scrollLeft > 1);
      element.toggleAttribute("data-more-end", hidden > 1 && element.scrollLeft < hidden - 1);
    };
    const reveal = () => {
      const current = element.querySelector<HTMLElement>('[aria-current="page"]');
      if (active && current && element.scrollWidth > element.clientWidth)
        current.scrollIntoView({ block: "nearest", inline: "center" });
      mark();
    };
    reveal();
    void document.fonts?.ready.then(reveal);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(reveal) : null;
    observer?.observe(element);
    for (const link of element.children) observer?.observe(link);
    element.addEventListener("scroll", mark, { passive: true });
    return () => {
      active = false;
      observer?.disconnect();
      element.removeEventListener("scroll", mark);
    };
  }, [row, key]);
}
