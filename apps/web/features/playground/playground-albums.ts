/**
 * Pure album model for the Playground's Brand Hub and project-version albums. Takes data the
 * owning features already fetched (`brand-data.ts`, `project-data.ts`) and decides album/file
 * ordering, grouping and — checked against the Playground's own allow-list and size ceiling —
 * which files the board accepts. No Supabase, no React: `playground-albums-panel.tsx` (Task 3)
 * calls the owning features' hooks and passes their results in here.
 *
 * docs/superpowers/specs/2026-09-23-playground-albums-design.md
 */
import type { BrandAsset, BrandAssetFolder } from "@/features/brand/brand-data";
import type {
  CanvasDesign,
  CanvasVersion,
  ProjectChannel,
  TableRow,
} from "@/features/projects/project-data";
import { uploadSizeMessage, type UploadMime } from "@/features/shared/upload-rules";
import { PLAYGROUND_FILE_MIMES, PLAYGROUND_MAX_FILE_BYTES } from "./playground-types";

/** The custom `dataTransfer` type an in-app album drag carries, distinguishing it from a native OS
 * file drop in the canvas's shared `onDragOver`/`onDrop` handlers (`playground-board.tsx`). */
export const PLAYGROUND_ALBUM_DRAG_TYPE = "application/x-playground-album-file";

export type AlbumFileSource =
  | { kind: "brand"; storagePath: string }
  | { kind: "design"; channel: ProjectChannel; assetPath: string };

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
  group: "brand" | "project";
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

/** A design's stored path always ends in `.png` (images, via `sanitizeArtwork`) or `.mp4`/`.webm`
 * (video, via the raw-then-remuxed video path) — never any other extension; see `isVideoAsset`
 * in `@/features/shared/upload-rules` and `apps/web/features/projects/README.md`. */
function mimeFromDesignPath(path: string): UploadMime {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "webm") return "video/webm";
  if (extension === "mp4") return "video/mp4";
  return "image/png";
}

/**
 * One album per (deliverable, version) pair that has at least one design with a stored asset,
 * ordered by the deliverable's canvas order then version number. `versions`/`designs` come from
 * `useProjectDetail`'s already-unified `CanvasVersion[]`/`CanvasDesign[]` (the same shape whether
 * the hook read `design_versions`/`designs` or `published_versions`/`published_designs`), so this
 * function needs no role branching of its own — see the "role-to-channel mapping" Global Constraint.
 * `channel` is stamped onto every resulting file's source because the copy step (Task 4) must know
 * which bucket to download from, a fact `CanvasDesign` itself no longer carries once unified.
 */
export function buildProjectAlbums(
  deliverables: Pick<TableRow<"deliverables">, "id" | "name" | "sort_order">[],
  versions: CanvasVersion[],
  designs: CanvasDesign[],
  channel: ProjectChannel,
): Album[] {
  const albums: Album[] = [];
  for (const deliverable of [...deliverables].sort((a, b) => a.sort_order - b.sort_order)) {
    const deliverableVersions = versions
      .filter((version) => version.deliverableId === deliverable.id)
      .sort((a, b) => a.number - b.number);
    for (const version of deliverableVersions) {
      const files = designs
        .filter(
          (design): design is CanvasDesign & { assetPath: string } =>
            design.versionId === version.id && !!design.assetPath,
        )
        .sort((a, b) => a.order - b.order)
        .map((design): AlbumFile => {
          const mimeType = mimeFromDesignPath(design.assetPath);
          return {
            id: design.id,
            title: design.title,
            mimeType,
            sizeBytes: null,
            disabledReason: computeDisabledReason(mimeType, null),
            source: { kind: "design", channel, assetPath: design.assetPath },
          };
        });
      if (files.length)
        albums.push({
          id: `version-${version.id}`,
          group: "project",
          label: `${deliverable.name} · V${version.number}`,
          files,
        });
    }
  }
  return albums;
}
