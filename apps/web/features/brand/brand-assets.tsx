"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, FileText, ImageIcon, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { AssetUpload } from "./brand-asset-upload";
import {
  downloadBrandAssetFile,
  useBrandAssetPreviewUrl,
  useBrandAssets,
  type BrandAsset,
} from "./brand-data";
import { brandFileTypes, matchesBrandSearch, validationMessage } from "./brand-model";
import { CopyButton } from "@/features/shared/copy-button";
import { FormError } from "@/features/shared/form-error";
import { SearchField } from "@/features/shared/search-field";

function AssetPreview({ asset }: { asset: BrandAsset }) {
  const canPreview =
    !!asset.storage_path &&
    ["image/png", "image/jpeg", "image/webp"].includes(asset.mime_type ?? "");
  const preview = useBrandAssetPreviewUrl(asset.id, asset.storage_path, canPreview);
  return (
    <div className="brand-asset-preview">
      {preview.data ? (
        // Keep expiring, caller-scoped signed URLs out of Next.js's shared image optimization cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.data} alt={asset.name} loading="lazy" />
      ) : (
        <>
          <FileText size={30} />
          <span>
            {preview.isFetching
              ? "Loading preview…"
              : asset.mime_type === "application/pdf"
                ? "PDF document"
                : asset.mime_type === "image/svg+xml"
                  ? "SVG asset"
                  : "Brand resource"}
          </span>
        </>
      )}
    </div>
  );
}

export function BrandAssets({ clientId }: { clientId: string }) {
  const { database, profile } = useAuth();
  const params = useSearchParams();
  const assets = useBrandAssets(clientId);
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("asset"));
  const selected = assets.data?.find((asset) => asset.id === selectedId);
  const categories = Array.from(
    new Set([
      "Logo",
      "Photography",
      "Product",
      "Document",
      "Other",
      ...(assets.data ?? []).map((asset) => asset.category),
    ]),
  ).sort();
  const filtered = (assets.data ?? []).filter((asset) =>
    matchesBrandSearch(asset, search, category),
  );
  const download = useMutation({
    mutationFn: async (asset: BrandAsset) => {
      if (!asset.storage_path) throw new Error("This asset does not have a downloadable file yet.");
      const blob = await downloadBrandAssetFile(database, { path: asset.storage_path });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${asset.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")}.${brandFileTypes[asset.mime_type ?? ""] ?? "bin"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
  });
  if (assets.isPending) return <p role="status">Finding your brand files…</p>;
  if (assets.error)
    return (
      <div className="empty-state">
        <h3>We couldn’t load the assets.</h3>
        <button className="button" onClick={() => void assets.refetch()}>
          Try again
        </button>
      </div>
    );
  return (
    <>
      <div className="brand-resource-toolbar">
        <SearchField
          label="Search brand assets"
          value={search}
          onChange={setSearch}
          placeholder="Find a brand asset…"
          iconSize={15}
        />
        <label>
          <span className="visually-hidden">Asset category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {profile?.role === "agency" && (
          <button className="button primary" onClick={() => setUploadOpen(true)}>
            <Plus size={15} />
            Add asset
          </button>
        )}
      </div>
      {filtered.length ? (
        <div className="brand-assets-grid">
          {filtered.map((asset) => (
            <button
              className="brand-asset-card"
              key={asset.id}
              onClick={() => setSelectedId(asset.id)}
            >
              <AssetPreview asset={asset} />
              <div>
                <span className="eyebrow">{asset.category}</span>
                <h3>{asset.name}</h3>
                <p>{asset.description}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ImageIcon size={26} />
          <h3>{assets.data?.length ? "No matching assets." : "A place for the essentials."}</h3>
          <p>
            {assets.data?.length
              ? "Try another search or clear the category."
              : "Approved brand files will appear here."}
          </p>
          {(search || category) && (
            <button
              className="button"
              onClick={() => {
                setSearch("");
                setCategory("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      {uploadOpen && <AssetUpload clientId={clientId} onClose={() => setUploadOpen(false)} />}
      {selected && (
        <Modal
          open
          title={selected.name}
          description={selected.description || undefined}
          onClose={() => {
            setSelectedId(null);
            download.reset();
          }}
          footer={
            <>
              <CopyButton
                label="Copy reference"
                text={
                  typeof window === "undefined"
                    ? ""
                    : `${window.location.origin}/clients/${clientId}/brand/assets?asset=${selected.id}`
                }
              />
              <button
                className="button primary"
                disabled={!selected.storage_path || download.isPending}
                onClick={() => download.mutate(selected)}
              >
                <Download size={15} />
                {download.isPending ? "Downloading…" : "Download file"}
              </button>
            </>
          }
        >
          <AssetPreview asset={selected} />
          <div className="brand-tags">
            <span>{selected.category}</span>
            {selected.tags.map((tag, i) => (
              <span key={i}>{tag}</span>
            ))}
          </div>
          {!selected.storage_path && (
            <p className="form-help">A downloadable file has not been attached yet.</p>
          )}
          {download.error && <FormError>{validationMessage(download.error)}</FormError>}
        </Modal>
      )}
    </>
  );
}
