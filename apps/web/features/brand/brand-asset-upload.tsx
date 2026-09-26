"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import {
  brandQueryKeys,
  type BrandAssetFolder,
  findBrandAssetById,
  insertBrandAsset,
  removeBrandAssetFile,
  uploadBrandAssetFile,
} from "./brand-data";
import { folderOptions, validateBrandFile, validationMessage } from "./brand-model";
import { FormError } from "@/features/shared/form-error";
import {
  brandUploadMimes,
  clientBrandUploadMimes,
  uploadExtensionMap,
  uploadLimitMb,
  uploadTypesLabel,
} from "@/features/shared/upload-rules";

/**
 * The dialog that uploads a new brand asset file and its metadata row. A client adds raster images
 * only; the database enforces the same rule.
 */
export function AssetUpload({
  clientId,
  folderId,
  folders,
  imagesOnly = false,
  onClose,
}: {
  clientId: string;
  folderId: string | null;
  folders: BrandAssetFolder[];
  imagesOnly?: boolean;
  onClose: () => void;
}) {
  const allowed = imagesOnly ? clientBrandUploadMimes : brandUploadMimes;
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
      const extension = validateBrandFile(file, allowed);
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
          folderId: String(form.get("folder") ?? "") || null,
        });
      uploaded.current = null;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [brandQueryKeys.assets] });
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
        else await queryClient.invalidateQueries({ queryKey: [brandQueryKeys.assets] });
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
      title={imagesOnly ? "Add an image" : "Add a brand asset"}
      description={
        imagesOnly
          ? "Share an image with the studio and everyone working on your brand."
          : "Share an approved file with everyone working with this client."
      }
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
            accept={Object.keys(uploadExtensionMap(allowed)).join(",")}
            disabled={upload.isPending || fileUploaded}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <span className="form-help">
            {uploadTypesLabel(allowed)}. Up to {uploadLimitMb()} MB.
          </span>
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
          <select name="category" defaultValue={imagesOnly ? "Photography" : "Logo"}>
            {["Logo", "Photography", "Product", "Document", "Other"].map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          Folder
          <select name="folder" defaultValue={folderId ?? ""} disabled={upload.isPending}>
            <option value="">Assets (top level)</option>
            {folderOptions(folders).map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.label}
              </option>
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
