"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FormError } from "@/features/shared/form-error";
import { Modal } from "@/features/shared/modal";
import { clientBrandUploadMimes } from "@/features/shared/upload-rules";
import { clearProjectCover, prepareProjectCover } from "./media-client";
import { setProjectCoverVisibility, useInvalidateProject, useProjectCover } from "./project-data";

const coverAccept = clientBrandUploadMimes.join(",");

/**
 * The Cover block in Project details: one sanitized PNG per project, set by the agency and
 * optionally shown to the client.
 *
 * The agency alone gets Set/Replace, the visibility switch and Remove; a designer gets a read-only
 * preview when a cover exists and nothing otherwise (there is nothing to preview); a client gets
 * the same read-only preview only while `project_covers`' own RLS hands their session a row — the
 * block renders nothing at all rather than an empty placeholder, so a client sees no hint that a
 * hidden cover exists. `useProjectCover` already resolves to `null` for exactly that case, so this
 * component branches on its data rather than on `profile.role` for the client leg.
 */
export function ProjectCover({ projectId }: { projectId: string }) {
  const { database, mediaUrl, profile } = useAuth();
  const cover = useProjectCover(projectId);
  const invalidate = useInvalidateProject();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  const upload = useMutation({
    mutationFn: (file: File) =>
      // The RPC behind this defaults to hiding a cover from the client, so a Replace must carry
      // the row's own current visibility forward rather than reset it — see `prepareProjectCover`.
      prepareProjectCover(database, mediaUrl, projectId, file, cover.data?.clientVisible ?? false),
    onSuccess: async () => {
      setError("");
      await invalidate();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });
  const visibility = useMutation({
    mutationFn: (visible: boolean) => setProjectCoverVisibility(database, { projectId, visible }),
    onSuccess: async () => {
      setError("");
      await invalidate();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });
  // Its own failure is shown inside the confirm dialog below (`remove.error`), matching the
  // revoke-designer dialog above it in `project-details.tsx`, rather than in the shared `error`
  // paragraph the other two mutations use — there is no dialog for those to report inside.
  const remove = useMutation({
    mutationFn: () => clearProjectCover(database, mediaUrl, projectId),
    onSuccess: async () => {
      setRemoving(false);
      await invalidate();
    },
  });

  const isAgency = profile?.role === "agency";
  if (!isAgency && !cover.data?.url) return null;

  const busy = upload.isPending || visibility.isPending || remove.isPending;

  return (
    <div className="project-cover">
      <h3>Cover</h3>
      <div className="project-cover-preview">
        {cover.data?.url ? (
          // Private signed URLs must bypass the public image optimization cache, matching
          // `client-mark.tsx`.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.data.url} alt="Project cover" />
        ) : (
          <p>No cover set yet.</p>
        )}
      </div>
      {isAgency && (
        <div className="project-cover-actions">
          <label className="button quiet" aria-disabled={busy}>
            {upload.isPending ? "Uploading…" : cover.data ? "Replace" : "Set cover"}
            <input
              className="visually-hidden"
              type="file"
              accept={coverAccept}
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setError("");
                upload.mutate(file);
              }}
            />
          </label>
          {cover.data && (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={cover.data.clientVisible}
                  checked={cover.data.clientVisible}
                  disabled={busy}
                  onChange={(event) => visibility.mutate(event.target.checked)}
                />
                Visible to the client
              </label>
              <button
                className="button quiet"
                type="button"
                disabled={busy}
                onClick={() => {
                  remove.reset();
                  setRemoving(true);
                }}
              >
                Remove
              </button>
            </>
          )}
        </div>
      )}
      {error && <FormError>{error}</FormError>}
      <Modal
        open={removing}
        title="Remove this cover?"
        description="The project will show no cover until a new one is set."
        onClose={() => {
          if (!remove.isPending) setRemoving(false);
        }}
      >
        <div className="form-actions">
          <button className="button" onClick={() => setRemoving(false)} disabled={remove.isPending}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Removing…" : "Remove cover"}
          </button>
        </div>
        {remove.error && <FormError>{remove.error.message}</FormError>}
      </Modal>
    </div>
  );
}
