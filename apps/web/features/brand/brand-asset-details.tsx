"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { FormError } from "@/features/shared/form-error";
import { brandQueryKeys, updateBrandAssetDetails, type BrandAsset } from "./brand-data";
import { assetCategories, isLinkAsset, validationMessage } from "./brand-model";

/**
 * The agency's details for one asset — name, category, description and tags — edited from the
 * asset's own dialog. A drop files an asset with only a name and a category, so this is where the
 * rest is added, one asset at a time.
 */
export function BrandAssetDetails({ asset, onDone }: { asset: BrandAsset; onDone: () => void }) {
  const { database } = useAuth();
  const cache = useQueryClient();
  const [name, setName] = useState(asset.name);
  const [category, setCategory] = useState(asset.category);
  const [description, setDescription] = useState(asset.description);
  const [tags, setTags] = useState(asset.tags.join(", "));
  const link = isLinkAsset(asset);
  const categories: string[] = link
    ? ["Link"]
    : Array.from(new Set<string>([...assetCategories, asset.category]));
  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Give the asset a clear name.");
      await updateBrandAssetDetails(database, {
        id: asset.id,
        clientId: asset.client_id,
        name: trimmed.slice(0, 300),
        category,
        description: description.trim().slice(0, 3000),
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 20),
      });
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: [brandQueryKeys.assets] });
      onDone();
    },
  });
  return (
    <form
      className="form-stack brand-asset-details"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Asset name
        <input
          value={name}
          required
          maxLength={300}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {!link && (
        <label>
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        Description
        <textarea
          value={description}
          maxLength={3000}
          placeholder="When and how to use this asset."
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <label>
        Tags
        <input
          value={tags}
          maxLength={500}
          placeholder="Primary, approved, print"
          onChange={(event) => setTags(event.target.value)}
        />
        <span className="form-help">Separate tags with commas.</span>
      </label>
      {save.error && <FormError>{validationMessage(save.error)}</FormError>}
      <div className="form-actions">
        <button type="button" className="button quiet" disabled={save.isPending} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="button primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save details"}
        </button>
      </div>
    </form>
  );
}
