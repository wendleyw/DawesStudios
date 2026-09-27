"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { DriveIcon } from "@/features/shared/drive-icon";
import { FormError } from "@/features/shared/form-error";
import { Modal } from "@/features/shared/modal";
import { driveUrlHint, parseDriveUrl } from "./drive-link";
import { setProjectDriveLink, type ProjectChannel } from "./project-data";

/** Copy that differs between the two Drive link channels; everything else about the control is shared. */
const DRIVE_LINK_COPY: Record<
  ProjectChannel,
  { heading: string; visibility: string; openLabel: string }
> = {
  internal: {
    heading: "Internal Drive link",
    visibility: "Visible to the studio and the assigned designer.",
    openLabel: "Open internal Drive folder",
  },
  client: {
    heading: "Client Drive link",
    visibility: "Visible to the studio and the client.",
    openLabel: "Open client Drive folder",
  },
};

/**
 * One channel's Drive link, agency-only: an Add/Edit button opens a dialog validated by
 * `drive-link.ts`'s `parseDriveUrl` before `setProjectDriveLink`/`set_project_drive_link` (the
 * authority) runs. `project-details.tsx` renders one of these per channel rather than duplicating
 * the heading, dialog and mutation twice.
 */
export function DriveLinkControl({
  projectId,
  channel,
  url,
  onSaved,
}: {
  projectId: string;
  channel: ProjectChannel;
  url: string | null;
  onSaved: () => Promise<void>;
}) {
  const { database } = useAuth();
  const [editing, setEditing] = useState(false);
  const copy = DRIVE_LINK_COPY[channel];
  const action = url ? "Edit" : "Add";
  const save = useMutation({
    mutationFn: async (raw: string) => {
      const parsed = parseDriveUrl(raw);
      if (parsed === false) throw new Error(driveUrlHint);
      await setProjectDriveLink(database, { projectId, channel, url: parsed });
    },
    onSuccess: async () => {
      await onSaved();
      setEditing(false);
    },
  });
  return (
    <div className="assignment-section">
      <h3>{copy.heading}</h3>
      <p>{copy.visibility}</p>
      {url ? (
        <a className="button quiet" href={url} target="_blank" rel="noopener noreferrer">
          <DriveIcon size={14} />
          {copy.openLabel}
        </a>
      ) : (
        <p>No link yet.</p>
      )}
      <button
        className="button quiet"
        aria-label={`${action} ${copy.heading}`}
        onClick={() => {
          save.reset();
          setEditing(true);
        }}
      >
        {action}
      </button>
      <Modal
        open={editing}
        title={`${action} ${copy.heading}`}
        onClose={() => {
          if (!save.isPending) setEditing(false);
        }}
      >
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(String(new FormData(event.currentTarget).get("url")));
          }}
        >
          <label>
            Drive link
            <input
              name="url"
              type="url"
              defaultValue={url ?? ""}
              placeholder="https://drive.google.com/…"
            />
          </label>
          <small>Leave this blank to remove the link.</small>
          {save.error && <FormError>{save.error.message}</FormError>}
          <div className="form-actions">
            <button
              className="button"
              type="button"
              disabled={save.isPending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save link"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
