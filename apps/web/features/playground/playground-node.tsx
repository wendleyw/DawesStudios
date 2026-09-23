"use client";

import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { FileText, ImageIcon, Pencil, StickyNote } from "lucide-react";
import { useState } from "react";
import { isPlaygroundBusy, type PlaygroundDraft } from "./playground-model";

export type PlaygroundNodeData = {
  draft: PlaygroundDraft;
  onSelect: (id: string) => void;
  onResize: (id: string, geometry: { x: number; y: number; width: number; height: number }) => void;
};
export type PlaygroundCanvasNode = Node<PlaygroundNodeData, "playgroundItem">;

export function PlaygroundNode({ id, data, selected }: NodeProps<PlaygroundCanvasNode>) {
  const { draft } = data;
  const { item } = draft;
  const [failedUrl, setFailedUrl] = useState<string | undefined>();
  const busy = isPlaygroundBusy(draft);
  return (
    <>
      <NodeResizer
        isVisible={selected && !busy}
        minWidth={100}
        minHeight={100}
        maxWidth={2400}
        maxHeight={2400}
        onResizeEnd={(_event, geometry) => data.onResize(id, geometry)}
        handleClassName="playground-resize-handle"
      />
      <article
        className={`playground-item playground-item-${item.kind}${draft.error ? " has-error" : ""}`}
        aria-busy={busy}
      >
        <header className="playground-item-header">
          {item.kind === "note" ? (
            <StickyNote size={15} />
          ) : item.kind === "image" ? (
            <ImageIcon size={15} />
          ) : (
            <FileText size={15} />
          )}
          <strong title={item.title}>{item.title || "Untitled"}</strong>
          <button
            type="button"
            className="icon-button nodrag"
            onClick={() => data.onSelect(id)}
            aria-label={`Edit ${item.title || "item"}`}
          >
            <Pencil size={14} />
          </button>
        </header>
        {item.kind === "image" && draft.url && failedUrl !== draft.url ? (
          // Signed private URLs and browser object URLs are intentional; they must not enter an image proxy.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="playground-image"
            src={draft.url}
            alt={item.title}
            draggable={false}
            onError={() => setFailedUrl(draft.url)}
          />
        ) : item.kind === "note" ? (
          <p className="playground-note-body">
            {item.body || "Select this note to add your ideas."}
          </p>
        ) : (
          <div className="playground-file-body">
            {item.kind === "image" ? <ImageIcon size={32} /> : <FileText size={32} />}
            <span>
              {item.kind === "image"
                ? "Preview unavailable"
                : item.title.split(".").at(-1)?.toUpperCase() || "Document"}
            </span>
            {item.body && <p>{item.body}</p>}
          </div>
        )}
        <span className={`playground-item-status${draft.error ? " is-error" : ""}`}>
          {draft.status === "queued"
            ? "Waiting to upload…"
            : draft.status === "saving"
              ? draft.file && !draft.uploaded
                ? "Uploading…"
                : "Saving…"
              : draft.status === "deleting"
                ? "Removing…"
                : draft.error
                  ? "Needs attention — select to retry"
                  : draft.status === "dirty"
                    ? "Unsaved changes"
                    : "Saved"}
        </span>
      </article>
    </>
  );
}
