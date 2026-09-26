"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { useId, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FormError } from "@/features/shared/form-error";
import { Modal } from "@/features/shared/modal";
import {
  brandQueryKeys,
  findBrandAssetById,
  insertBrandLink,
  type BrandAssetFolder,
} from "./brand-data";
import { folderOptions, safeHttpsUrl, validationMessage } from "./brand-model";

/**
 * Adds a link to the Assets directory: a name and a complete HTTPS address, filed in a folder like
 * any image. The id is fixed when the dialog opens, so a retry after a lost response never adds
 * the link twice.
 */
export function BrandLinkDialog({
  clientId,
  folderId,
  folders,
  onClose,
}: {
  clientId: string;
  folderId: string | null;
  folders: BrandAssetFolder[];
  onClose: () => void;
}) {
  const { database } = useAuth();
  const cache = useQueryClient();
  const formId = useId();
  const [id] = useState(() => crypto.randomUUID());
  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name") ?? "").trim();
      if (!name) throw new Error("Give the link a clear name.");
      const url = safeHttpsUrl(String(form.get("url") ?? "").trim());
      if (!url) throw new Error("Use a complete HTTPS address, such as https://example.com.");
      if (await findBrandAssetById(database, { id })) return;
      await insertBrandLink(database, {
        id,
        clientId,
        name,
        url,
        description: String(form.get("description") ?? "").trim(),
        folderId: String(form.get("folder") ?? "") || null,
      });
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: [brandQueryKeys.assets] });
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Add a link"
      description="Point everyone to a page, a drive or a reference that lives elsewhere."
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
            <Link2 size={15} />
            {save.isPending ? "Adding…" : "Add link"}
          </button>
        </>
      }
    >
      <form
        id={formId}
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(new FormData(event.currentTarget));
        }}
      >
        <label>
          Name
          <input name="name" required maxLength={300} placeholder="Brand portal" />
        </label>
        <label>
          Address
          <input
            name="url"
            type="url"
            required
            maxLength={2000}
            placeholder="https://example.com"
            inputMode="url"
          />
        </label>
        <label>
          Folder
          <select name="folder" defaultValue={folderId ?? ""} disabled={save.isPending}>
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
            placeholder="What it is and when to use it."
          />
        </label>
        {save.error && <FormError>{validationMessage(save.error)}</FormError>}
      </form>
    </Modal>
  );
}
