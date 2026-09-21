"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FormError } from "@/features/shared/form-error";
import { Modal } from "@/features/shared/modal";
import {
  addBriefingAttachment,
  briefingQueryKeys,
  downloadBriefingAttachmentFile,
  findBriefingAttachmentByPath,
  removeBriefingAttachment,
  removeBriefingAttachmentFile,
  uploadBriefingAttachmentFile,
  useBriefingAttachments,
  type BriefingAttachment,
} from "./briefing-data";

const fileTypes: Record<string, string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
};

export function validateAttachment(file: Pick<File, "name" | "type" | "size">) {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!fileTypes[file.type]?.includes(extension))
    throw new Error("Choose a PNG, JPG, WebP, or PDF file.");
  if (file.size > 50 * 1024 * 1024) throw new Error("Each file must be 50 MB or smaller.");
  if (file.size === 0) throw new Error("This file is empty. Choose a different file.");
  return extension;
}

export function BriefingAttachments({
  briefingId,
  editable = false,
}: {
  briefingId: string;
  editable?: boolean;
}) {
  const { database } = useAuth();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = useState<BriefingAttachment | null>(null);
  const attachments = useBriefingAttachments(briefingId);
  const upload = useMutation({
    mutationKey: ["briefing-file", briefingId],
    mutationFn: async (file: File) => {
      const extension = validateAttachment(file);
      const path = `${briefingId}/${crypto.randomUUID()}.${extension}`;
      await uploadBriefingAttachmentFile(database, { path, file });
      try {
        await addBriefingAttachment(database, {
          briefingId,
          name: file.name,
          storagePath: path,
          mimeType: file.type,
          fileSize: file.size,
        });
      } catch (error) {
        const registered = await findBriefingAttachmentByPath(database, { briefingId, path });
        if (!registered.error && registered.data) return;
        if (!registered.error) await removeBriefingAttachmentFile(database, { path });
        throw error;
      }
    },
    // Attaching a file changes only the attachment list: the briefing row itself is untouched, so
    // `briefings` is deliberately not in this set.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [briefingQueryKeys.attachments] }),
  });
  const remove = useMutation({
    mutationKey: ["briefing-file", briefingId],
    mutationFn: async (id: string) => {
      const path = await removeBriefingAttachment(database, { id });
      await removeBriefingAttachmentFile(database, { path });
    },
    onSuccess: () => setRemoving(null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [briefingQueryKeys.attachments] }),
  });
  const download = useMutation({
    mutationFn: async (attachment: BriefingAttachment) => {
      const blob = await downloadBriefingAttachmentFile(database, {
        path: attachment.storage_path,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  return (
    <div className="briefing-attachments">
      <h3>Attachments</h3>
      {attachments.isPending && <p role="status">Loading attachments…</p>}
      {attachments.error && (
        <FormError>
          Attachments could not be loaded.{" "}
          <button className="button quiet" onClick={() => void attachments.refetch()}>
            Try again
          </button>
        </FormError>
      )}
      {attachments.data?.map((file) => (
        <div className="briefing-attachment" key={file.id}>
          <FileText size={17} />
          <button
            className="button quiet"
            onClick={() => download.mutate(file)}
            disabled={download.isPending}
          >
            {file.name}
          </button>
          <span>{Math.max(1, Math.round(file.file_size / 1024))} KB</span>
          {editable && (
            <button
              className="button quiet"
              aria-label={`Remove ${file.name}`}
              disabled={remove.isPending || upload.isPending}
              onClick={() => {
                remove.reset();
                setRemoving(file);
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      ))}
      {!attachments.isPending && !attachments.error && attachments.data?.length === 0 && (
        <p className="briefing-note">No files attached.</p>
      )}
      {editable && (
        <>
          <input
            ref={input}
            className="visually-hidden"
            aria-label="Choose a briefing attachment"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
              event.target.value = "";
            }}
          />
          <button
            className="button"
            disabled={upload.isPending || remove.isPending}
            onClick={() => input.current?.click()}
          >
            <Paperclip size={15} />
            {upload.isPending ? "Uploading…" : "Attach a file"}
          </button>
          <p className="briefing-note">PNG, JPG, WebP or PDF · up to 50 MB each</p>
        </>
      )}
      {(upload.error || remove.error || download.error) && (
        <FormError>
          {upload.error?.message ?? remove.error?.message ?? download.error?.message}
        </FormError>
      )}
      {/* The file leaves both the briefing and storage, and nothing brings it back. */}
      <Modal
        open={!!removing}
        title="Remove this attachment?"
        description={removing ? `${removing.name} will be deleted from this briefing.` : undefined}
        onClose={() => {
          if (!remove.isPending) setRemoving(null);
        }}
      >
        <div className="form-actions">
          <button className="button" onClick={() => setRemoving(null)} disabled={remove.isPending}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => removing && remove.mutate(removing.id)}
            disabled={remove.isPending}
          >
            {remove.isPending ? "Removing…" : "Remove file"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
