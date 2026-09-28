"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A title card's action area, filled by a nested section. The Brand Hub's sections (its own Edit
 * buttons, Assets' New folder/Add asset, Files' Working file) put their actions top right of the
 * card, the way Briefings and Credits do, instead of each inventing its own row. Rendered with no
 * slot around it (a test, or a section used on its own), the actions stay inline.
 */
const HeaderActionsSlot = createContext<HTMLElement | null>(null);

export const HeaderActionsProvider = HeaderActionsSlot.Provider;

export function HeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderActionsSlot);
  const actions = <div className="header-actions">{children}</div>;
  return slot ? createPortal(actions, slot) : actions;
}
