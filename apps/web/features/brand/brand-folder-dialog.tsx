"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { FormError } from "@/features/shared/form-error";
import {
  brandQueryKeys,
  createBrandAssetFolder,
  deleteBrandAssetFolder,
  findBrandAssetFolder,
  renameBrandAssetFolder,
  type BrandAssetFolder,
} from "./brand-data";

/** Creates a folder inside `parentId` (the top level when null), or renames or deletes `folder`. */
export function BrandFolderDialog({
  clientId,
  folder,
  parentId = null,
  parentName = "Assets",
  deleting = false,
  onClose,
  onSaved,
}: {
  clientId: string;
  folder?: BrandAssetFolder;
  parentId?: string | null;
  /** Where a deleted folder's contents go, or where a new folder is created. */
  parentName?: string;
  deleting?: boolean;
  onClose: () => void;
  onSaved: (id: string | null) => void;
}) {
  const { database } = useAuth();
  const cache = useQueryClient();
  const formId = useId();
  const [id] = useState(() => folder?.id ?? crypto.randomUUID());
  const [name, setName] = useState(folder?.name ?? "");
  const title = deleting ? "Delete folder" : folder ? "Rename folder" : "New folder";
  const save = useMutation({
    mutationFn: async () => {
      if (deleting) {
        await deleteBrandAssetFolder(database, { id, clientId });
        return null;
      }
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 80)
        throw new Error("Use a folder name between 1 and 80 characters.");
      if (folder) await renameBrandAssetFolder(database, { id, clientId, name: trimmed });
      else {
        const existing = await findBrandAssetFolder(database, { id, clientId });
        if (existing && existing.name !== trimmed)
          await renameBrandAssetFolder(database, { id, clientId, name: trimmed });
        else if (!existing)
          await createBrandAssetFolder(database, { id, clientId, name: trimmed, parentId });
      }
      return id;
    },
    onSuccess: async (savedId) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: [brandQueryKeys.folders] }),
        cache.invalidateQueries({ queryKey: [brandQueryKeys.assets] }),
      ]);
      onSaved(savedId);
      onClose();
    },
  });
  const error = save.error;
  return (
    <Modal
      open
      title={title}
      closeDisabled={save.isPending}
      onClose={() => {
        if (!save.isPending) onClose();
      }}
      footer={
        <>
          <button className="button quiet" disabled={save.isPending} onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" form={formId} type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : deleting ? "Delete folder" : "Save folder"}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {deleting ? (
          <p>
            Delete “{folder?.name}”? Its folders and assets move to {parentName}. No files will be
            deleted.
          </p>
        ) : (
          <label>
            {!folder && <span className="form-help">In {parentName}</span>}
            Folder name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
              disabled={save.isPending}
              placeholder="e.g. Campaign photography"
            />
          </label>
        )}
        {error && (
          <FormError>
            {/brand_asset_folders_(client|sibling)_name|duplicate key/.test(error.message)
              ? deleting
                ? `${parentName} already has a folder with the same name as one inside this folder. Rename it first.`
                : "A folder with this name already exists here."
              : error.message}
          </FormError>
        )}
      </form>
    </Modal>
  );
}
