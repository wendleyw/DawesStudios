"use client";

import { useMutation } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronRight,
  Download,
  FolderPlus,
  ImageIcon,
  Link2,
  Package,
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
import { AssetPreview } from "./brand-asset-preview";
import { BrandLinkDialog } from "./brand-link-dialog";
import { FolderTile } from "@/features/shared/folder-tile";
import {
  downloadBrandAssetFile,
  useBrandAssets,
  useBrandAssetFolders,
  type BrandAsset,
} from "./brand-data";
import { saveBlob } from "@/features/shared/save-blob";
import {
  brandFileTypes,
  childFolders,
  folderAssetCount,
  folderPath,
  matchesBrandSearch,
  readProducts,
  safeHttpsUrl,
  validationMessage,
} from "./brand-model";
import type { Json } from "@database";
import { CopyButton } from "@/features/shared/copy-button";
import { FormError } from "@/features/shared/form-error";
import { SearchField } from "@/features/shared/search-field";

/**
 * Brand Hub Assets as a directory: folders nest inside folders, a path leads back up, and each level
 * lists its folders before its files and links. Products is a fixed entry at the top level. A
 * search looks through every folder at once. The agency manages everything; a client may also
 * create folders and add images and links; designers browse.
 */
export function BrandAssets({
  clientId,
  products,
  onEditProducts,
}: {
  clientId: string;
  /** The Products section's content, shown when its entry is opened. */
  products?: Json;
  /** Present for the agency, who edits the products. */
  onEditProducts?: () => void;
}) {
  const { database, profile } = useAuth();
  const params = useSearchParams();
  const assets = useBrandAssets(clientId);
  const folders = useBrandAssetFolders(clientId);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [folderAction, setFolderAction] = useState<"new" | "rename" | "delete" | null>(null);
  const [adding, setAdding] = useState<"file" | "link" | null>(null);
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(params.get("asset"));
  const allFolders = folders.data ?? [];
  const allAssets = assets.data ?? [];
  const productCount = readProducts(products).length;
  // Readers only see Products when there is something in it; the agency always does, to add one.
  const showProducts = productCount > 0 || !!onEditProducts;
  const inProducts = openFolderId === "products" && showProducts;
  // A folder removed by another viewer must not leave the directory pointing at nothing.
  const current = allFolders.find((folder) => folder.id === openFolderId) ?? null;
  const path = folderPath(allFolders, current?.id ?? null);
  const parent = path.at(-2) ?? null;
  const canManage = profile?.role === "agency";
  const canContribute = canManage || profile?.role === "client";
  const searching = !!search.trim() || !!category;
  const selected = allAssets.find((asset) => asset.id === selectedId);
  const categories = Array.from(
    new Set([
      "Logo",
      "Photography",
      "Product",
      "Document",
      "Link",
      "Other",
      ...allAssets.map((asset) => asset.category),
    ]),
  ).sort();
  const subfolders = searching || inProducts ? [] : childFolders(allFolders, current?.id ?? null);
  const items = searching
    ? allAssets.filter((asset) => matchesBrandSearch(asset, search, category))
    : allAssets.filter((asset) => (asset.folder_id ?? null) === (current?.id ?? null));
  const download = useMutation({
    mutationFn: async (asset: BrandAsset) => {
      if (!asset.storage_path) throw new Error("This asset does not have a downloadable file yet.");
      const blob = await downloadBrandAssetFile(database, { path: asset.storage_path });
      saveBlob(blob, `${asset.name}.${brandFileTypes[asset.mime_type ?? ""] ?? "bin"}`, {
        revokeAfterMs: 30_000,
      });
    },
  });
  const open = (id: string | null) => {
    setOpenFolderId(id);
    setFolderAction(null);
  };
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
  const selectedLink = selected ? safeHttpsUrl(selected.link_url ?? "") : null;
  return (
    <>
      <div className="brand-resource-toolbar">
        <SearchField
          label="Search brand assets"
          value={search}
          onChange={setSearch}
          placeholder="Search every folder…"
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
        {canContribute && !inProducts && (
          <div className="brand-resource-actions">
            <button className="button" onClick={() => setFolderAction("new")}>
              <FolderPlus size={15} />
              New folder
            </button>
            <button className="button" onClick={() => setAdding("link")}>
              <Link2 size={15} />
              Add link
            </button>
            <button className="button primary" onClick={() => setAdding("file")}>
              <Plus size={15} />
              {canManage ? "Add asset" : "Add image"}
            </button>
          </div>
        )}
      </div>
      {/* The section title already says Assets, so the path only appears once there is a way up. */}
      {(searching || current || inProducts) && (
        <div className="brand-directory-heading">
          {searching ? (
            <p className="brand-directory-path">
              <span aria-current="page">Search results</span>
              <small>
                {items.length} asset{items.length === 1 ? "" : "s"}
              </small>
            </p>
          ) : (
            <nav className="brand-directory-path" aria-label="Folder path">
              {current || inProducts ? (
                <button type="button" onClick={() => open(null)}>
                  Assets
                </button>
              ) : (
                <span aria-current="page">Assets</span>
              )}
              {inProducts && (
                <>
                  <ChevronRight size={14} aria-hidden="true" />
                  <span aria-current="page">Products</span>
                </>
              )}
              {path.map((folder, index) => (
                <span key={folder.id} className="brand-directory-step">
                  <ChevronRight size={14} aria-hidden="true" />
                  {index === path.length - 1 ? (
                    <span aria-current="page">{folder.name}</span>
                  ) : (
                    <button type="button" onClick={() => open(folder.id)}>
                      {folder.name}
                    </button>
                  )}
                </span>
              ))}
            </nav>
          )}
          {canManage && current && !searching && (
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
      )}
      {inProducts && !searching ? (
        <BrandProducts clientId={clientId} content={products} onEdit={onEditProducts} />
      ) : (
        <>
          {(subfolders.length > 0 || (showProducts && !current && !searching)) && (
            <div className="folder-tiles brand-folder-tiles" aria-label="Folders" role="list">
              {showProducts && !current && !searching && (
                <div role="listitem">
                  <FolderTile
                    name="Products"
                    meta={`${productCount} product${productCount === 1 ? "" : "s"}`}
                    icon={<Package size={20} aria-hidden="true" />}
                    onOpen={() => open("products")}
                  />
                </div>
              )}
              {subfolders.map((folder) => {
                const count = folderAssetCount(allFolders, allAssets, folder.id);
                return (
                  <div role="listitem" key={folder.id}>
                    <FolderTile
                      name={folder.name}
                      meta={`${count} asset${count === 1 ? "" : "s"}`}
                      onOpen={() => open(folder.id)}
                    />
                  </div>
                );
              })}
            </div>
          )}
          {items.length ? (
            <div className="brand-assets-grid">
              {items.map((asset) => (
                <button
                  className="brand-asset-card"
                  key={asset.id}
                  onClick={() => setSelectedId(asset.id)}
                >
                  <AssetPreview asset={asset} />
                  <div>
                    <span className="eyebrow">{asset.category}</span>
                    <h3>{asset.name}</h3>
                    {asset.description && <p>{asset.description}</p>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            !subfolders.length && (
              <div className="empty-state">
                <ImageIcon size={26} />
                <h3>
                  {searching
                    ? "No matching assets."
                    : current
                      ? "This folder is empty."
                      : "A place for the essentials."}
                </h3>
                <p>
                  {searching
                    ? "Try another search or clear the filters."
                    : canContribute
                      ? "Add images, links or folders to organize them."
                      : "Approved brand files will appear here."}
                </p>
                {searching && (
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
            )
          )}
        </>
      )}
      {folderAction && (folderAction === "new" || current) && (
        <BrandFolderDialog
          clientId={clientId}
          folder={folderAction === "new" ? undefined : (current ?? undefined)}
          parentId={folderAction === "new" ? (current?.id ?? null) : (parent?.id ?? null)}
          parentName={
            folderAction === "new" ? (current?.name ?? "Assets") : (parent?.name ?? "Assets")
          }
          deleting={folderAction === "delete"}
          onClose={() => setFolderAction(null)}
          onSaved={(id) => open(folderAction === "delete" ? (parent?.id ?? null) : id)}
        />
      )}
      {adding === "file" && (
        <AssetUpload
          clientId={clientId}
          folders={allFolders}
          folderId={current?.id ?? null}
          imagesOnly={!canManage}
          onClose={() => setAdding(null)}
        />
      )}
      {adding === "link" && (
        <BrandLinkDialog
          clientId={clientId}
          folders={allFolders}
          folderId={current?.id ?? null}
          onClose={() => setAdding(null)}
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
              {selectedLink ? (
                <a
                  className="button primary"
                  href={selectedLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open link
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              ) : (
                <button
                  className="button primary"
                  disabled={!selected.storage_path || download.isPending}
                  onClick={() => download.mutate(selected)}
                >
                  <Download size={15} />
                  {download.isPending ? "Downloading…" : "Download file"}
                </button>
              )}
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
            <BrandAssetFolderPicker key={selected.id} asset={selected} folders={allFolders} />
          ) : (
            <p className="form-help">
              Folder:{" "}
              {folderPath(allFolders, selected.folder_id)
                .map((folder) => folder.name)
                .join(" / ") || "Assets (top level)"}
            </p>
          )}
          {!selected.storage_path && !selectedLink && (
            <p className="form-help">A downloadable file has not been attached yet.</p>
          )}
          {download.error && <FormError>{validationMessage(download.error)}</FormError>}
        </Modal>
      )}
    </>
  );
}
