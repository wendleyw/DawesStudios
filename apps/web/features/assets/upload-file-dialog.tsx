"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { prepareDelivery } from "@/features/projects/media-client";
import { assertResult } from "@/lib/supabase";
import { FormError } from "@/features/shared/form-error";

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
  const queryClient = useQueryClient();
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
        const existing = assertResult(
          await database.from("project_assets").select("id").eq("storage_path", prepared.path),
        );
        if (!existing.length)
          assertResult(await database.storage.from("internal-assets").remove([prepared.path]));
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
          assertResult(
            await database.storage
              .from("internal-assets")
              .upload(path, file, { contentType: file.type, upsert: false }),
          );
          asset = { path, mime: file.type, size: file.size };
        }
        setPrepared(asset);
      }
      const existing = assertResult(
        await database.from("project_assets").select("id").eq("storage_path", asset.path),
      );
      if (!existing.length)
        assertResult(
          await database.from("project_assets").insert({
            project_id: projectId,
            name,
            storage_path: asset.path,
            mime_type: asset.mime,
            file_size: asset.size,
          }),
        );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
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
