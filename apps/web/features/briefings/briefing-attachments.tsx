"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Paperclip, X } from "lucide-react";
import { useRef } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { assertResult } from "@/lib/supabase";
import { FormError } from "@/features/shared/form-error";

type Attachment = {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
};
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
  const { database, session } = useAuth();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const attachments = useQuery({
    queryKey: ["briefing-attachments", session?.user.id, briefingId],
    enabled: !!session,
    queryFn: async () =>
      assertResult(
        await database
          .from("briefing_attachments")
          .select("id,name,storage_path,mime_type,file_size")
          .eq("briefing_id", briefingId)
          .order("created_at"),
      ) as Attachment[],
  });
  const upload = useMutation({
    mutationKey: ["briefing-file", briefingId],
    mutationFn: async (file: File) => {
      const extension = validateAttachment(file);
      const path = `${briefingId}/${crypto.randomUUID()}.${extension}`;
      assertResult(
        await database.storage
          .from("briefing-files")
          .upload(path, file, { contentType: file.type, upsert: false }),
      );
      try {
        assertResult(
          await database.rpc("add_briefing_attachment", {
            p_briefing_id: briefingId,
            p_name: file.name,
            p_storage_path: path,
            p_mime_type: file.type,
            p_file_size: file.size,
          }),
        );
      } catch (error) {
        const registered = await database
          .from("briefing_attachments")
          .select("id")
          .eq("briefing_id", briefingId)
          .eq("storage_path", path)
          .maybeSingle();
        if (!registered.error && registered.data) return;
        if (!registered.error) await database.storage.from("briefing-files").remove([path]);
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["briefing-attachments"] }),
  });
  const remove = useMutation({
    mutationKey: ["briefing-file", briefingId],
    mutationFn: async (id: string) => {
      const path = assertResult(
        await database.rpc("remove_briefing_attachment", { p_attachment_id: id }),
      ) as string;
      assertResult(await database.storage.from("briefing-files").remove([path]));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["briefing-attachments"] }),
  });
  const download = useMutation({
    mutationFn: async (attachment: Attachment) => {
      const blob = assertResult(
        await database.storage.from("briefing-files").download(attachment.storage_path),
      );
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
              onClick={() => remove.mutate(file.id)}
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
    </div>
  );
}
