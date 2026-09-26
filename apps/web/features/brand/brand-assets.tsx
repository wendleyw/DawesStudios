"use client";

import { useMutation } from "@tanstack/react-query";
import {
  Download,
  FileText,
  Folder,
  FolderPlus,
  ImageIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { BrandFolderDialog } from "./brand-folder-dialog";
import { BrandAssetFolderPicker } from "./brand-asset-folder-picker";
import { AssetUpload } from "./brand-asset-upload";
import { BrandProducts } from "./brand-products";
import {
  downloadBrandAssetFile,
  useBrandAssetPreviewUrl,
  useBrandAssets,
  useBrandAssetFolders,
  type BrandAsset,
} from "./brand-data";
import { saveBlob } from "@/features/shared/save-blob";
import { brandFileTypes, matchesBrandSearch, readProducts, validationMessage } from "./brand-model";
import type { Json } from "@database";
import { CopyButton } from "@/features/shared/copy-button";
import { FormError } from "@/features/shared/form-error";
import { SearchField } from "@/features/shared/search-field";

/**
 * A brand asset's preview: raster images as signed previews, anything else as a labelled icon.
 * `decorative` leaves the image without alternative text where the asset's name is printed beside it.
 */
export function AssetPreview({
  asset,
  decorative = false,
}: {
  asset: BrandAsset;
  decorative?: boolean;
}) {
  const canPreview =
    !!asset.storage_path &&
    ["image/png", "image/jpeg", "image/webp"].includes(asset.mime_type ?? "");
  const preview = useBrandAssetPreviewUrl(asset.id, asset.storage_path, canPreview);
  return (
    <div className="brand-asset-preview">
      {preview.data ? (
        // Keep expiring, caller-scoped signed URLs out of Next.js's shared image optimization cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.data} alt={decorative ? "" : asset.name} loading="lazy" />
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

/**
 * Brand Hub Assets: the client's brand files in folders, with Products as one more entry in the
 * folder list rather than a block above every folder. The agency manages everything; a client may
 * also create folders and add images; designers browse.
 */
export function BrandAssets({
  clientId,
  products,
  onEditProducts,
}: {
  clientId: string;
  /** The Products section's content, shown when its entry is chosen. */
  products?: Json;
  /** Present for the agency, who edits the products. */
  onEditProducts?: () => void;
}) {
  const { database, profile } = useAuth();
  const params = useSearchParams();
  const assets = useBrandAssets(clientId);
  const folders = useBrandAssetFolders(clientId);
  const [selectedFolderId, setFolderId] = useState("all");
  const [folderAction, setFolderAction] = useState<"new" | "rename" | "delete" | null>(null);
  const currentFolder = folders.data?.find((folder) => folder.id === selectedFolderId);
  // A folder deleted by another viewer must not leave an invisible, stale filter active.
  const productCount = readProducts(products).length;
  // Readers only see the entry when there is something in it; the agency always does, to add one.
  const showProducts = productCount > 0 || !!onEditProducts;
  const folderId =
    currentFolder?.id ??
    (selectedFolderId === "unfiled" || (selectedFolderId === "products" && showProducts)
      ? selectedFolderId
      : "all");
  const canManage = profile?.role === "agency";
  const canContribute = canManage || profile?.role === "client";
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
  const filtered = (assets.data ?? []).filter(
    (asset) =>
      matchesBrandSearch(asset, search, category) &&
      (folderId === "all" || (asset.folder_id ?? "unfiled") === folderId),
  );
  const download = useMutation({
    mutationFn: async (asset: BrandAsset) => {
      if (!asset.storage_path) throw new Error("This asset does not have a downloadable file yet.");
      const blob = await downloadBrandAssetFile(database, { path: asset.storage_path });
      saveBlob(blob, `${asset.name}.${brandFileTypes[asset.mime_type ?? ""] ?? "bin"}`, {
        revokeAfterMs: 30_000,
      });
    },
  });
  if (assets.isPending || folders.isPending) return <p role="status">Loading brand files…</p>;
  if (assets.error || folders.error)
    return (
      <div className="empty-state">
        <h3>We couldn’t load the assets.</h3>
        <button
          className="button"
          onClick={() => {
            void assets.refetch();
            void folders.refetch();
          }}
        >
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
        {canContribute && (
          <>
            <button className="button" onClick={() => setFolderAction("new")}>
              <FolderPlus size={15} />
              New folder
            </button>
            <button className="button primary" onClick={() => setUploadOpen(true)}>
              <Plus size={15} />
              {canManage ? "Add asset" : "Add image"}
            </button>
          </>
        )}
      </div>
      <nav className="brand-folder-list" aria-label="Asset folders">
        {[
          { id: "all", name: "All assets" },
          ...(showProducts ? [{ id: "products", name: "Products" }] : []),
          { id: "unfiled", name: "Unfiled" },
          ...(folders.data ?? []),
        ].map((folder) => (
          <button
            key={folder.id}
            className={folderId === folder.id ? "active" : ""}
            aria-pressed={folderId === folder.id}
            onClick={() => {
              setFolderId(folder.id);
              setFolderAction(null);
            }}
          >
            <Folder size={16} />
            <span>{folder.name}</span>{" "}
            <small>
              {folder.id === "products"
                ? productCount
                : (assets.data ?? []).filter(
                    (asset) => folder.id === "all" || (asset.folder_id ?? "unfiled") === folder.id,
                  ).length}
            </small>
          </button>
        ))}
      </nav>
      {folderId === "products" ? (
        <BrandProducts clientId={clientId} content={products} onEdit={onEditProducts} />
      ) : (
        <>
          <div className="brand-folder-heading">
            <p>
              {currentFolder?.name ?? (folderId === "unfiled" ? "Unfiled" : "All assets")}
              <span>
                {filtered.length} asset{filtered.length === 1 ? "" : "s"}
              </span>
            </p>
            {canManage && currentFolder && (
              <div>
                <button
                  className="icon-button"
                  aria-label="Rename folder"
                  title="Rename folder"
                  onClick={() => setFolderAction("rename")}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Delete folder"
                  title="Delete folder"
                  onClick={() => setFolderAction("delete")}
                >
                  <Trash2 size={15} />
                </button>
              </div>
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
              <h3>
                {currentFolder && !search && !category
                  ? "This folder is empty."
                  : assets.data?.length
                    ? "No matching assets."
                    : "A place for the essentials."}
              </h3>
              <p>
                {assets.data?.length
                  ? "Try another folder or clear the filters."
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
        </>
      )}
      {folderAction && (folderAction === "new" || currentFolder) && (
        <BrandFolderDialog
          clientId={clientId}
          folder={folderAction === "new" ? undefined : currentFolder}
          deleting={folderAction === "delete"}
          onClose={() => setFolderAction(null)}
          onSaved={(id) => setFolderId(id ?? "unfiled")}
        />
      )}
      {uploadOpen && (
        <AssetUpload
          clientId={clientId}
          folders={folders.data ?? []}
          folderId={currentFolder?.id ?? null}
          imagesOnly={!canManage}
          onClose={() => setUploadOpen(false)}
        />
      )}
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
          {canManage ? (
            <BrandAssetFolderPicker
              key={selected.id}
              asset={selected}
              folders={folders.data ?? []}
            />
          ) : (
            <p className="form-help">
              Folder:{" "}
              {folders.data?.find((folder) => folder.id === selected.folder_id)?.name ?? "Unfiled"}
            </p>
          )}
          {!selected.storage_path && (
            <p className="form-help">A downloadable file has not been attached yet.</p>
          )}
          {download.error && <FormError>{validationMessage(download.error)}</FormError>}
        </Modal>
      )}
    </>
  );
}
