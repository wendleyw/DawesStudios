"use client";

import { Info, MessageSquare, MessageSquareText } from "lucide-react";
import type { ReactNode } from "react";
import { BrandMark } from "@/features/shared/brand-mark";
import type { ProjectPanelKind } from "./project-panel";

/**
 * The project's tools float at the bottom of its canvas, as on a design canvas: the studio's
 * animated mark (branding, not a control), the side panels (and, in the Miro workspace, Feedback),
 * a divider, then the page's own actions (the Playground).
 */
export function ProjectToolBar({
  panel,
  onPanel,
  disabled,
  feedback,
  children,
}: {
  panel: ProjectPanelKind | null;
  onPanel: (panel: ProjectPanelKind | null) => void;
  disabled: boolean;
  feedback?: { open: boolean; onToggle: () => void };
  children: ReactNode;
}) {
  return (
    <div className="project-tool-bar" role="group" aria-label="Project actions">
      <span className="project-tool-bar-brand" aria-hidden="true">
        <BrandMark />
      </span>
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
      {feedback && (
        <button
          type="button"
          className={`icon-button ${feedback.open ? "selected" : ""}`}
          disabled={disabled}
          aria-label="Feedback"
          title="Feedback"
          aria-expanded={feedback.open}
          onClick={feedback.onToggle}
        >
          <MessageSquareText size={20} />
        </button>
      )}
      <span className="project-tool-bar-divider" aria-hidden="true" />
      {children}
    </div>
  );
}
