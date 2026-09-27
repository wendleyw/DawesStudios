"use client";

import type { FormEvent, ReactNode } from "react";
import { Modal } from "@/features/shared/modal";
import { FormError } from "@/features/shared/form-error";
import { useInvalidateProject } from "./project-data";

/**
 * The close/cancel handling every action kind shares: closing is refused while a save is still
 * pending. `closeDisabled` is the one expression both the Modal's close control and the footer's
 * Cancel button share.
 */
export function useProjectActionClose({
  onClose,
  pending,
}: {
  onClose: () => void;
  pending: boolean;
}) {
  const closeDisabled = pending;

  function close() {
    if (closeDisabled) return;
    onClose();
  }

  return { closeDisabled, close };
}

/**
 * Invalidates the project's cached queries, then closes the dialog. Every kind's mutation calls
 * this on success, so a saved action is reflected immediately and the dialog closes on its own.
 * `invalidate` is exposed on its own for the one kind (round) that also invalidates mid-mutation.
 */
export function useCloseOnSuccess(onClose: () => void) {
  const invalidate = useInvalidateProject();
  return {
    invalidate,
    closeOnSuccess: async () => {
      await invalidate();
      onClose();
    },
  };
}

/**
 * The `Modal` shell every action kind renders into: the title, the form wrapping the kind-specific
 * fields, the shared error paragraph and the Cancel/submit footer. Each kind component owns its own
 * mutation, form state and fields (passed as `children`); this component only owns the markup they
 * share, so `data-*`/`aria-*` attributes, class names and DOM order stay identical across kinds.
 */
export function ProjectActionShell({
  open,
  title,
  closeDisabled,
  onModalClose,
  onSubmit,
  children,
  error,
  onCancelClick,
  cancelDisabled,
  submitLabel,
  submitDisabled,
}: {
  open: boolean;
  title: string;
  closeDisabled: boolean;
  onModalClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  /** Already resolved to the exact text to show, or `undefined` to show nothing. */
  error?: string;
  onCancelClick: () => void;
  cancelDisabled: boolean;
  submitLabel: ReactNode;
  submitDisabled: boolean;
}) {
  return (
    <Modal open={open} onClose={onModalClose} title={title} closeDisabled={closeDisabled}>
      <form className="stack-form" onSubmit={onSubmit}>
        {children}
        {error && <FormError>{error}</FormError>}
        <div className="form-actions">
          <button
            className="button"
            type="button"
            onClick={onCancelClick}
            disabled={cancelDisabled}
          >
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={submitDisabled}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
