/**
 * Pure album model for the Playground's Brand Hub albums and the viewer's own Playground album.
 * Takes data the owning features already fetched (`brand-data.ts`, `playground-data.ts`) and
 * decides album/file ordering, grouping and — checked against the Playground's own allow-list and
 * size ceiling — which files the board accepts. No Supabase, no React:
 * `playground-albums-panel.tsx` calls the owning features' hooks and passes their results in here.
 * Project designs live in Miro, so there is no project album.
 *
 * docs/superpowers/specs/2026-09-23-playground-albums-design.md
 */
import type { BrandAsset, BrandAssetFolder } from "@/features/brand/brand-data";
import { mapWithConcurrency } from "@/features/playground/concurrency";
import { uploadSizeMessage } from "@/features/shared/upload-rules";
import {
  PLAYGROUND_FILE_MIMES,
  PLAYGROUND_MAX_FILE_BYTES,
  type PlaygroundItem,
} from "./playground-types";

/** The custom `dataTransfer` type an in-app album drag carries, distinguishing it from a native OS
 * file drop in the canvas's shared `onDragOver`/`onDrop` handlers (`playground-board.tsx`). */
export const PLAYGROUND_ALBUM_DRAG_TYPE = "application/x-playground-album-file";

export type AlbumFileSource =
  | { kind: "brand"; storagePath: string }
  | { kind: "playground"; assetPath: string; previewUrl?: string };

export type AlbumFile = {
  id: string;
  title: string;
  mimeType: string;
  /** `null` whenever the source data carries no stored byte size — see this plan's Global
   * Constraints ("No stored file size for either album source"). */
  sizeBytes: number | null;
  /** Absent when the Playground accepts this file. */
  disabledReason?: string;
  source: AlbumFileSource;
};

export type Album = {
  id: string;
  group: "brand" | "playground";
  label: string;
  files: AlbumFile[];
};

/** Only these three raster types are ever shown as a live thumbnail; PDF/DOC/etc. and disabled
 * files fall back to a generic document icon in `playground-albums-panel.tsx`. */
export function isPreviewableImage(mimeType: string): boolean {
  return mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp";
}

/**
 * Why a file cannot be added to the Playground, or `undefined` when it can. Reuses
 * `PLAYGROUND_FILE_MIMES` as the single source of truth for the type gate rather than restating
 * "SVG or video": neither is a member of that list, so one membership check catches both.
 */
export function computeDisabledReason(
  mimeType: string,
  sizeBytes: number | null,
): string | undefined {
  if (!(PLAYGROUND_FILE_MIMES as readonly string[]).includes(mimeType))
    return "Stays in the project.";
  if (sizeBytes !== null && sizeBytes > PLAYGROUND_MAX_FILE_BYTES)
    return uploadSizeMessage(PLAYGROUND_MAX_FILE_BYTES);
  return undefined;
}

/** The name a copied file gets in the Playground: the source title, with the stored path's
 * extension appended unless the title already ends with it. */
export function fileNameFor(title: string, path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const base = title.trim() || "file";
  return extension && !base.toLowerCase().endsWith(`.${extension}`) ? `${base}.${extension}` : base;
}

function albumFileFromBrandAsset(
  asset: Pick<BrandAsset, "id" | "name" | "mime_type" | "storage_path">,
): AlbumFile {
  const mimeType = asset.mime_type ?? "";
  return {
    id: asset.id,
    title: asset.name,
    mimeType,
    sizeBytes: null,
    disabledReason: computeDisabledReason(mimeType, null),
    source: { kind: "brand", storagePath: asset.storage_path! },
  };
}

/**
 * One album per client folder that holds at least one stored file, plus Unfiled first when it
 * holds one. Role-agnostic: every role sees every folder (spec's Brand Hub visibility column is
 * "All folders" for every row), so this function does no role filtering — the caller passes
 * whatever `useBrandAssetFolders`/`useBrandAssets` already returned for the signed-in viewer.
 */
export function buildBrandAlbums(
  folders: Pick<BrandAssetFolder, "id" | "name">[],
  assets: Pick<BrandAsset, "id" | "name" | "folder_id" | "mime_type" | "storage_path">[],
): Album[] {
  const withFile = assets.filter(
    (asset): asset is typeof asset & { storage_path: string } => !!asset.storage_path,
  );
  const albums: Album[] = [];
  const unfiled = withFile
    .filter((asset) => !asset.folder_id)
    .map(albumFileFromBrandAsset)
    .sort((a, b) => a.title.localeCompare(b.title));
  if (unfiled.length)
    albums.push({ id: "brand-unfiled", group: "brand", label: "Unfiled", files: unfiled });
  for (const folder of [...folders].sort((a, b) => a.name.localeCompare(b.name))) {
    const files = withFile
      .filter((asset) => asset.folder_id === folder.id)
      .map(albumFileFromBrandAsset)
      .sort((a, b) => a.title.localeCompare(b.title));
    if (files.length)
      albums.push({ id: `brand-folder-${folder.id}`, group: "brand", label: folder.name, files });
  }
  return albums;
}

/** The viewer's own Playground images, newest first, for the Miro asset strip. */
export function buildPlaygroundAlbum(items: PlaygroundItem[]): Album | null {
  const files = items
    .filter(
      (item): item is PlaygroundItem & { asset_path: string; mime_type: string } =>
        item.kind === "image" && !!item.asset_path && !!item.mime_type,
    )
    .reverse()
    .map((item): AlbumFile => ({
      id: item.id,
      title: item.title,
      mimeType: item.mime_type,
      sizeBytes: null,
      source: { kind: "playground", assetPath: item.asset_path, previewUrl: item.url },
    }));
  return files.length
    ? { id: "playground", group: "playground", label: "Playground", files }
    : null;
}

export const CLIPBOARD_ONLY_IMAGES = "Only images can be copied.";

/** Why a file cannot be copied to the clipboard, or `undefined` when it can. */
export function clipboardDisabledReason(file: AlbumFile): string | undefined {
  return isPreviewableImage(file.mimeType) ? undefined : CLIPBOARD_ONLY_IMAGES;
}

export type CopyDependencies = {
  downloadBrand: (storagePath: string) => Promise<Blob>;
};

export type CopyStatus =
  | { id: string; file: AlbumFile; point: { x: number; y: number }; state: "loading" }
  | { id: string; file: AlbumFile; point: { x: number; y: number }; state: "done" }
  | { id: string; file: AlbumFile; point: { x: number; y: number }; state: "error"; error: string };

/**
 * Downloads every given album file (bounded to 3 at once, mirroring the queue already in
 * `use-playground-drop.ts`'s `addFiles`) and wraps each into a `File`, reporting per-file progress
 * through `onStatus`. Resolves to the successfully downloaded files, in the same relative order as
 * `files` regardless of which one finished first — the caller passes this array to the Playground's
 * existing `addFiles` in one call, so the existing multi-file stacking layout applies unchanged. A
 * failed file is omitted from the result (its status stays `"error"` for the caller to offer
 * "Try again" on) without blocking its siblings.
 */
export async function copyAlbumFilesToBoard(
  files: AlbumFile[],
  point: { x: number; y: number },
  deps: CopyDependencies,
  onStatus: (status: CopyStatus) => void,
): Promise<File[]> {
  const results = await mapWithConcurrency<AlbumFile, File | undefined>(files, 3, async (file) => {
    const id = crypto.randomUUID();
    onStatus({ id, file, point, state: "loading" });
    try {
      if (file.source.kind === "playground")
        throw new Error("A Playground file is already on the board.");
      const blob = await deps.downloadBrand(file.source.storagePath);
      const copied = new File([blob], fileNameFor(file.title, file.source.storagePath), {
        type: file.mimeType,
      });
      onStatus({ id, file, point, state: "done" });
      return copied;
    } catch (error) {
      onStatus({
        id,
        file,
        point,
        state: "error",
        error: error instanceof Error ? error.message : "This file could not be copied.",
      });
      return undefined;
    }
  });
  return results.filter((file): file is File => file !== undefined);
}
