"use client";

import { Info, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectPanelKind } from "./project-panel";

/**
 * The project's tools float at the bottom of its canvas, as on a design canvas: the two side
 * panels, a divider, then the page's own actions (the Playground).
 */
export function ProjectToolBar({
  panel,
  onPanel,
  disabled,
  children,
}: {
  panel: ProjectPanelKind | null;
  onPanel: (panel: ProjectPanelKind | null) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <div className="project-tool-bar" role="group" aria-label="Project actions">
      <button
        type="button"
        className={`icon-button ${panel === "details" ? "selected" : ""}`}
        disabled={disabled}
        aria-label="Project details"
        title="Project details"
        aria-expanded={panel === "details"}
        onClick={() => onPanel(panel === "details" ? null : "details")}
      >
        <Info size={20} />
      </button>
      <button
        type="button"
        className={`icon-button ${panel === "conversation" ? "selected" : ""}`}
        disabled={disabled}
        aria-label="Conversation"
        title="Conversation"
        aria-expanded={panel === "conversation"}
        onClick={() => onPanel(panel === "conversation" ? null : "conversation")}
      >
        <MessageSquare size={20} />
      </button>
      <span className="project-tool-bar-divider" aria-hidden="true" />
      {children}
    </div>
  );
}
