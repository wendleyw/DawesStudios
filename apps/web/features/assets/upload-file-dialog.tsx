"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { prepareDelivery } from "@/features/projects/media-client";
import { FormError } from "@/features/shared/form-error";
import {
  findAssetByStoragePath,
  recordProjectAsset,
  removeUnusedUpload,
  uploadInternalAsset,
  useInvalidateAssets,
} from "./asset-data";

const formats: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
type PreparedFile = { path: string; mime: string; size: number };

export function UploadFileDialog({
  kind,
  projects,
  initialProject,
  onClose,
}: {
  kind: "working" | "delivery";
  projects: { id: string; title: string }[];
  initialProject: string;
  onClose: () => void;
}) {
  const { database, mediaUrl } = useAuth();
  const invalidateAssets = useInvalidateAssets();
  const [projectId, setProjectId] = useState(initialProject);
  const [prepared, setPrepared] = useState<PreparedFile | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  async function close() {
    if (upload.isPending || closing) return;
    setClosing(true);
    setCloseError("");
    try {
      if (prepared) {
        const existing = await findAssetByStoragePath(database, { path: prepared.path });
        if (!existing.length) await removeUnusedUpload(database, { path: prepared.path });
      }
      onClose();
    } catch {
      setCloseError("The unfinished upload could not be removed. Please try closing again.");
    } finally {
      setClosing(false);
    }
  }
  const upload = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name")).trim();
      const file = form.get("file");
      if (!projects.some((project) => project.id === projectId))
        throw new Error("Choose a project.");
      if (!name) throw new Error("Add a file name.");
      let asset = prepared;
      if (!asset) {
        if (!(file instanceof File) || !file.size) throw new Error("Choose a file.");
        if (!(file.type in formats)) throw new Error("Choose a PNG, JPG, WebP, or PDF file.");
        if (file.size > 50 * 1024 * 1024) throw new Error("Choose a file smaller than 50 MB.");
        if (kind === "delivery") {
          await prepareDelivery(database, mediaUrl, projectId, file, name);
          return;
        } else {
          const path = `${projectId}/${crypto.randomUUID()}.${formats[file.type]}`;
          await uploadInternalAsset(database, { path, file });
          asset = { path, mime: file.type, size: file.size };
        }
        setPrepared(asset);
      }
      const existing = await findAssetByStoragePath(database, { path: asset.path });
      if (!existing.length)
        await recordProjectAsset(database, {
          projectId,
          name,
          path: asset.path,
          mime: asset.mime,
          size: asset.size,
        });
    },
    onSuccess: async () => {
      // `assetQueryKeys` is the single `assets` key this call already invalidated, so the helper
      // covers exactly this set and nothing more.
      await invalidateAssets();
      onClose();
    },
  });

  return (
    <Modal
      open
      title={kind === "delivery" ? "Add a delivery file" : "Add a working file"}
      onClose={() => void close()}
      description={
        kind === "delivery"
          ? "Share a final image or PDF with the client."
          : "Keep source files available to the studio team."
      }
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
            disabled={!!prepared || upload.isPending}
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
          <input
            name="name"
            required
            maxLength={240}
            placeholder={
              kind === "delivery" ? "Approved campaign — print PDF" : "Reference artwork"
            }
          />
        </label>
        <label>
          File
          <input
            type="file"
            name="file"
            aria-label="File"
            accept={Object.keys(formats).join(",")}
            required={!prepared}
            disabled={!!prepared || upload.isPending}
          />
          <small>PNG, JPG, WebP, or PDF · up to 50 MB</small>
        </label>
        {(upload.error || closeError) && (
          <FormError>{closeError || upload.error?.message}</FormError>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button"
            onClick={() => void close()}
            disabled={upload.isPending || closing}
          >
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={upload.isPending}>
            {upload.isPending ? "Preparing file…" : "Add file"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
