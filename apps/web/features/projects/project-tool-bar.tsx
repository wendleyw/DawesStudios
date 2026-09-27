"use client";

import { Info, MessageSquare } from "lucide-react";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { BrandMark } from "@/features/shared/brand-mark";
import type { ProjectPanelKind } from "./project-panel";

/**
 * The project's tools float at the bottom of its canvas, as on a design canvas: the studio's
 * animated mark (branding, not a control), the Details and Comments panels,
 * a divider, then the page's own actions (the Playground).
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
      <span className="project-tool-bar-brand" aria-hidden="true">
        <BrandMark />
      </span>
      <ProjectToolButton
        active={panel === "details"}
        disabled={disabled}
        aria-label="Project details"
        title="Project details"
        aria-expanded={panel === "details"}
        onClick={() => onPanel(panel === "details" ? null : "details")}
      >
        <Info size={20} />
      </ProjectToolButton>
      <ProjectToolButton
        active={panel === "comments"}
        disabled={disabled}
        aria-label="Comments"
        title="Comments"
        aria-expanded={panel === "comments"}
        onClick={() => onPanel(panel === "comments" ? null : "comments")}
      >
        <MessageSquare size={20} />
      </ProjectToolButton>
      <span className="project-tool-bar-divider" aria-hidden="true" />
      {children}
    </div>
  );
}

/**
 * Restarts a one-shot CSS animation class, removing it when one of its animations ends. It goes on
 * an inner element whose `className` React never rewrites, so a re-render cannot cut it short.
 */
function replay(element: Element | null, className: string, animationNames: string[]) {
  if (!element) return;
  element.classList.remove(className);
  element.getBoundingClientRect();
  element.classList.add(className);
  const done = (event: Event) => {
    if (!animationNames.includes((event as AnimationEvent).animationName)) return;
    element.classList.remove(className);
    element.removeEventListener("animationend", done);
  };
  element.addEventListener("animationend", done);
}

/**
 * One tool in the bar. A click sends a streak of light once around the button's edge; while
 * `active`, a small comet keeps orbiting that edge, and turning active redraws the icon's strokes.
 * The effects are decorative CSS on an SVG outline (`projects.css`) and stop under reduced motion.
 */
export function ProjectToolButton({
  active = false,
  className,
  children,
  onClick,
  ref,
  ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  const edge = useRef<SVGSVGElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const wasActive = useRef(active);
  useEffect(() => {
    // `pathLength` normalises every stroke of the icon, so one keyframe redraws them all evenly.
    icon.current
      ?.querySelectorAll("svg :is(path, circle, rect, line, polyline)")
      .forEach((shape) => shape.setAttribute("pathLength", "1"));
  }, [children]);
  useEffect(() => {
    if (active && !wasActive.current) replay(icon.current, "is-drawing", ["project-tool-draw"]);
    wasActive.current = active;
  }, [active]);
  return (
    <button
      type="button"
      {...props}
      ref={ref}
      className={`icon-button project-tool-button${active ? " selected" : ""}${className ? ` ${className}` : ""}`}
      onClick={(event) => {
        replay(edge.current, "is-firing", ["project-tool-fire", "project-tool-fire-out"]);
        onClick?.(event);
      }}
    >
      <svg ref={edge} className="project-tool-edge" viewBox="0 0 40 40" aria-hidden="true">
        <rect
          className="project-tool-track"
          x="0.75"
          y="0.75"
          width="38.5"
          height="38.5"
          rx="10"
          pathLength={100}
        />
        <rect
          className="project-tool-comet"
          x="0.75"
          y="0.75"
          width="38.5"
          height="38.5"
          rx="10"
          pathLength={100}
        />
      </svg>
      <span ref={icon} className="project-tool-icon">
        {children}
      </span>
    </button>
  );
}
