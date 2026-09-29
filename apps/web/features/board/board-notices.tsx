"use client";

import { FormError } from "@/features/shared/form-error";

/**
 * The board's screen-reader announcements and inline error notices: which card is selected, the
 * position/preferences/save errors that can arise while browsing, and the live "Saving…" status.
 */
export function BoardNotices({
  selectedProjectTitle,
  moveError,
  foldError,
  preferencesError,
  onRetryPreferences,
  saveError,
  savePending,
  onRetrySave,
}: {
  selectedProjectTitle: string | null;
  moveError: boolean;
  /** A campaign fold/unfold that did not save; the frame is already back where it was. */
  foldError: boolean;
  preferencesError: boolean;
  onRetryPreferences: () => void;
  saveError: boolean;
  savePending: boolean;
  onRetrySave: () => void;
}) {
  return (
    <>
      {/* A click selects and a double click leaves the board, so selection is the only outcome
        that stays here to be announced. */}
      <p className="visually-hidden" role="status">
        {selectedProjectTitle ? `${selectedProjectTitle} selected.` : ""}
      </p>
      {(moveError || foldError || preferencesError || saveError) && (
        <div className="board-notices">
          {moveError && (
            <FormError>The new position could not be saved. Please try again.</FormError>
          )}
          {foldError && (
            <FormError>That campaign could not be folded or unfolded. Please try again.</FormError>
          )}
          {preferencesError && (
            <FormError>
              Your board view could not be loaded.{" "}
              <button className="button quiet" onClick={onRetryPreferences}>
                Try again
              </button>
            </FormError>
          )}
          {saveError && (
            <FormError>
              Your board view could not be saved.{" "}
              <button className="button quiet" disabled={savePending} onClick={onRetrySave}>
                Try again
              </button>
            </FormError>
          )}
        </div>
      )}
      <p className="visually-hidden" role="status">
        {savePending ? "Saving board view…" : ""}
      </p>
    </>
  );
}
