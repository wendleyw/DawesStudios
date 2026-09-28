"use client";

import { Check, ClipboardPaste, Download, X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

export type AlbumCopyStatus =
  "copying" | "copied" | "failed" | "downloading" | "downloaded" | "download-failed";

/** Nonmodal feedback leaves the board available for the next paste. */
export function AlbumCopyFeedback({
  status,
  title,
  onDownload,
  onDismiss,
}: {
  status: AlbumCopyStatus;
  title: string;
  onDownload: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (status !== "copied" && status !== "downloaded") return;
    const timer = window.setTimeout(onDismiss, 6000);
    return () => window.clearTimeout(timer);
  }, [status, onDismiss]);

  const failed = status === "failed" || status === "download-failed";
  const heading = {
    copying: "Copying image…",
    copied: "Image copied",
    failed: "Couldn't copy this image.",
    downloading: "Preparing download…",
    downloaded: "Download ready",
    "download-failed": "Couldn't download this file.",
  }[status];

  return createPortal(
    <div className="playground-copy-feedback">
      <div role="status" aria-live="polite" aria-atomic="true">
        <span className="playground-copy-symbol" aria-hidden="true">
          {status === "copied" ? <Check size={22} /> : <ClipboardPaste size={22} />}
        </span>
        <strong>{heading}</strong>
        {status === "copied" ? (
          <p>
            Click inside the Miro board, then paste with <kbd>⌘V</kbd> or <kbd>Ctrl+V</kbd>.
          </p>
        ) : failed ? (
          <p>Download the image and add it to your board.</p>
        ) : status === "downloaded" ? (
          <p>Add the downloaded image to your Miro board.</p>
        ) : (
          <p>{title}</p>
        )}
      </div>
      {failed && (
        <button
          type="button"
          className="button"
          aria-label={`Download ${title}`}
          onClick={onDownload}
        >
          <Download size={15} /> Download image
        </button>
      )}
      <button
        type="button"
        className="icon-button playground-copy-dismiss"
        aria-label="Dismiss copy message"
        onClick={onDismiss}
      >
        <X size={16} />
      </button>
    </div>,
    document.body,
  );
}
