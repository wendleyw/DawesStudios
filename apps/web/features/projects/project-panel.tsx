"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export type ProjectPanelKind = "conversation" | "details" | "feedback";

export function ProjectPanelHeader({
  title,
  subtitle,
  actions,
  onClose,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="project-panel-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="project-panel-actions">
        {actions}
        {onClose && (
          <button
            className="icon-button"
            title={`Close ${title.toLowerCase()}`}
            aria-label={`Close ${title.toLowerCase()}`}
            onClick={onClose}
          >
            <X size={17} />
          </button>
        )}
      </div>
    </div>
  );
}

/** One floating inspector keeps project tools aligned without shifting the canvas. */
export function ProjectPanel({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current
      ?.querySelector<HTMLButtonElement>('.project-panel-heading button[aria-label^="Close "]')
      ?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      className="project-inspector"
      ref={panel}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
        ) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {children}
    </div>
  );
}
