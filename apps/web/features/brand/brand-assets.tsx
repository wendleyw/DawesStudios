"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, ImageIcon, Plus, Search, Upload } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { assertResult } from "@/lib/supabase";
import { useBrandAssets, type BrandAsset } from "./brand-data";
import {
  brandFileTypes,
  matchesBrandSearch,
  validateBrandFile,
  validationMessage,
} from "./brand-model";
import { CopyButton } from "@/features/shared/copy-button";

function AssetPreview({ asset }: { asset: BrandAsset }) {
  const { database, session } = useAuth();
  const canPreview =
    !!asset.storage_path &&
    ["image/png", "image/jpeg", "image/webp"].includes(asset.mime_type ?? "");
  const preview = useQuery({
    queryKey: ["brand-asset-preview", session?.user.id, asset.id, asset.storage_path],
    enabled: !!session && canPreview,
    staleTime: 120_000,
    queryFn: async () =>
      assertResult(
        await database.storage.from("brand-assets").createSignedUrl(asset.storage_path!, 300),
      ).signedUrl,
  });
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
                  ? "SVG artwork"
                  : "Brand resource"}
          </span>
        </>
      )}
    </div>
  );
}

function AssetUpload({ clientId, onClose }: { clientId: string; onClose: () => void }) {
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
        assertResult(
          await database.storage
            .from("brand-assets")
            .upload(path, file, { contentType: file.type, upsert: false }),
        );
        uploaded.current = { file, path };
        setFileUploaded(true);
      }
      const existing = assertResult(
        await database.from("brand_assets").select("id").eq("id", assetId).maybeSingle(),
      );
      if (!existing)
        assertResult(
          await database
            .from("brand_assets")
            .insert({
              id: assetId,
              client_id: clientId,
              name,
              category: String(form.get("category")),
              description: String(form.get("description") ?? "").trim(),
              tags: String(form.get("tags") ?? "")
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean)
                .slice(0, 20),
              mime_type: file.type,
              storage_path: uploaded.current.path,
            })
            .select("id")
            .single(),
        );
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
        const existing = assertResult(
          await database.from("brand_assets").select("id").eq("id", assetId).maybeSingle(),
        );
        if (!existing)
          assertResult(await database.storage.from("brand-assets").remove([uploaded.current.path]));
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
          <p className="form-error" role="alert">
            {closeError || validationMessage(upload.error)}
          </p>
        )}
      </form>
    </Modal>
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
      const blob = assertResult(
        await database.storage.from("brand-assets").download(asset.storage_path),
      );
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
        <label className="search-field">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search brand assets"
            placeholder="Find a brand asset…"
          />
        </label>
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
          {download.error && (
            <p className="form-error" role="alert">
              {validationMessage(download.error)}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
