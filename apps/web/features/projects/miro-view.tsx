"use client";

import { ArrowUpRight } from "lucide-react";
import { useId, type ReactNode } from "react";
import { miroBoardUrl, miroEmbedUrl, type MiroLink } from "./miro-links";
import { miroVersionLabel } from "./miro-mode";
import type { CanvasVersion } from "./project-data";

type MiroFrame = CanvasVersion & { miro: MiroLink };

/**
 * Miro mode's header controls, beside the Versions | Miro switch: a selector of the versions that
 * have a link, and "Open in Miro" for when the embed cannot sign in.
 */
export function MiroControls({
  linked,
  current,
  deliverables,
  onSelect,
}: {
  linked: CanvasVersion[];
  current: MiroFrame;
  deliverables: { id: string; name: string }[];
  onSelect: (versionId: string) => void;
}) {
  const selectId = useId();
  return (
    <div className="miro-controls">
      <label className="visually-hidden" htmlFor={selectId}>
        Miro frame
      </label>
      <select id={selectId} value={current.id} onChange={(event) => onSelect(event.target.value)}>
        {linked.map((version) => (
          <option key={version.id} value={version.id}>
            {miroVersionLabel(version, deliverables)}
          </option>
        ))}
      </select>
      <a
        className="button quiet"
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
      <iframe
        key={current.id}
        className="miro-view-frame"
        title={`Miro board for ${miroVersionLabel(current, deliverables)}`}
        src={miroEmbedUrl(current.miro)}
        allow="fullscreen; clipboard-read; clipboard-write"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </section>
  );
}
