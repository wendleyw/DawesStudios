"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { FormError } from "@/features/shared/form-error";
import {
  brandQueryKeys,
  moveBrandAsset,
  type BrandAsset,
  type BrandAssetFolder,
} from "./brand-data";
import { folderOptions } from "./brand-model";

export function BrandAssetFolderPicker({
  asset,
  folders,
}: {
  asset: BrandAsset;
  folders: BrandAssetFolder[];
}) {
  const { database } = useAuth();
  const cache = useQueryClient();
  const [destination, setDestination] = useState<string | null>(null);
  const requestedFolder = destination ?? asset.folder_id ?? "";
  const folderId = folders.some((folder) => folder.id === requestedFolder) ? requestedFolder : "";
  const move = useMutation({
    mutationFn: (folderId: string) =>
      moveBrandAsset(database, {
        id: asset.id,
        clientId: asset.client_id,
        folderId: folderId || null,
      }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: [brandQueryKeys.assets] });
      setDestination(null);
    },
  });
  return (
    <form
      className="brand-asset-folder-picker"
      onSubmit={(event) => {
        event.preventDefault();
        move.mutate(folderId);
      }}
    >
      <label>
        Folder
        <select
          value={folderId}
          onChange={(event) => {
            setDestination(event.target.value);
            move.reset();
          }}
          disabled={move.isPending}
        >
          <option value="">Assets (top level)</option>
          {folderOptions(folders).map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="button"
        disabled={move.isPending || folderId === (asset.folder_id ?? "")}
      >
        {move.isPending ? "Moving…" : "Move asset"}
      </button>
      {move.isSuccess && (
        <p className="form-help" role="status">
          Asset moved.
        </p>
      )}
      {move.error && <FormError>{move.error.message}</FormError>}
    </form>
  );
}
