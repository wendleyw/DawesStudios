"use client";

import { X } from "lucide-react";
import { useId } from "react";
import { FormError } from "@/features/shared/form-error";
import { isPlaygroundBusy, type PlaygroundDraft } from "./playground-model";
import type { PlaygroundItemInput } from "./playground-types";

const geometryFields = [
  ["x", "Horizontal position", -100000, 100000],
  ["y", "Vertical position", -100000, 100000],
  ["width", "Width", 100, 2400],
  ["height", "Height", 100, 2400],
] as const;

/**
 * The editor for the selected canvas item: title/body fields, keyboard position and size
 * controls, save/retry/conflict recovery and the download/remove actions. Purely presentational —
 * `playground-board.tsx` passes it the selected item's draft and actions from `usePlaygroundItems`.
 */
export function PlaygroundInspector({
  selected,
  closing,
  removeRequested,
  downloadBusy,
  downloadError,
  onClose,
  onEdit,
  onSave,
  onRemove,
  onReloadSaved,
  onDownload,
  onRequestRemove,
}: {
  selected: PlaygroundDraft;
  closing: boolean;
  removeRequested: boolean;
  downloadBusy: boolean;
  downloadError: string;
  onClose: () => void;
  onEdit: (id: string, update: Partial<PlaygroundItemInput>) => void;
  onSave: (id: string) => void;
  onRemove: (id: string) => void;
  onReloadSaved: () => void;
  onDownload: () => void;
  onRequestRemove: (requested: boolean) => void;
}) {
  const noteTextId = useId();
  const busy = isPlaygroundBusy(selected);
  const disabled = busy || selected.failedAction === "delete" || closing;

  return (
    <aside className="playground-inspector" aria-label="Selected item">
      <header>
        <h3>{selected.item.kind === "note" ? "Edit note" : "Edit item"}</h3>
        <button
          type="button"
          className="icon-button"
          aria-label="Close item editor"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(selected.item.id);
        }}
      >
        <fieldset disabled={disabled}>
          <label>
            {selected.item.kind === "note" ? "Note title" : "Item title"}
            <input
              value={selected.item.title}
              maxLength={160}
              onChange={(event) => onEdit(selected.item.id, { title: event.target.value })}
            />
          </label>
          <div className="playground-field">
            <label htmlFor={noteTextId}>
              {selected.item.kind === "note" ? "Note text" : "Description"}
            </label>
            <textarea
              id={noteTextId}
              value={selected.item.body}
              maxLength={20_000}
              rows={5}
              onChange={(event) => onEdit(selected.item.id, { body: event.target.value })}
            />
          </div>
          <details className="playground-geometry">
            <summary>Position and size</summary>
            <div>
              {geometryFields.map(([field, label, min, max]) => (
                <label key={field}>
                  {label}
                  <input
                    type="number"
                    value={Number.isFinite(selected.item[field]) ? selected.item[field] : ""}
                    min={min}
                    max={max}
                    step={1}
                    onChange={(event) =>
                      onEdit(selected.item.id, { [field]: event.target.valueAsNumber })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <button type="submit" className="button primary" disabled={selected.status === "saved"}>
            {selected.item.kind === "note" ? "Save note" : "Save item"}
          </button>
        </fieldset>
        {selected.error && (
          <div>
            <FormError>{selected.error}</FormError>
            <p className="playground-help">Your local changes are still here.</p>
            {!(selected.conflict && selected.failedAction === "delete") && (
              <button
                type="button"
                className="button"
                onClick={() =>
                  selected.failedAction === "delete"
                    ? onRemove(selected.item.id)
                    : onSave(selected.item.id)
                }
              >
                Retry {selected.failedAction === "delete" ? "removal" : "save"}
              </button>
            )}
            {selected.conflict && (
              <button type="button" className="button" onClick={onReloadSaved}>
                Discard my edits and load saved item
              </button>
            )}
          </div>
        )}
      </form>
      {downloadError && <FormError>{downloadError}</FormError>}
      <div className="playground-item-actions">
        {selected.item.asset_path && (
          <button
            type="button"
            className="button"
            disabled={
              downloadBusy || selected.revision === null || selected.failedAction === "delete"
            }
            onClick={onDownload}
          >
            {downloadBusy ? "Preparing download…" : "Download file"}
          </button>
        )}
        {removeRequested ? (
          <div className="playground-remove-confirm">
            <p>Remove this item and its file from Playground?</p>
            <button
              type="button"
              className="button"
              onClick={() => onRemove(selected.item.id)}
              disabled={busy}
            >
              Confirm removal
            </button>
            <button type="button" className="button" onClick={() => onRequestRemove(false)}>
              Keep item
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button"
            disabled={busy || closing || (selected.conflict && selected.failedAction === "delete")}
            onClick={() => onRequestRemove(true)}
          >
            Remove item
          </button>
        )}
      </div>
    </aside>
  );
}
