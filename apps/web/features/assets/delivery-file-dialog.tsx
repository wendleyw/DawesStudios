"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { parseDriveUrl, driveUrlHint } from "@/features/projects/drive-link";
import { prepareDelivery } from "@/features/projects/media-client";
import { setProjectDriveLink, useInvalidateProject } from "@/features/projects/project-data";
import { FormError } from "@/features/shared/form-error";
import {
  standardUploadMimes,
  uploadExtensionMap,
  uploadLimitMb,
  uploadTypesLabel,
} from "@/features/shared/upload-rules";

const formats = uploadExtensionMap(standardUploadMimes);

/**
 * Adds a final file to an approved project, with the project's client Google Drive folder beside it
 * as the backup copy. The Drive link is the same one the project's ⋯ menu and its Deliverables
 * group open; it is saved first, because saving it again is harmless, while the file is sent last,
 * once, when everything else is in place.
 */
export function DeliveryFileDialog({
  projects,
  initialProject,
  onClose,
}: {
  projects: { id: string; title: string; driveUrl: string | null }[];
  initialProject: string;
  onClose: () => void;
}) {
  const { database, mediaUrl } = useAuth();
  // The same refresh as every other project write: it covers the deliverables list and the Drive
  // link the project's own ⋯ menu shows.
  const invalidateProject = useInvalidateProject();
  const [projectId, setProjectId] = useState(initialProject);
  const current = projects.find((project) => project.id === projectId);
  // The field follows the chosen project until the viewer types in it.
  const [driveEdit, setDriveEdit] = useState<{ projectId: string; url: string } | null>(null);
  const drive = driveEdit?.projectId === projectId ? driveEdit.url : (current?.driveUrl ?? "");
  const upload = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name")).trim();
      const file = form.get("file");
      if (!current) throw new Error("Choose a project.");
      if (!name) throw new Error("Add a file name.");
      if (!(file instanceof File) || !file.size) throw new Error("Choose a file.");
      const driveUrl = parseDriveUrl(drive);
      if (driveUrl === false) throw new Error(driveUrlHint);
      if (driveUrl !== (current.driveUrl ?? null))
        await setProjectDriveLink(database, { projectId, channel: "client", url: driveUrl });
      await prepareDelivery(database, mediaUrl, projectId, file, name);
    },
    onSettled: () => invalidateProject(),
    onSuccess: onClose,
  });

  return (
    <Modal
      open
      title="Add a deliverable"
      onClose={() => {
        if (!upload.isPending) onClose();
      }}
      description="Share a final image or PDF with the client, with its Google Drive folder as a backup."
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          upload.mutate(new FormData(event.currentTarget));
        }}
      >
        <label>
          Project
          <select
            name="project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            disabled={upload.isPending}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          File name
          <input name="name" required maxLength={240} placeholder="Approved campaign — print PDF" />
        </label>
        <label>
          File
          <input
            type="file"
            name="file"
            aria-label="File"
            accept={Object.keys(formats).join(",")}
            required
            disabled={upload.isPending}
          />
          <small>
            {uploadTypesLabel(standardUploadMimes)} · up to {uploadLimitMb()} MB
          </small>
        </label>
        <label>
          Google Drive backup (optional)
          <input
            type="url"
            name="drive"
            inputMode="url"
            placeholder="https://drive.google.com/…"
            value={drive}
            disabled={upload.isPending}
            onChange={(event) => setDriveEdit({ projectId, url: event.target.value })}
          />
          <small>
            The project’s client Drive folder, with the full-resolution or source files. The client
            opens it beside the deliverable.
          </small>
        </label>
        {upload.error && <FormError>{upload.error.message}</FormError>}
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose} disabled={upload.isPending}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={upload.isPending}>
            {upload.isPending ? "Preparing file…" : "Add deliverable"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
