"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import {
  findBrandAssetById,
  insertBrandAsset,
  removeBrandAssetFile,
  uploadBrandAssetFile,
} from "./brand-data";
import { brandFileTypes, validateBrandFile, validationMessage } from "./brand-model";
import { FormError } from "@/features/shared/form-error";

/** The dialog that uploads a new brand asset file and its metadata row. */
export function AssetUpload({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { database } = useAuth();
  const queryClient = useQueryClient();
  const formId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fileUploaded, setFileUploaded] = useState(false);
  const [assetId] = useState(() => crypto.randomUUID());
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  const uploaded = useRef<{ file: File; path: string } | null>(null);
  const upload = useMutation({
    mutationFn: async (form: FormData) => {
      if (!file) throw new Error("Choose a brand file to upload.");
      const extension = validateBrandFile(file);
      const name = String(form.get("name") ?? "").trim();
      if (!name) throw new Error("Give the file a clear name.");
      if (!uploaded.current || uploaded.current.file !== file) {
        const path = `${clientId}/${crypto.randomUUID()}.${extension}`;
        await uploadBrandAssetFile(database, { path, file });
        uploaded.current = { file, path };
        setFileUploaded(true);
      }
      const existing = await findBrandAssetById(database, { id: assetId });
      if (!existing)
        await insertBrandAsset(database, {
          id: assetId,
          clientId,
          name,
          category: String(form.get("category")),
          description: String(form.get("description") ?? "").trim(),
          tags: String(form.get("tags") ?? "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 20),
          mimeType: file.type,
          storagePath: uploaded.current.path,
        });
      uploaded.current = null;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["brand-assets"] });
      onClose();
    },
  });
  async function close() {
    if (upload.isPending || closing) return;
    setClosing(true);
    setCloseError("");
    try {
      if (uploaded.current) {
        const existing = await findBrandAssetById(database, { id: assetId });
        if (!existing) await removeBrandAssetFile(database, { path: uploaded.current.path });
        else await queryClient.invalidateQueries({ queryKey: ["brand-assets"] });
      }
      onClose();
    } catch {
      setCloseError("The unfinished upload could not be removed. Please try closing again.");
    } finally {
      setClosing(false);
    }
  }
  return (
    <Modal
      open
      title="Add a brand asset"
      description="Share an approved file with everyone in this workspace."
      onClose={() => void close()}
      footer={
        <>
          <button
            type="button"
            className="button quiet"
            disabled={upload.isPending || closing}
            onClick={() => void close()}
          >
            Cancel
          </button>
          <button
            form={formId}
            className="button primary"
            disabled={upload.isPending || closing}
            type="submit"
          >
            <Upload size={15} />
            {upload.isPending ? "Uploading…" : "Add asset"}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          upload.mutate(new FormData(event.currentTarget));
        }}
      >
        <label>
          File
          <input
            type="file"
            aria-label="File"
            required
            accept={Object.keys(brandFileTypes).join(",")}
            disabled={upload.isPending || fileUploaded}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <span className="form-help">PNG, JPG, WebP, SVG, or PDF. Up to 50 MB.</span>
        </label>
        <label>
          Asset name
          <input
            name="name"
            required
            maxLength={300}
            placeholder="Primary logo — light background"
          />
        </label>
        <label>
          Category
          <select name="category" defaultValue="Logo">
            {["Logo", "Photography", "Product", "Document", "Other"].map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          Description
          <textarea
            name="description"
            maxLength={3000}
            placeholder="When and how to use this asset."
          />
        </label>
        <label>
          Tags
          <input name="tags" maxLength={500} placeholder="Primary, approved, print" />
          <span className="form-help">Separate tags with commas.</span>
        </label>
        {(upload.error || closeError) && (
          <FormError>{closeError || validationMessage(upload.error)}</FormError>
        )}
      </form>
    </Modal>
  );
}
