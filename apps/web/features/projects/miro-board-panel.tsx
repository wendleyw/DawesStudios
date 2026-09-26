"use client";

import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useId } from "react";
import { useFullscreenLayer } from "@/features/shared/use-fullscreen-layer";
import { miroBoardUrl, miroEmbedUrl, type MiroLink } from "./miro-links";

/**
 * A version's Miro frame, full screen over the project. The iframe source is rebuilt from the
 * stored ids; "Open in Miro" stays visible because the embed can fail to sign in (third-party
 * cookies) and the viewer still needs a way through.
 */
export function MiroBoardPanel({
  link,
  title,
  onClose,
}: {
  link: MiroLink;
  title: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const { layer, heading, phase, beginExit, handleAnimationEnd } = useFullscreenLayer({ onClose });
  return (
    <dialog
      ref={layer}
      className="fullscreen-layer miro-board-panel"
      data-phase={phase}
      inert={phase === "exiting"}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        beginExit();
      }}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className="miro-board-shell">
        <header className="miro-board-header">
          <button type="button" className="button quiet" onClick={beginExit}>
            <ArrowLeft size={14} aria-hidden="true" />
            Back to project
          </button>
          <h2 ref={heading} id={titleId} tabIndex={-1}>
            {title}
          </h2>
          <a
            className="button quiet"
            href={miroBoardUrl(link)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Miro
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </header>
        <iframe
          className="miro-board-frame"
          title={`Miro board for ${title}`}
          src={miroEmbedUrl(link)}
          allow="fullscreen; clipboard-read; clipboard-write"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </dialog>
  );
}
