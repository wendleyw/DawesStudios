"use client";

import type { FormEvent, ReactNode, RefObject } from "react";
import { useState } from "react";
import { Modal } from "@/features/shared/modal";
import { FormError } from "@/features/shared/form-error";
import { useInvalidateProject } from "./project-data";

/**
 * The close/cancel handling every action kind shares: closing is refused while a save that is not
 * an upload is still pending, and a successful close can run an optional async cleanup — only the
 * design kind's staged artwork/video upload ever needs one — before calling the dialog's own
 * `onClose`. A cleanup failure surfaces the same message regardless of kind. `closeDisabled` is the
 * one expression both the Modal's close control and the footer's Cancel button share.
 */
export function useProjectActionClose({
  onClose,
  pending,
  uploading = false,
  beforeClose,
}: {
  onClose: () => void;
  pending: boolean;
  uploading?: boolean;
  beforeClose?: () => Promise<void>;
}) {
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  const closeDisabled = closing || (pending && !uploading);

  async function close() {
    if (closeDisabled) return;
    setClosing(true);
    setCloseError("");
    try {
      await beforeClose?.();
      onClose();
    } catch {
      setCloseError("The unfinished upload could not be removed. Please try closing again.");
    } finally {
      setClosing(false);
    }
  }

  return { closing, closeError, closeDisabled, close };
}

/**
 * Invalidates the project's cached queries, then closes the dialog. Every kind's mutation calls
 * this on success, so a saved action is reflected immediately and the dialog closes on its own.
 * `invalidate` is exposed on its own for the one kind (publish) that also invalidates mid-mutation.
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
  initialFocusRef,
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
  initialFocusRef?: RefObject<HTMLElement | null>;
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
    <Modal
      open={open}
      initialFocusRef={initialFocusRef}
      onClose={onModalClose}
      title={title}
      closeDisabled={closeDisabled}
    >
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
