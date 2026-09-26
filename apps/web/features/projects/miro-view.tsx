"use client";

import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { miroBoardUrl, miroEmbedUrl, type MiroLink } from "./miro-links";
import { miroVersionLabel } from "./miro-mode";
import type { CanvasVersion } from "./project-data";

type MiroFrame = CanvasVersion & { miro: MiroLink };

/**
 * Miro mode's second header bar, under the project title's: the shown deliverable's name between a
 * toggle of its linked versions (the deliverable filter changes the deliverable) and "Open in Miro"
 * for when the embed cannot sign in.
 */
export function MiroTitleBar({
  name,
  linked,
  current,
  onSelect,
}: {
  name: string;
  linked: CanvasVersion[];
  current: MiroFrame;
  onSelect: (versionId: string) => void;
}) {
  const versions = linked
    .filter((version) => version.deliverableId === current.deliverableId)
    .sort((a, b) => a.number - b.number);
  return (
    <div className="project-header miro-title-bar">
      <div className="segmented-control" role="group" aria-label="Miro version">
        {versions.map((version) => (
          <button
            key={version.id}
            className={version.id === current.id ? "active" : ""}
            aria-pressed={version.id === current.id}
            onClick={() => {
              if (version.id !== current.id) onSelect(version.id);
            }}
          >
            V{version.number}
          </button>
        ))}
      </div>
      <h2 title={name}>{name}</h2>
      <a
        className="button"
        href={miroBoardUrl(current.miro)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open in Miro
        <ArrowUpRight size={13} aria-hidden="true" />
      </a>
    </div>
  );
}

/**
 * Miro mode's view: the chosen version's frame in place of the canvas, running under the header and
 * the floating tool bar. The iframe source is rebuilt from stored ids; `key` reloads it on the new
 * frame when the version changes.
 */
export function MiroView({
  current,
  deliverables,
  strip,
}: {
  current: MiroFrame;
  deliverables: { id: string; name: string }[];
  strip?: ReactNode;
}) {
  return (
    <section className="miro-view" aria-label="Miro board">
      {strip}
      {/* Miro's own top bar is cropped off (see `.miro-view-crop`); the board, its tools and paste
          stay fully usable. */}
      <div className="miro-view-crop">
        <iframe
          key={current.id}
          className="miro-view-frame"
          title={`Miro board for ${miroVersionLabel(current, deliverables)}`}
          src={miroEmbedUrl(current.miro)}
          allow="fullscreen; clipboard-read; clipboard-write"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </section>
  );
}
