"use client";

import { FilePlus2, LockKeyhole, Plus, RefreshCw, X } from "lucide-react";
import type { RefObject } from "react";
import type { Profile } from "@/lib/supabase";

/**
 * The Playground dialog's single header: title, team-visibility caption, Add note/Add files
 * icons, save status and the Refresh/close icons. Purely presentational — `playground-board.tsx`
 * passes it the item state of `usePlaygroundItems` and the drop/upload actions.
 */
export function PlaygroundHeader({
  role,
  titleId,
  descriptionId,
  headingRef,
  boardId,
  itemCount,
  maxItems,
  closing,
  busy,
  unsavedCount,
  isFetching,
  fileInputRef,
  fileAccept,
  onAddNote,
  onFilesSelected,
  onRefresh,
  onRequestClose,
  returnLabel,
}: {
  role: Profile["role"] | undefined;
  titleId: string;
  descriptionId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  boardId: string | undefined;
  itemCount: number;
  maxItems: number;
  closing: boolean;
  busy: boolean;
  unsavedCount: number;
  isFetching: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  fileAccept: string;
  onAddNote: () => void;
  onFilesSelected: (files: File[]) => void;
  onRefresh: () => void;
  onRequestClose: () => void;
  returnLabel: string;
}) {
  const atCapacity = itemCount >= maxItems;
  return (
    <header className="playground-header">
      <div className="playground-identity">
        <h2 ref={headingRef} id={titleId} tabIndex={-1}>
          Playground
        </h2>
        <span
          className="playground-audience"
          title={
            role === "client"
              ? "Only your client team can see these ideas"
              : role === "designer"
                ? "Only assigned designers can see these ideas"
                : "Only your agency team can see these ideas"
          }
        >
          <LockKeyhole size={12} />
          {role === "client" ? "Client team" : role === "designer" ? "Design team" : "Agency team"}
        </span>
        <p id={descriptionId} className="visually-hidden">
          Ideas stay separate from project work and are visible only to your team.
        </p>
      </div>
      <div className="playground-toolbar">
        <button
          type="button"
          className="icon-button"
          aria-label="Add note"
          title="Add note"
          onClick={onAddNote}
          disabled={!boardId || atCapacity || closing}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Add files"
          title="Add files"
          onClick={() => fileInputRef.current?.click()}
          disabled={!boardId || atCapacity || closing}
        >
          <FilePlus2 size={15} />
        </button>
        <input
          ref={fileInputRef}
          className="playground-file-input"
          type="file"
          hidden
          tabIndex={-1}
          multiple
          accept={fileAccept}
          aria-label="Add files to Playground"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            onFilesSelected(files);
          }}
        />
        <span
          className={`playground-save-status ${busy || unsavedCount ? "has-changes" : ""}`}
          role="status"
        >
          {busy
            ? "Saving changes… Please keep Playground open."
            : unsavedCount
              ? `${unsavedCount} item${unsavedCount === 1 ? " has" : "s have"} unsaved changes`
              : "All changes saved"}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Refresh Playground"
          title="Refresh Playground"
          onClick={onRefresh}
          disabled={busy || isFetching}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label={returnLabel}
        title={returnLabel}
        onClick={onRequestClose}
        disabled={busy}
      >
        <X size={17} />
      </button>
    </header>
  );
}
