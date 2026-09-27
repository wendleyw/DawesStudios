"use client";

import { X } from "lucide-react";
import { FormError } from "@/features/shared/form-error";
import type { CopyStatus } from "./playground-albums";

/**
 * The Playground dialog's stacked status banners: album copies in progress or failed, the load
 * error, retained-file cleanup failures, rejected upload issues and the unsaved/busy close
 * confirmation. Purely presentational — `playground-board.tsx` passes it the state of `usePlaygroundItems`
 * and the drop hook.
 */
export function PlaygroundNotices({
  copies,
  onRetryCopy,
  loadError,
  onRetryLoad,
  cleanupError,
  onRetryCleanup,
  cleanupBusy,
  issues,
  onDismissIssue,
  closeRequested,
  showCloseBanner,
  navigationBlocked,
  busy,
  closing,
  onKeepWorking,
  onDiscardAndClose,
}: {
  copies: CopyStatus[];
  onRetryCopy: (status: Extract<CopyStatus, { state: "error" }>) => void;
  loadError?: Error | null;
  onRetryLoad: () => void;
  cleanupError?: string;
  onRetryCleanup: () => void;
  cleanupBusy: boolean;
  issues: { id: string; name: string; message: string }[];
  onDismissIssue: (id: string) => void;
  closeRequested: boolean;
  showCloseBanner: boolean;
  navigationBlocked: boolean;
  busy: boolean;
  closing: boolean;
  onKeepWorking: () => void;
  onDiscardAndClose: () => void;
}) {
  return (
    <>
      {copies.length > 0 && (
        <div className="playground-upload-issues" role="status">
          {copies.map((status) => (
            <div key={status.id}>
              <span>
                <strong>{status.file.title}:</strong>{" "}
                {status.state === "error" ? status.error : "Copying…"}
              </span>
              {status.state === "error" && (
                <button type="button" className="button" onClick={() => onRetryCopy(status)}>
                  Try again
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {loadError && (
        <div className="playground-banner">
          <FormError>{loadError.message}</FormError>
          <button type="button" className="button" onClick={onRetryLoad}>
            Try loading again
          </button>
        </div>
      )}
      {cleanupError && (
        <div className="playground-banner">
          <FormError>{cleanupError}</FormError>
          <button type="button" className="button" onClick={onRetryCleanup} disabled={cleanupBusy}>
            Retry file cleanup
          </button>
        </div>
      )}
      {issues.length > 0 && (
        <div className="playground-upload-issues" role="alert">
          {issues.map((issue) => (
            <div key={issue.id}>
              <span>
                <strong>{issue.name}:</strong> {issue.message}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Dismiss error for ${issue.name}`}
                onClick={() => onDismissIssue(issue.id)}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {closeRequested && showCloseBanner && (
        <div className="playground-banner" role="alert">
          <p>
            {navigationBlocked
              ? "Save or discard your Playground changes before leaving this project."
              : "Some changes are not saved. Keep working to retry, or discard the unsaved changes before leaving."}
            {navigationBlocked &&
              busy &&
              " A transfer or save is still in progress. Please wait for it to finish."}
          </p>
          <button type="button" className="button" onClick={onKeepWorking} disabled={closing}>
            Keep working
          </button>
          <button type="button" className="button" onClick={onDiscardAndClose} disabled={busy}>
            Discard unsaved changes and close
          </button>
        </div>
      )}
    </>
  );
}
