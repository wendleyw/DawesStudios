"use client";

import { ArrowUpRight } from "lucide-react";
import { useId, type ReactNode } from "react";
import { miroBoardUrl, miroEmbedUrl, type MiroLink } from "./miro-links";
import { miroVersionLabel } from "./miro-mode";
import type { CanvasVersion } from "./project-data";

/**
 * Miro mode's view: the chosen version's frame in place of the canvas, a selector of the versions
 * that have a link, and "Open in Miro" for when the embed cannot sign in. The iframe source is
 * rebuilt from stored ids; `key` reloads it on the new frame when the version changes.
 */
export function MiroView({
  linked,
  current,
  deliverables,
  onSelect,
  strip,
}: {
  linked: CanvasVersion[];
  current: CanvasVersion & { miro: MiroLink };
  deliverables: { id: string; name: string }[];
  onSelect: (versionId: string) => void;
  strip?: ReactNode;
}) {
  const selectId = useId();
  const label = miroVersionLabel(current, deliverables);
  return (
    <section className="miro-view" aria-label="Miro board">
      <div className="miro-view-bar">
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
      {strip}
      <iframe
        key={current.id}
        className="miro-view-frame"
        title={`Miro board for ${label}`}
        src={miroEmbedUrl(current.miro)}
        allow="fullscreen; clipboard-read; clipboard-write"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </section>
  );
}
