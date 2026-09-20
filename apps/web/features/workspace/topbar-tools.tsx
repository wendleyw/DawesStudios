"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TopbarToolsSlot = {
  outlet: HTMLElement | null;
  setOutlet: (element: HTMLElement | null) => void;
};
const TopbarToolsContext = createContext<TopbarToolsSlot>({ outlet: null, setOutlet: () => {} });

/** Holds the workspace topbar's contextual control slot. */
export function TopbarToolsProvider({ children }: { children: ReactNode }) {
  const [outlet, setOutlet] = useState<HTMLElement | null>(null);
  const slot = useMemo(() => ({ outlet, setOutlet }), [outlet]);
  return <TopbarToolsContext.Provider value={slot}>{children}</TopbarToolsContext.Provider>;
}

/** Reserves the place in the topbar where the current page renders its controls. */
export function TopbarToolsOutlet() {
  const { setOutlet } = useContext(TopbarToolsContext);
  return <div className="topbar-tools" ref={setOutlet} />;
}

/**
 * Renders page controls inside the workspace topbar. The portal keeps the controls owned by the
 * page that defines them, so their state stays with the page instead of the shell around it.
 */
export function TopbarTools({ children }: { children: ReactNode }) {
  const { outlet } = useContext(TopbarToolsContext);
  return outlet ? createPortal(children, outlet) : null;
}
