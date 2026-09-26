"use client";

/**
 * The design form's live upload/processing line. Purely presentational — `project-action-design.tsx`
 * owns the state this reads: `uploadProgress` (null once no transfer or processing is running),
 * `sanitizing` (the transfer finished and the server is remuxing, with no percentage of its own)
 * and `continuing` (this transfer resumed an earlier attempt at the same file).
 */
export function UploadStatus({
  uploadProgress,
  sanitizing,
  continuing,
}: {
  uploadProgress: number | null;
  sanitizing: boolean;
  continuing: boolean;
}) {
  if (uploadProgress === null) return null;
  return (
    <p className="upload-progress" aria-live="polite">
      {sanitizing ? (
        // No `value`: an indeterminate `<progress>` renders as an animated bar in every
        // evergreen browser, which is the honest signal here — the transfer is done, the
        // server is remuxing, and there is no percentage to report for that step. A bar
        // pinned at 100% would say "done" for an operation that is not.
        <progress max={1} aria-label="Processing video" />
      ) : (
        <progress value={uploadProgress} max={1} aria-label="Upload progress" />
      )}
      <span>
        {sanitizing
          ? "Processing…"
          : `${continuing ? "Continuing from" : "Sending"} ${Math.round(uploadProgress * 100)}%`}
      </span>
    </p>
  );
}
