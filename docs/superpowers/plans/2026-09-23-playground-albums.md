# Playground Albums Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every role in a project's Playground pull in material the studio already has — Brand
Hub folders and the project's own design versions — as a row of album chips below the Playground
title; opening a chip shows its files, and dragging (or pressing Enter on) a file adds a real copy
to the board exactly where it lands, through the Playground's existing upload flow.

**Architecture:** A pure model module (`playground-albums.ts`) builds per-role album/file lists from
data the owning features already expose (`brand-data.ts`, `project-data.ts`), decides which files
the Playground accepts, and — added once the rendering contract is fixed — drives the bounded-
concurrency download-and-wrap copy step against injected dependencies. A rendering module
(`playground-albums-panel.tsx`) owns the chip row, the one open thumbnail row, click/Shift+click
selection and keyboard Enter, receiving `onAdd`/`onDragStart`/`onDragEnd` callbacks rather than
touching Supabase or the canvas itself. `playground-board.tsx` mounts that panel below the title,
tracks which files are mid-drag, extends its existing canvas drop handler to recognize an in-app
album drag alongside a native OS file drop, and feeds every successfully downloaded file into the
same `addFiles` the native drop and file picker already use — so validation, storage, retry and the
"Waiting to upload…" placeholder are inherited, not rebuilt.

**Tech Stack:** Next.js App Router + TypeScript (`apps/web`), React 19, `@tanstack/react-query`,
`@xyflow/react`, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-playground-albums-design.md`

## Naming deviation from the spec, and why

The spec names two files, `playground-albums.ts` and `playground-albums.tsx`, sharing one
basename. That pair cannot both exist: this repo's `tsconfig.json` sets
`"moduleResolution": "bundler"`, and under that resolution an extensionless specifier
(`"./playground-albums"`) resolves to a *single* physical file chosen by extension-priority order,
not to "whichever one the importer meant." The component file would need to import the logic
file's exports through that exact specifier — `import { buildBrandAlbums } from "./playground-albums"`
— which is indistinguishable from importing itself. No repo file pair does this today (verified:
`comm -12` over every `.ts`/`.tsx` basename under `apps/web/features/` returns nothing), so this
is not an established, working pattern here. The pure logic file keeps the spec's exact name,
`playground-albums.ts`. The rendering file is `playground-albums-panel.tsx`, exporting
`PlaygroundAlbumsPanel` — matching this feature's existing suffix convention
(`playground-node.tsx`, `playground-viewport.tsx`, `playground-board.tsx`). Both files still live in
`apps/web/features/playground/`, colocated, exactly as the spec's "Units" section asks; only one
filename changes, and the two responsibilities (pure model, chip/thumbnail rendering) are unchanged.

## Global Constraints

- **Ordering dependency (spec "Coordination"):** this plan executes after
  `docs/superpowers/plans/2026-09-23-bulk-image-drop.md` and
  `docs/superpowers/plans/2026-09-23-video-upload-lifecycle.md` are both implemented.
  Bulk-image-drop's Task 2 modifies `apps/web/features/projects/project-data.ts`: it inserts
  `usePublishedVersionNumbers(projectId, enabled)` after `useDesignAssetUrl` and changes
  `createDesignVersion` to resolve to the new version's id (`Promise<string>`, not `Promise<void>`).
  This plan's Task 2 edits the **same file**, after that change has already landed, and does not
  redefine either export — it only adds `downloadDesignAssetFile` nearby. Verified: video-upload-
  lifecycle's plan touches `artwork-files.ts`, `project-action-dialog.tsx`, a new migration and
  `apps/media`, never `project-data.ts` or the bucket/channel logic this plan reads — no interface
  conflict there. Because line numbers in `project-data.ts` shift once bulk-image-drop's Task 2 is
  applied, Task 2 below anchors its edit to named surrounding code (`useDesignAssetUrl` /
  `projectQueryKeys`), not only to the current line numbers.
- **Do not modify** `apps/web/features/projects/artwork-files.ts` or
  `apps/web/features/projects/project-action-dialog.tsx` (owned by the video-upload-lifecycle plan).
- **Playground allow-list and size ceiling, unchanged:** `PLAYGROUND_FILE_MIMES`,
  `PLAYGROUND_MAX_FILE_BYTES` (25 MiB = 26,214,400 bytes) in `playground-types.ts`. No new upload
  path bypasses `preparePlaygroundFile`/`addFiles`.
  `ARTWORK_MAX_BYTES` (`features/shared/upload-rules.ts`) is exactly equal to
  `PLAYGROUND_MAX_FILE_BYTES` (both `25 * 1024 * 1024`) — proven with a drift-guard test in Task 1,
  because Task 1's oversize check relies on this equality (see "No stored file size" below).
- **No schema, RPC, policy or bucket change, and no new privileged endpoint** (spec "Non-goals").
  The copy flow only calls existing reads (`downloadBrandAssetFile`, the new
  `downloadDesignAssetFile`) and the existing `addFiles`/upload/save path.
- **No stored file size for either album source.** Verified against
  `supabase/database.types.ts`: `brand_assets` has no size column (category, client_id, created_at,
  description, folder_id, id, mime_type, name, storage_path, tags — no bytes field), and neither do
  `designs`/`published_designs`. A design's stored image can never be oversized for the Playground,
  because `sanitizeArtwork` already enforces `ARTWORK_MAX_BYTES`, which (see above) equals
  `PLAYGROUND_MAX_FILE_BYTES` exactly. A Brand Hub PNG/JPEG/WebP/PDF between 25 MB and the Brand
  Hub's own 50 MB ceiling therefore cannot be pre-flagged oversize from data the product stores
  today. Rather than invent a new Storage `list()`-based size lookup (out of this plan's authorized
  scope — the task briefing authorizes a new **project-data.ts** read only, and the spec's Data
  section lists brand-data.ts's role as "folders, assets, previews and downloads", not sizes), the
  model's `computeDisabledReason(mimeType, sizeBytes)` takes `sizeBytes: number | null` and applies
  the 25 MB rule whenever a size is known; every real caller passes `null` today. This is recorded
  here and pinned by a real, passing unit test in Task 1 exercising the size branch with a synthetic
  size — the branch is live code, not a placeholder, but no caller can trigger it with today's data.
  Flagged to the orchestrator as a spec/data contradiction, not silently dropped.
- **Role-to-channel mapping, reused rather than reinvented:** `channel = profile?.role === "client"
  ? "client" : "internal"`, mirroring `project-page.tsx:47-52` minus its agency Working/Shared
  toggle (the Playground has no such toggle; agency and designer always see working versions in
  Playground, matching the spec's role table). Passed to `useProjectDetail`, which itself coerces to
  the client projection whenever `profile.role === "client"` regardless of the argument
  (`project-data.ts:105`) — the real enforcement boundary is inside that existing, unmodified hook.
- **Data access contract** (`docs/architecture/data-access.md`): Supabase calls live only in
  `<feature>-data.ts`; a read invoked from a drag/keyboard handler rather than rendered is a plain
  `async (database, input)` function, not a hook (rule 2). `playground-albums.ts` and
  `playground-albums-panel.tsx` import neither Supabase client type directly — the panel calls
  existing hooks from `brand-data.ts`/`project-data.ts`; the model takes plain data and, from Task 4,
  plain injected async functions.
- English for all identifiers, code, tests, comments and docs (`CLAUDE.md` Language Policy); this
  plan document stays in English throughout, including if execution updates are relayed to the user
  in Brazilian Portuguese in chat.
- Gate: `npm run check` (typecheck, eslint, prettier, unit suites) and the Playground browser specs
  (`npx playwright test tests/e2e/playground.spec.ts`).

## Review Focus

- **A client session must never request an `internal-assets` object through albums.** Enforced by
  reusing `useProjectDetail`'s existing role coercion and by tagging every design `AlbumFile` with
  the channel the panel itself computed (never a hand-picked one). Pinned by Task 5's network
  assertion (`page.on("request")`, mirroring `video-loading.spec.ts`'s existing pattern) over a full
  client-session Playground interaction, not just the drag itself.
- **Dragging a thumbnail that is not part of the current multi-selection must drag only that one
  file**, not the stale selection — and must reset selection to it, matching ordinary desktop file-
  browser behavior a person would expect. Pinned in Task 3.
- **One file failing to download must not affect the others in the same multi-file drag.** Each
  file's download is independent inside `copyAlbumFilesToBoard`'s bounded-concurrency loop; a
  failure there must still let its siblings reach the board. Pinned in Task 4.
- **A disabled (SVG/video/oversize) thumbnail must be reachable by keyboard focus to read why, but
  never draggable and never Enter-addable.** Using `aria-disabled` rather than the native `disabled`
  attribute, because a truly `disabled` button drops out of the tab order and the spec explicitly
  requires the reason on hover **and** focus. Pinned in Task 3.
- **An album with files that are all disabled is still shown; only an album with zero storable
  files is hidden.** A folder holding one SVG is a real, navigable album (its file is visible,
  dimmed); a folder with nothing stored at all does not get a chip. Pinned in Task 1
  (`buildBrandAlbums`/`buildProjectAlbums`) and exercised again by Task 3's rendering test.

---

### Task 1: `playground-albums.ts` — the pure album model

**Files:**
- Create: `apps/web/features/playground/playground-albums.ts`
- Create: `apps/web/features/playground/playground-albums.test.ts`

**Interfaces:**
- Consumes: `PLAYGROUND_FILE_MIMES`, `PLAYGROUND_MAX_FILE_BYTES` (`./playground-types`,
  unmodified); `uploadSizeMessage` (`@/features/shared/upload-rules`, unmodified); the *types*
  `BrandAsset`, `BrandAssetFolder` (`@/features/brand/brand-data`, unmodified) and `CanvasDesign`,
  `CanvasVersion`, `ProjectChannel`, `TableRow` (`@/features/projects/project-data`, unmodified —
  `TableRow` already exported at `project-data.ts:19-20`).
- Produces (consumed by Task 3 and Task 4):
  - `export const PLAYGROUND_ALBUM_DRAG_TYPE = "application/x-playground-album-file"`
  - `export type AlbumFileSource = { kind: "brand"; storagePath: string } | { kind: "design"; channel: ProjectChannel; assetPath: string }`
  - `export type AlbumFile = { id: string; title: string; mimeType: string; sizeBytes: number | null; disabledReason?: string; source: AlbumFileSource }`
  - `export type Album = { id: string; group: "brand" | "project"; label: string; files: AlbumFile[] }`
  - `export function isPreviewableImage(mimeType: string): boolean`
  - `export function computeDisabledReason(mimeType: string, sizeBytes: number | null): string | undefined`
  - `export function fileNameFor(title: string, path: string): string`
  - `export function buildBrandAlbums(folders: Pick<BrandAssetFolder, "id" | "name">[], assets: Pick<BrandAsset, "id" | "name" | "folder_id" | "mime_type" | "storage_path">[]): Album[]`
  - `export function buildProjectAlbums(deliverables: Pick<TableRow<"deliverables">, "id" | "name" | "sort_order">[], versions: CanvasVersion[], designs: CanvasDesign[], channel: ProjectChannel): Album[]`

- [ ] **Step 1: Write the failing tests for `isPreviewableImage`, `computeDisabledReason` and `fileNameFor`**

```ts
import { describe, expect, it } from "vitest";
import { ARTWORK_MAX_BYTES } from "@/features/shared/upload-rules";
import {
  computeDisabledReason,
  fileNameFor,
  isPreviewableImage,
  PLAYGROUND_ALBUM_DRAG_TYPE,
} from "./playground-albums";
import { PLAYGROUND_MAX_FILE_BYTES } from "./playground-types";

describe("isPreviewableImage", () => {
  it("accepts the three raster types these albums ever preview", () => {
    expect(isPreviewableImage("image/png")).toBe(true);
    expect(isPreviewableImage("image/jpeg")).toBe(true);
    expect(isPreviewableImage("image/webp")).toBe(true);
  });
  it("rejects SVG, PDF and video", () => {
    expect(isPreviewableImage("image/svg+xml")).toBe(false);
    expect(isPreviewableImage("application/pdf")).toBe(false);
    expect(isPreviewableImage("video/mp4")).toBe(false);
  });
});

describe("computeDisabledReason", () => {
  it("accepts a PNG under the limit", () => {
    expect(computeDisabledReason("image/png", 1024)).toBeUndefined();
  });
  it("accepts a file whose size is unknown", () => {
    expect(computeDisabledReason("application/pdf", null)).toBeUndefined();
  });
  it("disables SVG with the Playground's own reason", () => {
    expect(computeDisabledReason("image/svg+xml", null)).toBe("Stays in the project.");
  });
  it("disables both accepted video containers with the same reason", () => {
    expect(computeDisabledReason("video/mp4", null)).toBe("Stays in the project.");
    expect(computeDisabledReason("video/webm", null)).toBe("Stays in the project.");
  });
  it("disables a file over the Playground's 25 MB limit when the size is known", () => {
    expect(computeDisabledReason("image/png", 26 * 1024 * 1024)).toBe(
      "Choose a file no larger than 25 MB.",
    );
  });
  // A stored design's image can never hit the branch above: `sanitizeArtwork` already enforces
  // this exact ceiling before the file is ever stored (`artwork-files.ts`), so `buildProjectAlbums`
  // always passes `sizeBytes: null` for a design. This equality is the guardrail against the two
  // ceilings silently drifting apart later.
  it("keeps the design-upload ceiling equal to the Playground's own ceiling", () => {
    expect(ARTWORK_MAX_BYTES).toBe(PLAYGROUND_MAX_FILE_BYTES);
  });
});

describe("fileNameFor", () => {
  it("appends the stored path's extension when the title lacks it", () => {
    expect(fileNameFor("Summer logo", "client-1/af12.png")).toBe("Summer logo.png");
  });
  it("does not double an extension already present in the title", () => {
    expect(fileNameFor("summer-logo.png", "client-1/af12.png")).toBe("summer-logo.png");
  });
  it("falls back to a generic name for a blank title", () => {
    expect(fileNameFor("   ", "client-1/af12.pdf")).toBe("file.pdf");
  });
});

describe("PLAYGROUND_ALBUM_DRAG_TYPE", () => {
  it("is a distinct, stable custom drag MIME type", () => {
    expect(PLAYGROUND_ALBUM_DRAG_TYPE).toBe("application/x-playground-album-file");
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/playground/playground-albums.test.ts`
Expected: FAIL — `./playground-albums` does not exist yet.

- [ ] **Step 3: Implement `playground-albums.ts` through `fileNameFor`**

```ts
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
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/playground/playground-albums.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Write the failing tests for `buildBrandAlbums` and `buildProjectAlbums`**

```ts
import type { BrandAsset, BrandAssetFolder } from "@/features/brand/brand-data";
import type { CanvasDesign, CanvasVersion, TableRow } from "@/features/projects/project-data";
import { buildBrandAlbums, buildProjectAlbums } from "./playground-albums";

const folder: Pick<BrandAssetFolder, "id" | "name"> = { id: "folder-1", name: "Logos" };
const brandAssets: Pick<BrandAsset, "id" | "name" | "folder_id" | "mime_type" | "storage_path">[] = [
  { id: "asset-1", name: "Wordmark", folder_id: "folder-1", mime_type: "image/png", storage_path: "client-1/a1.png" },
  { id: "asset-2", name: "Icon", folder_id: "folder-1", mime_type: "image/svg+xml", storage_path: "client-1/a2.svg" },
  { id: "asset-3", name: "Brief", folder_id: null, mime_type: "application/pdf", storage_path: "client-1/a3.pdf" },
  { id: "asset-4", name: "Never stored", folder_id: "folder-2", mime_type: "image/png", storage_path: null },
];

describe("buildBrandAlbums", () => {
  it("orders Unfiled first, then named folders alphabetically, and drops a folder with no stored file", () => {
    const albums = buildBrandAlbums([folder, { id: "folder-2", name: "Even earlier" }], brandAssets);
    expect(albums.map((album) => album.label)).toEqual(["Unfiled", "Logos"]);
    expect(albums[0].files.map((file) => file.title)).toEqual(["Brief"]);
    expect(albums[1].files.map((file) => file.title)).toEqual(["Icon", "Wordmark"]);
  });

  it("marks every file's disabled reason from its mime type, keeping a disabled file in the album", () => {
    const albums = buildBrandAlbums([folder], brandAssets);
    const logos = albums.find((album) => album.label === "Logos")!;
    expect(logos.files).toHaveLength(2);
    expect(logos.files.find((file) => file.title === "Wordmark")?.disabledReason).toBeUndefined();
    expect(logos.files.find((file) => file.title === "Icon")?.disabledReason).toBe("Stays in the project.");
  });

  it("omits a folder whose only asset has no stored file", () => {
    const albums = buildBrandAlbums([folder, { id: "folder-2", name: "Even earlier" }], brandAssets);
    expect(albums.some((album) => album.label === "Even earlier")).toBe(false);
  });

  it("returns no albums when nothing has a stored file", () => {
    expect(buildBrandAlbums([folder], [])).toEqual([]);
  });

  it("tags every brand file's source with its storage path", () => {
    const albums = buildBrandAlbums([folder], brandAssets);
    const wordmark = albums.find((a) => a.label === "Logos")!.files.find((f) => f.title === "Wordmark")!;
    expect(wordmark.source).toEqual({ kind: "brand", storagePath: "client-1/a1.png" });
  });
});

const deliverables: Pick<TableRow<"deliverables">, "id" | "name" | "sort_order">[] = [
  { id: "d-square", name: "Campaign square", sort_order: 0 },
  { id: "d-story", name: "Campaign story", sort_order: 1 },
];
const versions: CanvasVersion[] = [
  { id: "v1", projectId: "project-1", deliverableId: "d-square", number: 1, note: "", status: "draft", date: "" },
  { id: "v2", projectId: "project-1", deliverableId: "d-square", number: 2, note: "", status: "draft", date: "" },
  { id: "v3", projectId: "project-1", deliverableId: "d-story", number: 1, note: "", status: "draft", date: "" },
];
const designs: CanvasDesign[] = [
  { id: "design-1", versionId: "v1", title: "Square A", content: {}, assetPath: "project-1/design-1.png", order: 0 },
  { id: "design-2", versionId: "v2", title: "Square B", content: {}, assetPath: "project-1/design-2.png", order: 0 },
  { id: "design-3", versionId: "v2", title: "Square B video", content: {}, assetPath: "project-1/design-3.mp4", order: 1 },
  { id: "design-4", versionId: "v3", title: "Story A", content: {}, assetPath: null, order: 0 },
];

describe("buildProjectAlbums", () => {
  it("builds one chip per deliverable version that has at least one stored design, ordered by deliverable then version", () => {
    const albums = buildProjectAlbums(deliverables, versions, designs, "internal");
    expect(albums.map((album) => album.label)).toEqual(["Campaign square · V1", "Campaign square · V2"]);
  });

  it("drops a version whose only design has no stored asset", () => {
    const albums = buildProjectAlbums(deliverables, versions, designs, "internal");
    expect(albums.some((album) => album.label.startsWith("Campaign story"))).toBe(false);
  });

  it("orders a version's designs by sort order and marks a video design disabled", () => {
    const albums = buildProjectAlbums(deliverables, versions, designs, "internal");
    const v2 = albums.find((album) => album.label === "Campaign square · V2")!;
    expect(v2.files.map((file) => file.title)).toEqual(["Square B", "Square B video"]);
    expect(v2.files[0].disabledReason).toBeUndefined();
    expect(v2.files[1].disabledReason).toBe("Stays in the project.");
  });

  it("tags every design file's source with the given channel", () => {
    const albums = buildProjectAlbums(deliverables, versions, designs, "client");
    expect(albums[0].files[0].source).toEqual({
      kind: "design",
      channel: "client",
      assetPath: "project-1/design-1.png",
    });
  });

  it("returns no chips for empty version/design input", () => {
    // A client viewer's `useProjectDetail` call resolves `versions`/`designs` from
    // `published_versions`/`published_designs`, never `design_versions`/`designs` -- that channel
    // coercion is `useProjectDetail`'s own existing behavior (`project-data.ts:105`), not this
    // function's. What this function guarantees is the other half: given nothing, it shows nothing.
    expect(buildProjectAlbums(deliverables, [], [], "client")).toEqual([]);
  });
});
```

- [ ] **Step 6: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/playground/playground-albums.test.ts`
Expected: FAIL — `buildBrandAlbums` and `buildProjectAlbums` are not exported yet.

- [ ] **Step 7: Implement `buildBrandAlbums` and `buildProjectAlbums`**

Append to `playground-albums.ts`:

```ts
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
  if (unfiled.length) albums.push({ id: "brand-unfiled", group: "brand", label: "Unfiled", files: unfiled });
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
```

- [ ] **Step 8: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/playground/playground-albums.test.ts`
Expected: PASS (20 tests total).

- [ ] **Step 9: Run the full checks**

Run: `cd apps/web && npx tsc --noEmit && npx eslint features/playground/playground-albums.ts features/playground/playground-albums.test.ts`
Expected: no type or lint errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/features/playground/playground-albums.ts apps/web/features/playground/playground-albums.test.ts
git commit -m "feat(playground): add the pure album model for Brand Hub folders and design versions"
```

---

### Task 2: `project-data.ts` — the missing design-file download read

**Files:**
- Modify: `apps/web/features/projects/project-data.ts` (insert immediately after `useDesignAssetUrl`
  — currently ending at line 318, before whichever comes first of bulk-image-drop's
  `usePublishedVersionNumbers` or the `projectQueryKeys` comment — currently at line 320)
- Modify: `apps/web/features/projects/project-data.test.ts` (extend `stubDatabase` with a `storage`
  mock; add tests; add one entry to the `"project write failures"` table)
- Modify: `apps/web/features/projects/README.md` (extend the existing "Deviation from the
  data-access contract" section)

**Fact discovered during research:** the copy flow needs the raw bytes of a stored design's
artwork, from whichever bucket its channel maps to (`internal-assets` for the agency/designer
board, `published-assets` for the client board — the same choice `useDesignAssetUrl` already makes
by channel, not by role, at `project-data.ts:313-315`). `project-data.ts` has a signed-URL read for
display (`useDesignAssetUrl`) but no download-the-bytes read. This call site is inside the album
drag/Enter handler (`playground-albums-panel.tsx`, Task 3) — invoked from an event handler, not
rendered — so per rule 2 of `docs/architecture/data-access.md` it is a plain
`async (database, input)` function, not a hook. This is the exact shape already used for
`findUnchangedDesign`/`findDesignByAsset` in this same file, and for `downloadBrandAssetFile` in
`apps/web/features/brand/brand-data.ts`, which this function otherwise mirrors closely.

**Interfaces:**
- Consumes: `assertResult`, `SupabaseDatabase` (`@/lib/supabase`, already imported in this file);
  `ProjectChannel` (already exported by this file, `project-data.ts:21`).
- Produces (consumed by Task 4):
  - `export async function downloadDesignAssetFile(database: SupabaseDatabase, input: { assetPath: string; channel: ProjectChannel }): Promise<Blob>`

- [ ] **Step 1: Write the failing tests for `downloadDesignAssetFile`**

Add to the top-level import list in `apps/web/features/projects/project-data.test.ts`
(`import { ... } from "./project-data";`):

```ts
  downloadDesignAssetFile,
```

Add a new `describe` block, after the existing `describe("project procedures", ...)` block:

```ts
describe("downloadDesignAssetFile", () => {
  it("downloads from internal-assets on the internal channel", async () => {
    const blob = new Blob(["x"]);
    const { database, calls } = stubDatabase({ data: blob, error: null });
    const result = await downloadDesignAssetFile(database, {
      assetPath: "project-1/design-1.png",
      channel: "internal",
    });
    expect(calls).toEqual([
      { method: "storage.from", args: ["internal-assets"] },
      { method: "download", args: ["project-1/design-1.png"] },
    ]);
    expect(result).toBe(blob);
  });

  it("downloads from published-assets on the client channel", async () => {
    const blob = new Blob(["x"]);
    const { database, calls } = stubDatabase({ data: blob, error: null });
    await downloadDesignAssetFile(database, {
      assetPath: "project-1/design-1.png",
      channel: "client",
    });
    expect(calls[0]).toEqual({ method: "storage.from", args: ["published-assets"] });
  });
});
```

Add one entry to the existing `describe("project write failures", ...)` table (the
`[string, (database: never) => Promise<unknown>][]` array):

```ts
    [
      "downloadDesignAssetFile",
      (database) =>
        downloadDesignAssetFile(database, { assetPath: "project-1/design-1.png", channel: "internal" }),
    ],
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/projects/project-data.test.ts -t "downloadDesignAssetFile"`
Expected: FAIL — `downloadDesignAssetFile` is not exported, and `stubDatabase`'s returned object has
no `.storage`.

- [ ] **Step 3: Extend `stubDatabase` with a storage mock**

In `apps/web/features/projects/project-data.test.ts`, replace the existing `stubDatabase` function:

```ts
function stubDatabase(result: Result) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") return (resolve: (value: Result) => unknown) => resolve(result);
        return (...args: unknown[]) => {
          calls.push({ method: String(property), args });
          return chain;
        };
      },
    },
  );
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    return chain;
  });
  const rpc = vi.fn().mockResolvedValue(result);
  const storageFrom = vi.fn((bucket: string) => {
    calls.push({ method: "storage.from", args: [bucket] });
    return chain;
  });
  return { database: { from, rpc, storage: { from: storageFrom } } as never, calls, rpc };
}
```

This is additive: every existing test only reads `database.from`/`database.rpc`, never
`database.storage`, so none of them observes the new field.

- [ ] **Step 4: Implement `downloadDesignAssetFile`**

In `apps/web/features/projects/project-data.ts`, insert immediately after `useDesignAssetUrl`'s
closing brace (after the line `}` that ends the function starting `export function
useDesignAssetUrl(`, and before the `projectQueryKeys` block — or, if bulk-image-drop's Task 2 has
already inserted `usePublishedVersionNumbers` there, immediately after that hook instead):

```ts
/**
 * The raw bytes behind a stored design's artwork, for the Playground albums' copy-into-board flow
 * (`playground-albums.ts`/`playground-albums-panel.tsx`).
 *
 * A plain function, not a `use<Thing>()` hook: it runs from the album drag/keyboard-add handler,
 * not on render — the same "read that cannot be a hook" shape as `findUnchangedDesign`/
 * `findDesignByAsset` above (rule 2, `docs/architecture/data-access.md`), also recorded in this
 * feature's README. The bucket is chosen by channel, exactly like `useDesignAssetUrl` two
 * functions up, so a client-channel copy can never reach into `internal-assets`.
 */
export async function downloadDesignAssetFile(
  database: SupabaseDatabase,
  input: { assetPath: string; channel: ProjectChannel },
) {
  return assertResult(
    await database.storage
      .from(input.channel === "internal" ? "internal-assets" : "published-assets")
      .download(input.assetPath),
  );
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/projects/project-data.test.ts`
Expected: PASS, including every pre-existing test (the `stubDatabase` change is additive) and the
new `downloadDesignAssetFile` cases.

- [ ] **Step 6: Update the projects README's documented deviation**

In `apps/web/features/projects/README.md`, in the section "Deviation from the data-access
contract: two reads that are not hooks", change the heading and its first paragraph:

```markdown
## Deviation from the data-access contract: reads that are not hooks

`findUnchangedDesign`, `findDesignByAsset` and `downloadDesignAssetFile` in `project-data.ts` are
exported as plain `async (database, input)` functions instead of `use<Thing>()` hooks.
```

Add a paragraph after the existing two (`findUnchangedDesign`/`findDesignByAsset`'s) explanation:

```markdown
`downloadDesignAssetFile` exists for the Playground's album copy flow
(`apps/web/features/playground/playground-albums-panel.tsx`): dragging or Enter-adding a design
onto a Playground board downloads that design's stored bytes with the viewer's own session, from
whichever bucket its channel maps to — the same choice `useDesignAssetUrl` makes for display. It
runs from a drag/keyboard event handler, never on render, so it is a plain function for the same
reason as the two above. It is unit-tested the same way: which bucket it downloads from per
channel, and its entry in the shared write-failures table.
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/features/projects/project-data.ts apps/web/features/projects/project-data.test.ts apps/web/features/projects/README.md
git commit -m "feat(projects): add a plain read for a design's stored file bytes"
```

---

### Task 3: `playground-albums-panel.tsx` — chip row, thumbnail row, selection, keyboard

**Files:**
- Create: `apps/web/features/playground/playground-albums-panel.tsx`
- Create: `apps/web/features/playground/playground-albums-panel.test.tsx`
- Modify: `apps/web/features/playground/playground.css` (append)

**Interfaces:**
- Consumes: `useAuth` (`@/features/auth/auth-provider`); `useBrandAssetFolders`, `useBrandAssets`,
  `useBrandAssetPreviewUrl` (`@/features/brand/brand-data`, unmodified); `useDesignAssetUrl`,
  `useProjectDetail`, `type ProjectChannel` (`@/features/projects/project-data`, unmodified);
  `buildBrandAlbums`, `buildProjectAlbums`, `isPreviewableImage`, `PLAYGROUND_ALBUM_DRAG_TYPE`,
  `type Album`, `type AlbumFile` (Task 1's `./playground-albums`).
- Produces (consumed by Task 4):
  - `export type PlaygroundAlbumsPanelProps = { clientId: string; projectId: string; canAdd: boolean; viewCenter: () => { x: number; y: number }; onAdd: (files: AlbumFile[], point: { x: number; y: number }) => void; onDragStart: (files: AlbumFile[]) => void; onDragEnd: () => void }`
  - `export function PlaygroundAlbumsPanel(props: PlaygroundAlbumsPanelProps): JSX.Element`

**Design decisions this task makes, and why:**
- Selection and "which album is open" are local state inside the panel — the spec's cross-boundary
  concerns are only "add these files at this point" and "these files are now being dragged", which
  is exactly the three callback props above.
- Chips are plain toggle buttons (`aria-pressed`), not an ARIA `tablist`/`tab` pattern: a tabs
  pattern implies roving-tabindex arrow-key navigation between tabs, which nothing here implements,
  and an incomplete ARIA pattern is worse for assistive technology than a correctly-described
  toggle button. Native Tab/Enter/Space already work correctly on a plain button.
- A disabled thumbnail uses `aria-disabled`, not the native `disabled` attribute, so it stays
  reachable by keyboard focus — the spec requires the reason on hover **and** focus, and a truly
  `disabled` element drops out of the tab order in every browser.

- [ ] **Step 1: Write the failing tests for opening/closing an album and reading its thumbnails**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaygroundAlbumsPanel, type PlaygroundAlbumsPanelProps } from "./playground-albums-panel";

const backend = vi.hoisted(() => ({
  useBrandAssetFolders: vi.fn(),
  useBrandAssets: vi.fn(),
  useBrandAssetPreviewUrl: vi.fn(),
}));
vi.mock("@/features/brand/brand-data", () => backend);

const projectBackend = vi.hoisted(() => ({
  useProjectDetail: vi.fn(),
  useDesignAssetUrl: vi.fn(),
}));
vi.mock("@/features/projects/project-data", () => projectBackend);

const auth = vi.hoisted(() => ({ profile: { role: "agency" } }));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));

function projectDetail(
  overrides: Partial<{ deliverables: unknown[]; versions: unknown[]; designs: unknown[] }> = {},
) {
  return {
    data: {
      deliverables: [{ id: "d-square", name: "Campaign square", sort_order: 0 }],
      versions: [
        { id: "v1", projectId: "project-1", deliverableId: "d-square", number: 1, note: "", status: "draft", date: "" },
      ],
      designs: [
        { id: "design-1", versionId: "v1", title: "Square A", content: {}, assetPath: "p/design-1.png", order: 0 },
        { id: "design-2", versionId: "v1", title: "Square B", content: {}, assetPath: "p/design-2.png", order: 1 },
      ],
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.profile = { role: "agency" };
  backend.useBrandAssetFolders.mockReturnValue({ data: [] });
  backend.useBrandAssets.mockReturnValue({ data: [] });
  backend.useBrandAssetPreviewUrl.mockReturnValue({ data: undefined });
  projectBackend.useDesignAssetUrl.mockReturnValue({ data: undefined });
  projectBackend.useProjectDetail.mockReturnValue(projectDetail());
});

function panel(overrides: Partial<PlaygroundAlbumsPanelProps> = {}) {
  const onAdd = vi.fn();
  const onDragStart = vi.fn();
  const onDragEnd = vi.fn();
  const viewCenter = vi.fn(() => ({ x: 10, y: 20 }));
  render(
    <PlaygroundAlbumsPanel
      clientId="client-1"
      projectId="project-1"
      canAdd
      viewCenter={viewCenter}
      onAdd={onAdd}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      {...overrides}
    />,
  );
  return { onAdd, onDragStart, onDragEnd, viewCenter };
}

describe("PlaygroundAlbumsPanel", () => {
  it("opens an album's thumbnail row on click and closes it on a second click", () => {
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    expect(screen.getByTitle("Square A")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    expect(screen.queryByTitle("Square A")).not.toBeInTheDocument();
  });

  it("shows no chip for an album with no storable files, but a disabled file still appears dimmed inside an open one", () => {
    projectBackend.useProjectDetail.mockReturnValue(
      projectDetail({
        designs: [
          { id: "design-1", versionId: "v1", title: "Square A", content: {}, assetPath: "p/design-1.png", order: 0 },
          { id: "design-2", versionId: "v1", title: "Square video", content: {}, assetPath: "p/design-2.mp4", order: 1 },
        ],
      }),
    );
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    const disabled = screen.getByTitle("Stays in the project.");
    expect(disabled).toHaveAttribute("aria-disabled", "true");
    expect(disabled).toHaveAttribute("draggable", "false");
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/playground/playground-albums-panel.test.tsx`
Expected: FAIL — `./playground-albums-panel` does not exist yet.

- [ ] **Step 3: Implement the chip row and thumbnail row**

```tsx
"use client";

import { FileText, ImageIcon } from "lucide-react";
import { Fragment, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useBrandAssetFolders, useBrandAssetPreviewUrl, useBrandAssets } from "@/features/brand/brand-data";
import { useDesignAssetUrl, useProjectDetail, type ProjectChannel } from "@/features/projects/project-data";
import {
  buildBrandAlbums,
  buildProjectAlbums,
  isPreviewableImage,
  PLAYGROUND_ALBUM_DRAG_TYPE,
  type Album,
  type AlbumFile,
} from "./playground-albums";

export type PlaygroundAlbumsPanelProps = {
  clientId: string;
  projectId: string;
  /** False while the board has no id yet, is closing, or is already at its 500-item cap — mirrors
   * the same gate the header's Add note/Add files buttons already use. */
  canAdd: boolean;
  viewCenter: () => { x: number; y: number };
  onAdd: (files: AlbumFile[], point: { x: number; y: number }) => void;
  onDragStart: (files: AlbumFile[]) => void;
  onDragEnd: () => void;
};

export function PlaygroundAlbumsPanel({
  clientId,
  projectId,
  canAdd,
  viewCenter,
  onAdd,
  onDragStart,
  onDragEnd,
}: PlaygroundAlbumsPanelProps) {
  const { profile } = useAuth();
  const channel: ProjectChannel = profile?.role === "client" ? "client" : "internal";
  const folders = useBrandAssetFolders(clientId);
  const assets = useBrandAssets(clientId);
  const project = useProjectDetail(projectId, channel);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastIndex, setLastIndex] = useState<number | null>(null);

  const albums: Album[] = [
    ...buildBrandAlbums(folders.data ?? [], assets.data ?? []),
    ...buildProjectAlbums(
      project.data?.deliverables ?? [],
      project.data?.versions ?? [],
      project.data?.designs ?? [],
      channel,
    ),
  ];
  const openAlbum = albums.find((album) => album.id === openId);
  const firstProjectIndex = albums.findIndex((album) => album.group === "project");

  function openAlbumChip(id: string) {
    setSelectedIds([]);
    setLastIndex(null);
    setOpenId((current) => (current === id ? null : id));
  }

  function toggleSelect(file: AlbumFile, index: number, shiftKey: boolean) {
    if (file.disabledReason) return;
    if (shiftKey && lastIndex !== null && openAlbum) {
      const [start, end] = lastIndex < index ? [lastIndex, index] : [index, lastIndex];
      const range = openAlbum.files.slice(start, end + 1).filter((entry) => !entry.disabledReason);
      setSelectedIds((current) => [...new Set([...current, ...range.map((entry) => entry.id)])]);
    } else {
      setSelectedIds((current) =>
        current.includes(file.id) ? current.filter((id) => id !== file.id) : [...current, file.id],
      );
    }
    setLastIndex(index);
  }

  function handleDragStart(event: DragEvent, file: AlbumFile, index: number) {
    if (!canAdd || file.disabledReason) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(PLAYGROUND_ALBUM_DRAG_TYPE, file.id);
    const partOfSelection = !!openAlbum && selectedIds.includes(file.id);
    const dragged = partOfSelection
      ? openAlbum!.files.filter((entry) => selectedIds.includes(entry.id) && !entry.disabledReason)
      : [file];
    if (!partOfSelection) {
      setSelectedIds([file.id]);
      setLastIndex(index);
    }
    onDragStart(dragged);
  }

  return (
    <div className="playground-albums">
      <div className="playground-album-chips">
        {albums.map((album, index) => (
          // A shorthand `<>` fragment cannot carry the `key` a `.map()` output needs; `Fragment`
          // is used explicitly here so both the optional divider and the chip share one keyed
          // wrapper without an extra DOM element.
          <Fragment key={album.id}>
            {index === firstProjectIndex && index > 0 && (
              <span className="playground-album-divider" aria-hidden="true" />
            )}
            <button
              type="button"
              aria-pressed={openId === album.id}
              className={`playground-album-chip${openId === album.id ? " is-open" : ""}`}
              onClick={() => openAlbumChip(album.id)}
            >
              {album.label}
            </button>
          </Fragment>
        ))}
      </div>
      {openAlbum && (
        <div className="playground-album-row">
          {openAlbum.files.map((file, index) => (
            <AlbumThumbnail
              key={file.id}
              file={file}
              selected={selectedIds.includes(file.id)}
              onClick={(event) => toggleSelect(file, index, event.shiftKey)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canAdd && !file.disabledReason) {
                  event.preventDefault();
                  onAdd([file], viewCenter());
                }
              }}
              onDragStart={(event) => handleDragStart(event, file, index)}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AlbumThumbnail({
  file,
  selected,
  onClick,
  onKeyDown,
  onDragStart,
  onDragEnd,
}: {
  file: AlbumFile;
  selected: boolean;
  onClick: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
}) {
  const previewable = isPreviewableImage(file.mimeType) && !file.disabledReason;
  const brandPreview = useBrandAssetPreviewUrl(
    file.id,
    file.source.kind === "brand" ? file.source.storagePath : null,
    previewable && file.source.kind === "brand",
  );
  // `file.source.channel` already carries the panel's own computed channel for a design file —
  // `buildProjectAlbums` stamped it there — so there is no separate `channel` prop to keep in sync.
  // The "internal" fallback below is inert: the query stays disabled whenever the source isn't a
  // design, so its channel argument is never actually used.
  const designPreview = useDesignAssetUrl(
    file.source.kind === "design" ? file.source.assetPath : null,
    file.source.kind === "design" ? file.source.channel : "internal",
    previewable && file.source.kind === "design",
  );
  const url = file.source.kind === "brand" ? brandPreview.data : designPreview.data;
  return (
    <button
      type="button"
      className={`playground-album-thumb${selected ? " is-selected" : ""}${file.disabledReason ? " is-disabled" : ""}`}
      aria-disabled={!!file.disabledReason}
      aria-pressed={selected}
      title={file.disabledReason ?? file.title}
      draggable={!file.disabledReason}
      onClick={(event) => {
        if (file.disabledReason) return;
        onClick(event);
      }}
      onKeyDown={onKeyDown}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {previewable && url ? (
        // Short-lived signed private URLs are intentional; they must not enter an image proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" draggable={false} />
      ) : previewable ? (
        <ImageIcon size={24} aria-hidden />
      ) : (
        <FileText size={24} aria-hidden />
      )}
      <span>{file.title}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/playground/playground-albums-panel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing tests for selection, keyboard Enter and drag behavior**

Append to `playground-albums-panel.test.tsx`:

```tsx
describe("PlaygroundAlbumsPanel selection and keyboard", () => {
  it("switching to another album clears the selection", () => {
    projectBackend.useProjectDetail.mockReturnValue(
      projectDetail({
        deliverables: [
          { id: "d-square", name: "Campaign square", sort_order: 0 },
          { id: "d-story", name: "Campaign story", sort_order: 1 },
        ],
        versions: [
          { id: "v1", projectId: "project-1", deliverableId: "d-square", number: 1, note: "", status: "draft", date: "" },
          { id: "v2", projectId: "project-1", deliverableId: "d-story", number: 1, note: "", status: "draft", date: "" },
        ],
        designs: [
          { id: "design-1", versionId: "v1", title: "Square A", content: {}, assetPath: "p/design-1.png", order: 0 },
          { id: "design-3", versionId: "v2", title: "Story A", content: {}, assetPath: "p/design-3.png", order: 0 },
        ],
      }),
    );
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    fireEvent.click(screen.getByTitle("Square A"));
    expect(screen.getByTitle("Square A")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Campaign story · V1" }));
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    expect(screen.getByTitle("Square A")).toHaveAttribute("aria-pressed", "false");
  });

  it("Shift+click selects a range", () => {
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    fireEvent.click(screen.getByTitle("Square A"));
    fireEvent.click(screen.getByTitle("Square B"), { shiftKey: true });
    expect(screen.getByTitle("Square A")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Square B")).toHaveAttribute("aria-pressed", "true");
  });

  it("Enter on a focused thumbnail adds only that file, at the view center", () => {
    const { onAdd, viewCenter } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    fireEvent.click(screen.getByTitle("Square B")); // select a different file first
    fireEvent.keyDown(screen.getByTitle("Square A"), { key: "Enter" });
    expect(viewCenter).toHaveBeenCalled();
    expect(onAdd).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "design-1", title: "Square A" })],
      { x: 10, y: 20 },
    );
  });

  it("dragging an unselected thumbnail drags only that file and resets the selection to it", () => {
    const { onDragStart } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    fireEvent.click(screen.getByTitle("Square B")); // select a different file first
    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    fireEvent.dragStart(screen.getByTitle("Square A"), { dataTransfer });
    expect(onDragStart).toHaveBeenCalledWith([expect.objectContaining({ id: "design-1" })]);
    expect(screen.getByTitle("Square A")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Square B")).toHaveAttribute("aria-pressed", "false");
  });

  it("dragging a thumbnail that is part of the current selection drags the whole selection", () => {
    const { onDragStart } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    fireEvent.click(screen.getByTitle("Square A"));
    fireEvent.click(screen.getByTitle("Square B"), { shiftKey: true });
    onDragStart.mockClear();
    const dataTransfer = { effectAllowed: "", setData: vi.fn() };
    fireEvent.dragStart(screen.getByTitle("Square A"), { dataTransfer });
    expect(onDragStart).toHaveBeenCalledWith([
      expect.objectContaining({ id: "design-1" }),
      expect.objectContaining({ id: "design-2" }),
    ]);
  });

  it("a disabled thumbnail ignores Enter and never starts a drag", () => {
    projectBackend.useProjectDetail.mockReturnValue(
      projectDetail({
        designs: [
          { id: "design-1", versionId: "v1", title: "Square video", content: {}, assetPath: "p/design-1.mp4", order: 0 },
        ],
      }),
    );
    const { onAdd, onDragStart } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    const thumb = screen.getByTitle("Stays in the project.");
    fireEvent.keyDown(thumb, { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.dragStart(thumb, { dataTransfer: { effectAllowed: "", setData: vi.fn() } });
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it("canAdd=false leaves Enter a no-op", () => {
    const { onAdd } = panel({ canAdd: false });
    fireEvent.click(screen.getByRole("button", { name: "Campaign square · V1" }));
    fireEvent.keyDown(screen.getByTitle("Square A"), { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("PlaygroundAlbumsPanel role-to-channel mapping", () => {
  // This is the mechanism the spec's "a client never sees, and never requests, an internal
  // design" success criterion rests on: `useProjectDetail` itself coerces to the published
  // projection whenever the signed-in profile is a client (`project-data.ts:105`), but only if
  // this panel ever calls it with a channel a client viewer could plausibly need. Mirrors the same
  // role-to-channel mapping `project-page.tsx:47-52` already uses (minus its agency toggle, which
  // the Playground has none of).
  it("reads the client's published projection for a client viewer", () => {
    auth.profile = { role: "client" };
    panel();
    expect(projectBackend.useProjectDetail).toHaveBeenCalledWith("project-1", "client");
  });

  it("reads working versions for a designer viewer, same as for the agency", () => {
    auth.profile = { role: "designer" };
    panel();
    expect(projectBackend.useProjectDetail).toHaveBeenCalledWith("project-1", "internal");
  });
});
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/playground/playground-albums-panel.test.tsx`
Expected: PASS (11 tests total).

- [ ] **Step 7: Add the panel's styles**

Append to `apps/web/features/playground/playground.css` (after the existing `.playground-footer`
rules, before the first `@media` block):

```css
.playground-albums {
  border-bottom: 1px solid var(--border);
  padding: 8px 20px;
}
.playground-album-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.playground-album-chip {
  flex-shrink: 0;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--foreground);
  font-size: var(--text-sm);
  white-space: nowrap;
  cursor: pointer;
}
.playground-album-chip.is-open {
  background: #526052;
  border-color: #526052;
  color: #fff;
}
.playground-album-divider {
  flex-shrink: 0;
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 2px;
}
.playground-album-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-top: 8px;
}
.playground-album-thumb {
  flex-shrink: 0;
  width: 76px;
  height: 76px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px;
  border: 2px solid transparent;
  border-radius: var(--radius);
  background: var(--canvas-background, #e9e9e2);
  color: var(--muted);
  cursor: grab;
  overflow: hidden;
}
.playground-album-thumb img {
  width: 100%;
  height: 44px;
  object-fit: cover;
  border-radius: calc(var(--radius) - 2px);
}
.playground-album-thumb span {
  font-size: 10px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.playground-album-thumb.is-selected {
  border-color: #526052;
}
.playground-album-thumb.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
```

- [ ] **Step 8: Run the full checks**

Run: `cd apps/web && npx tsc --noEmit && npx eslint features/playground/playground-albums-panel.tsx features/playground/playground-albums-panel.test.tsx`
Expected: no type or lint errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/features/playground/playground-albums-panel.tsx apps/web/features/playground/playground-albums-panel.test.tsx apps/web/features/playground/playground.css
git commit -m "feat(playground): render the album chip row and thumbnail row"
```

---

### Task 4: Copy orchestration and board wiring

**Files:**
- Modify: `apps/web/features/playground/playground-albums.ts` (append `copyAlbumFilesToBoard`)
- Modify: `apps/web/features/playground/playground-albums.test.ts` (append its tests)
- Modify: `apps/web/features/playground/use-playground-drop.ts` (add `viewCenter`)
- Modify: `apps/web/features/playground/playground-board.tsx` (mount the panel, wire drag/copy/retry)
- Modify: `apps/web/features/playground/playground-board.test.tsx` (append wiring tests)

**Interfaces:**
- Consumes: `fileNameFor`, `type AlbumFile` (Task 1); `downloadBrandAssetFile`
  (`@/features/brand/brand-data`, unmodified); `downloadDesignAssetFile` (Task 2);
  `PLAYGROUND_ALBUM_DRAG_TYPE`, `PlaygroundAlbumsPanel` (Task 3).
- Produces:
  - `export type CopyDependencies = { downloadBrand: (storagePath: string) => Promise<Blob>; downloadDesign: (assetPath: string, channel: ProjectChannel) => Promise<Blob> }`
  - `export type CopyStatus = { id: string; file: AlbumFile; point: { x: number; y: number }; state: "loading" } | { id: string; file: AlbumFile; point: { x: number; y: number }; state: "done" } | { id: string; file: AlbumFile; point: { x: number; y: number }; state: "error"; error: string }`
  - `export async function copyAlbumFilesToBoard(files: AlbumFile[], point: { x: number; y: number }, deps: CopyDependencies, onStatus: (status: CopyStatus) => void): Promise<File[]>`
  - `usePlaygroundDrop(...)` now additionally returns `viewCenter: () => { x: number; y: number }`.

**Design decision:** `copyAlbumFilesToBoard` is "pure-ish" orchestration over injected async
dependencies — no Supabase import, no React — the same shape and the same reason
`bulk-drop-upload.ts` was split out from `bulk-drop-model.ts` in the sibling bulk-image-drop plan:
concurrency and per-file independence are non-obvious correctness properties that deserve their own
unit tests without React Testing Library. It stays in `playground-albums.ts` rather than becoming a
third file, because the spec's Units section and this plan's file list authorize exactly two files.

- [ ] **Step 1: Write the failing tests for `copyAlbumFilesToBoard`**

Append to `playground-albums.test.ts`:

```ts
import {
  copyAlbumFilesToBoard,
  type AlbumFile,
  type CopyDependencies,
  type CopyStatus,
} from "./playground-albums";

function albumFile(id: string, kind: "brand" | "design" = "brand"): AlbumFile {
  return {
    id,
    title: `File ${id}`,
    mimeType: "image/png",
    sizeBytes: null,
    source:
      kind === "brand"
        ? { kind: "brand", storagePath: `client-1/${id}.png` }
        : { kind: "design", channel: "internal", assetPath: `project-1/${id}.png` },
  };
}

describe("copyAlbumFilesToBoard", () => {
  it("downloads every file, reports loading then done, and resolves Files in input order", async () => {
    const statuses: CopyStatus[] = [];
    const deps: CopyDependencies = {
      downloadBrand: async (path) => new Blob([path]),
      downloadDesign: async () => new Blob(["x"]),
    };
    const files = await copyAlbumFilesToBoard(
      [albumFile("a"), albumFile("b")],
      { x: 1, y: 2 },
      deps,
      (status) => statuses.push(status),
    );
    expect(files.map((f) => f.name)).toEqual(["File a.png", "File b.png"]);
    expect(statuses.filter((s) => s.state === "loading")).toHaveLength(2);
    expect(statuses.filter((s) => s.state === "done")).toHaveLength(2);
  });

  it("reports an error for one failed file without affecting the others' success", async () => {
    const statuses: CopyStatus[] = [];
    const deps: CopyDependencies = {
      downloadBrand: async (path) => {
        if (path.includes("/b.")) throw new Error("network error");
        return new Blob([path]);
      },
      downloadDesign: async () => new Blob(["x"]),
    };
    const files = await copyAlbumFilesToBoard(
      [albumFile("a"), albumFile("b"), albumFile("c")],
      { x: 0, y: 0 },
      deps,
      (status) => statuses.push(status),
    );
    expect(files.map((f) => f.name)).toEqual(["File a.png", "File c.png"]);
    const failed = statuses.find((status) => status.state === "error");
    expect(failed?.state).toBe("error");
    expect(failed && failed.state === "error" && failed.error).toBe("network error");
  });

  it("never runs more than three downloads at once", async () => {
    let active = 0;
    let peak = 0;
    const deps: CopyDependencies = {
      downloadBrand: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return new Blob(["x"]);
      },
      downloadDesign: async () => new Blob(["x"]),
    };
    await copyAlbumFilesToBoard(
      [albumFile("a"), albumFile("b"), albumFile("c"), albumFile("d"), albumFile("e")],
      { x: 0, y: 0 },
      deps,
      () => {},
    );
    expect(peak).toBe(3);
  });

  it("calls downloadDesign with the file's own channel for a design source, never downloadBrand", async () => {
    const downloadDesign = vi.fn(async () => new Blob(["x"]));
    const downloadBrand = vi.fn(async () => new Blob(["x"]));
    await copyAlbumFilesToBoard(
      [albumFile("a", "design")],
      { x: 0, y: 0 },
      { downloadBrand, downloadDesign },
      () => {},
    );
    expect(downloadDesign).toHaveBeenCalledWith("project-1/a.png", "internal");
    expect(downloadBrand).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/playground/playground-albums.test.ts -t "copyAlbumFilesToBoard"`
Expected: FAIL — `copyAlbumFilesToBoard` is not exported yet.

- [ ] **Step 3: Implement `copyAlbumFilesToBoard`**

Append to `playground-albums.ts`:

```ts
export type CopyDependencies = {
  downloadBrand: (storagePath: string) => Promise<Blob>;
  downloadDesign: (assetPath: string, channel: ProjectChannel) => Promise<Blob>;
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
  const results: (File | undefined)[] = new Array(files.length);
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const index = cursor++;
      const file = files[index];
      const id = crypto.randomUUID();
      onStatus({ id, file, point, state: "loading" });
      try {
        const path = file.source.kind === "brand" ? file.source.storagePath : file.source.assetPath;
        const blob =
          file.source.kind === "brand"
            ? await deps.downloadBrand(file.source.storagePath)
            : await deps.downloadDesign(file.source.assetPath, file.source.channel);
        results[index] = new File([blob], fileNameFor(file.title, path), { type: file.mimeType });
        onStatus({ id, file, point, state: "done" });
      } catch (error) {
        onStatus({
          id,
          file,
          point,
          state: "error",
          error: error instanceof Error ? error.message : "This file could not be copied.",
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
  return results.filter((file): file is File => file !== undefined);
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/playground/playground-albums.test.ts`
Expected: PASS (24 tests total).

- [ ] **Step 5: Add `viewCenter` to `usePlaygroundDrop`**

In `apps/web/features/playground/use-playground-drop.ts`, add a new function right after `origin()`
(after its closing brace, before `async function addFiles`):

```ts
  /** The current viewport's center in flow coordinates — where a keyboard-triggered album add
   * lands, as distinct from `origin()` (used for a native drop/file-picker batch, anchored near the
   * viewport's top-left instead). */
  function viewCenter() {
    const bounds = canvas.current?.getBoundingClientRect();
    return bounds && flow.current
      ? flow.current.screenToFlowPosition({
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
        })
      : { x: 40, y: 40 };
  }
```

In the same file's `return` statement, add `viewCenter,` alongside the existing `origin,`.

- [ ] **Step 6: Run the existing Playground board tests to verify nothing broke**

Run: `cd apps/web && npx vitest run features/playground/playground-board.test.tsx`
Expected: PASS — `viewCenter` is additive; nothing yet calls it.

- [ ] **Step 7: Wire `playground-board.tsx`**

Add these imports, alongside the existing ones (near the top of
`apps/web/features/playground/playground-board.tsx`):

```tsx
import { downloadBrandAssetFile } from "@/features/brand/brand-data";
import { downloadDesignAssetFile } from "@/features/projects/project-data";
import {
  copyAlbumFilesToBoard,
  PLAYGROUND_ALBUM_DRAG_TYPE,
  type AlbumFile,
  type CopyStatus,
} from "./playground-albums";
import { PlaygroundAlbumsPanel } from "./playground-albums-panel";
```

Add state next to the existing `useState`/`useRef` declarations (near `const [downloadError,
setDownloadError] = useState("");`):

```tsx
  const [copies, setCopies] = useState<CopyStatus[]>([]);
  const albumDrag = useRef<AlbumFile[] | null>(null);
```

Add these two functions near `download()` (after its closing brace):

```tsx
  function onCopyStatus(status: CopyStatus) {
    setCopies((current) => {
      const withoutId = current.filter((entry) => entry.id !== status.id);
      return status.state === "done" ? withoutId : [...withoutId, status];
    });
  }

  async function copyAlbumFiles(files: AlbumFile[], point: { x: number; y: number }) {
    const downloaded = await copyAlbumFilesToBoard(
      files,
      point,
      {
        downloadBrand: (storagePath) => downloadBrandAssetFile(database, { path: storagePath }),
        downloadDesign: (assetPath, channel) =>
          downloadDesignAssetFile(database, { assetPath, channel }),
      },
      onCopyStatus,
    );
    if (downloaded.length) await addFiles(downloaded, point);
  }

  function retryCopy(status: Extract<CopyStatus, { state: "error" }>) {
    void copyAlbumFiles([status.file], status.point);
  }
```

Replace the `usePlaygroundDrop` destructure to also take `viewCenter`:

```tsx
  const {
    canvas,
    fileInput,
    flow,
    setFlowInstance,
    dragOver,
    setDragOver,
    issues,
    setIssues,
    origin,
    viewCenter,
    addFiles,
  } = usePlaygroundDrop({ boardId, itemCount: items.length, writeDraft, select, persist });
```

Mount the panel immediately after the header closes, and render the copy-status list, replacing:

```tsx
        </header>
        {query.error && (
```

with:

```tsx
        </header>
        <PlaygroundAlbumsPanel
          clientId={clientId}
          projectId={projectId}
          canAdd={!!boardId && !closing && items.length < PLAYGROUND_MAX_ITEMS}
          viewCenter={viewCenter}
          onAdd={(files, point) => void copyAlbumFiles(files, point)}
          onDragStart={(files) => {
            albumDrag.current = files;
          }}
          onDragEnd={() => {
            albumDrag.current = null;
          }}
        />
        {copies.length > 0 && (
          <div className="playground-upload-issues" role="alert">
            {copies.map((status) => (
              <div key={status.id}>
                <span>
                  <strong>{status.file.title}:</strong>{" "}
                  {status.state === "loading" ? "Copying…" : status.state === "error" ? status.error : null}
                </span>
                {status.state === "error" && (
                  <button type="button" className="button" onClick={() => retryCopy(status)}>
                    Try again
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {query.error && (
```

Extend the canvas's drop target to recognize an in-app album drag alongside a native file drop.
Replace:

```tsx
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDragOver(true);
              }
            }}
```

with:

```tsx
            onDragOver={(event) => {
              if (
                event.dataTransfer.types.includes("Files") ||
                event.dataTransfer.types.includes(PLAYGROUND_ALBUM_DRAG_TYPE)
              ) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDragOver(true);
              }
            }}
```

Replace the canvas's `onDrop`:

```tsx
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragOver(false);
              const point = flow.current?.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
              });
              void addFiles(Array.from(event.dataTransfer.files), point);
            }}
```

with:

```tsx
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragOver(false);
              const point =
                flow.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ??
                origin();
              const dragged = albumDrag.current;
              albumDrag.current = null;
              if (dragged) {
                void copyAlbumFiles(dragged, point);
                return;
              }
              void addFiles(Array.from(event.dataTransfer.files), point);
            }}
```

- [ ] **Step 8: Write the failing tests for the board wiring**

Add to `apps/web/features/playground/playground-board.test.tsx`, near the top with the other
`vi.mock` calls:

```tsx
vi.mock("./playground-albums-panel", () => ({
  PlaygroundAlbumsPanel: (props: {
    onAdd: (files: unknown[], point: { x: number; y: number }) => void;
  }) => (
    <button onClick={() => props.onAdd([{ id: "album-file", title: "Album file" }], { x: 5, y: 5 })}>
      Trigger album add
    </button>
  ),
}));
const albumBackend = vi.hoisted(() => ({ copyAlbumFilesToBoard: vi.fn() }));
vi.mock("./playground-albums", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./playground-albums")>()),
  copyAlbumFilesToBoard: albumBackend.copyAlbumFilesToBoard,
}));
vi.mock("@/features/brand/brand-data", () => ({ downloadBrandAssetFile: vi.fn() }));
vi.mock("@/features/projects/project-data", () => ({ downloadDesignAssetFile: vi.fn() }));
```

Add a new `describe` block:

```tsx
describe("Playground albums wiring", () => {
  it("copies a file added through the albums panel onto the board", async () => {
    albumBackend.copyAlbumFilesToBoard.mockResolvedValue([
      new File(["x"], "Logo.png", { type: "image/png" }),
    ]);
    const user = userEvent.setup();
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);
    await user.click(screen.getByText("Trigger album add"));
    await waitFor(() => expect(albumBackend.copyAlbumFilesToBoard).toHaveBeenCalled());
    expect(await screen.findByText("Logo.png")).toBeInTheDocument();
  });

  it("shows Try again for a failed copy and retries it on click", async () => {
    albumBackend.copyAlbumFilesToBoard.mockImplementationOnce(
      async (
        _files: unknown,
        _point: unknown,
        _deps: unknown,
        onStatus: (status: unknown) => void,
      ) => {
        onStatus({
          id: "copy-1",
          file: { id: "album-file", title: "Album file" },
          point: { x: 5, y: 5 },
          state: "error",
          error: "network error",
        });
        return [];
      },
    );
    const user = userEvent.setup();
    render(<PlaygroundBoard clientId="client" projectId="project" onClose={vi.fn()} />);
    await user.click(screen.getByText("Trigger album add"));
    expect(await screen.findByText("network error")).toBeInTheDocument();
    albumBackend.copyAlbumFilesToBoard.mockResolvedValueOnce([]);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(albumBackend.copyAlbumFilesToBoard).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 9: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/playground/playground-board.test.tsx`
Expected: PASS, including every pre-existing test in this file.

- [ ] **Step 10: Run the full checks**

Run: `cd apps/web && npm run check`
Expected: typecheck, eslint, prettier and every unit suite pass.

- [ ] **Step 11: Commit**

```bash
git add apps/web/features/playground/playground-albums.ts apps/web/features/playground/playground-albums.test.ts apps/web/features/playground/use-playground-drop.ts apps/web/features/playground/playground-board.tsx apps/web/features/playground/playground-board.test.tsx
git commit -m "feat(playground): copy album files onto the board through the existing drop flow"
```

---

### Task 5: Playwright — drag scenarios and the client network assertion

**Files:**
- Modify: `apps/web/tests/e2e/playground-fixture.ts` (add a seed helper)
- Modify: `apps/web/tests/e2e/playground.spec.ts` (add two scenarios)

**Interfaces:**
- Consumes: `createPlaygroundFixture`, `credentials`, `localAdmin`, `localCaller`, `signIn` (all
  existing, unmodified, from `./playground-fixture` / `./test-support`); the `playground(page)` /
  `openPlayground(page)` helpers already defined at the top of `playground.spec.ts`.
- Produces:
  - `export async function seedPlaygroundAlbumsFixture(fixture: { clientId: string; projectId: string }): Promise<{ folderId: string; assetId: string; designId: string; cleanup: () => Promise<void> }>`

- [ ] **Step 1: Add the fixture seed helper**

Append to `apps/web/tests/e2e/playground-fixture.ts`:

```ts
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

/**
 * Adds one Brand Hub asset (in a named folder) and one internal design version/design — plus its
 * published copy, shared with the client — to a fixture project. Kept separate from
 * `createPlaygroundFixture()` so every other Playground scenario's setup stays as small as today.
 * The design/publication rows and their `internal-assets`/`published-assets` objects are already
 * swept by `cleanupTestProject` (called from the base fixture's `cleanup`, keyed by project id);
 * only the Brand Hub asset is client-scoped and needs its own storage cleanup here.
 */
export async function seedPlaygroundAlbumsFixture(fixture: { clientId: string; projectId: string }) {
  const folder = value(
    await localAdmin
      .from("brand_asset_folders")
      .insert({ client_id: fixture.clientId, name: "Acceptance logos" })
      .select("id")
      .single(),
  );
  const assetPath = `${fixture.clientId}/${randomUUID()}.png`;
  const uploadedAsset = await localAdmin.storage
    .from("brand-assets")
    .upload(assetPath, onePixelPng, { contentType: "image/png", upsert: false });
  if (uploadedAsset.error) throw uploadedAsset.error;
  const asset = value(
    await localAdmin
      .from("brand_assets")
      .insert({
        client_id: fixture.clientId,
        folder_id: folder.id,
        name: "Acceptance wordmark",
        category: "Logo",
        mime_type: "image/png",
        storage_path: assetPath,
      })
      .select("id")
      .single(),
  );

  const designer = await localCaller(credentials.designer);
  const designerAccount = await designer.auth.getUser();
  if (designerAccount.error || !designerAccount.data.user)
    throw new Error("Designer fixture authentication failed.");
  const deliverable = value(
    await localAdmin
      .from("deliverables")
      .select("id")
      .eq("project_id", fixture.projectId)
      .eq("name", "Campaign square")
      .single(),
  );
  const version = value(
    await localAdmin
      .from("design_versions")
      .insert({
        project_id: fixture.projectId,
        deliverable_id: deliverable.id,
        version_number: 1,
        created_by: designerAccount.data.user.id,
      })
      .select("id")
      .single(),
  );
  const designPath = `${fixture.projectId}/${randomUUID()}.png`;
  const uploadedDesign = await localAdmin.storage
    .from("internal-assets")
    .upload(designPath, onePixelPng, { contentType: "image/png", upsert: false });
  if (uploadedDesign.error) throw uploadedDesign.error;
  const design = value(
    await localAdmin
      .from("designs")
      .insert({
        project_id: fixture.projectId,
        version_id: version.id,
        title: "Acceptance square design",
        internal_asset_path: designPath,
        sort_order: 0,
        created_by: designerAccount.data.user.id,
      })
      .select("id")
      .single(),
  );
  const publication = value(
    await localAdmin
      .from("published_versions")
      .insert({ project_id: fixture.projectId, deliverable_id: deliverable.id, version_number: 1 })
      .select("id")
      .single(),
  );
  const publishedPath = `${fixture.projectId}/${randomUUID()}.png`;
  const uploadedPublished = await localAdmin.storage
    .from("published-assets")
    .upload(publishedPath, onePixelPng, { contentType: "image/png", upsert: false });
  if (uploadedPublished.error) throw uploadedPublished.error;
  const published = await localAdmin.from("published_designs").insert({
    project_id: fixture.projectId,
    publication_id: publication.id,
    title: "Acceptance square design",
    asset_path: publishedPath,
    sort_order: 0,
  });
  if (published.error) throw published.error;

  async function cleanup() {
    const removed = await localAdmin.storage.from("brand-assets").remove([assetPath]);
    if (removed.error) throw removed.error;
  }
  return { folderId: folder.id, assetId: asset.id, designId: design.id, cleanup };
}
```

Add `randomUUID` is already imported at the top of this file (`import { randomUUID } from
"node:crypto";`) — no new import needed for it.

- [ ] **Step 2: Write the agency drag scenario**

Append to `apps/web/tests/e2e/playground.spec.ts`:

```ts
import { seedPlaygroundAlbumsFixture } from "./playground-fixture";

test("an agency session drags a Brand Hub asset and a working design onto the Playground board", async ({
  page,
  workspace,
}) => {
  const seed = await seedPlaygroundAlbumsFixture(workspace);
  try {
    await signIn(page, credentials.agency);
    await page.goto(`/projects/${workspace.projectId}`);
    await openPlayground(page);
    const board = playground(page);

    await board.getByRole("button", { name: "Acceptance logos" }).click();
    const brandThumb = board.getByTitle("Acceptance wordmark");
    await expect(brandThumb).toBeVisible();
    await brandThumb.dragTo(board.locator(".playground-canvas"));
    await expect(board.getByText("Acceptance wordmark.png")).toBeVisible();

    await board.getByRole("button", { name: "Campaign square · V1" }).click();
    const designThumb = board.getByTitle("Acceptance square design");
    await designThumb.dragTo(board.locator(".playground-canvas"), {
      targetPosition: { x: 400, y: 200 },
    });
    await expect(board.getByText("Acceptance square design.png")).toBeVisible();
    await expect(board.getByText("All changes saved")).toBeVisible({ timeout: 15_000 });

    const boardRow = await localAdmin
      .from("playground_boards")
      .select("id")
      .eq("client_id", workspace.clientId)
      .eq("project_id", workspace.projectId)
      .eq("role", "agency")
      .single();
    if (boardRow.error) throw boardRow.error;
    const items = await localAdmin
      .from("playground_items")
      .select("title,asset_path")
      .eq("board_id", boardRow.data.id);
    if (items.error) throw items.error;
    expect(items.data.map((item) => item.title).sort()).toEqual(
      ["Acceptance square design.png", "Acceptance wordmark.png"].sort(),
    );
    for (const item of items.data) {
      if (!item.asset_path) continue;
      const [boardId, itemId] = item.asset_path.split("/");
      const listed = await localAdmin.storage.from("playground-assets").list(`${boardId}/${itemId}`);
      if (listed.error) throw listed.error;
      expect(listed.data.length).toBeGreaterThan(0);
    }
  } finally {
    await seed.cleanup();
  }
});
```

- [ ] **Step 3: Run the agency scenario**

Run: `cd apps/web && npx playwright test tests/e2e/playground.spec.ts -g "drags a Brand Hub asset"`
Expected: PASS against a running local Supabase + dev server (per this repo's Playwright setup).

- [ ] **Step 4: Write the client scenario, with the internal-assets network assertion**

Append to `apps/web/tests/e2e/playground.spec.ts`:

```ts
test("a client session sees only its shared versions, drags a published design onto its board, and never requests internal-assets", async ({
  page,
  workspace,
}) => {
  const seed = await seedPlaygroundAlbumsFixture(workspace);
  try {
    const requestedInternalAssets: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.includes("/internal-assets/")) requestedInternalAssets.push(path);
    });

    await signIn(page, credentials.client);
    await page.goto(`/projects/${workspace.projectId}`);
    await openPlayground(page);
    const board = playground(page);

    await expect(board.getByRole("button", { name: "Acceptance logos" })).toBeVisible();
    await expect(board.getByRole("button", { name: "Campaign square · V1" })).toBeVisible();

    await board.getByRole("button", { name: "Campaign square · V1" }).click();
    const designThumb = board.getByTitle("Acceptance square design");
    await designThumb.dragTo(board.locator(".playground-canvas"));
    await expect(board.getByText("Acceptance square design.png")).toBeVisible();
    await expect(board.getByText("All changes saved")).toBeVisible({ timeout: 15_000 });

    expect(requestedInternalAssets).toEqual([]);
  } finally {
    await seed.cleanup();
  }
});
```

- [ ] **Step 5: Run the client scenario**

Run: `cd apps/web && npx playwright test tests/e2e/playground.spec.ts -g "never requests internal-assets"`
Expected: PASS. Evidence (trace/HTML report) lands under `apps/web/test-results/` and
`apps/web/playwright-report/`, both already ignored by `.gitignore` (verify with `git status
--porcelain apps/web/test-results apps/web/playwright-report` returning nothing tracked before
concluding this task).

- [ ] **Step 6: Run the full Playground Playwright file**

Run: `cd apps/web && npx playwright test tests/e2e/playground.spec.ts`
Expected: PASS, including every pre-existing scenario in this file.

- [ ] **Step 7: Commit**

```bash
git add apps/web/tests/e2e/playground-fixture.ts apps/web/tests/e2e/playground.spec.ts
git commit -m "test(playground): cover the album drag flow and the client internal-assets isolation"
```

---

### Task 6: Documentation — Playground README and verification record

**Files:**
- Modify: `apps/web/features/playground/README.md`
- Create: `docs/verification/playground-albums-2026-09-23.md`

- [ ] **Step 1: Add an "Albums" section to the Playground README**

In `apps/web/features/playground/README.md`, insert a new section after "## Working on the
canvas" and before "## Compact header":

```markdown
## Albums

Below the title, a horizontally scrolling row of album chips lists the client's Brand Hub folders
(`Unfiled` first when it holds files, then named folders alphabetically) and the project's
deliverable versions (`{Deliverable} · V{n}`, ordered by canvas order then version number), for
whichever role is signed in. An album with no storable file gets no chip; a file the Playground
cannot hold still appears in its album, dimmed, its reason on hover and focus (SVG and video, "Stays
in the project"; a file over 25 MB — file size is not stored for either source today, so this check
only ever fires for a caller that can supply one). Clicking a chip opens its thumbnail row; a second
click closes it; only one album is open at a time, and switching albums clears the selection.
Clicking a thumbnail toggles its selection, Shift+click selects a range, and Enter on a focused
thumbnail adds it at the center of the current view.

Dragging a thumbnail — or the whole current selection, if the dragged one is part of it — onto the
canvas downloads that file with the viewer's own session (`downloadBrandAssetFile` from
`brand-data.ts`, or `downloadDesignAssetFile` from `project-data.ts`, chosen by the same
`internal-assets`/`published-assets` channel choice the design viewer already uses), wraps it in a
`File` named after its title and stored extension, and passes the result to this board's own
`addFiles` at the drop point — the same validation, storage, retry and "Waiting to upload…"
placeholder a native drop or the file picker already produce. A download in progress shows in a
small list below the album row ("Copying…"); a failed download keeps its entry there with **Try
again**, without affecting any other file in the same drag. `playground-albums.ts`
(`buildBrandAlbums`, `buildProjectAlbums`, `computeDisabledReason`, `copyAlbumFilesToBoard`) holds
this logic; `playground-albums-panel.tsx` renders it. Every role sees only the albums and files
its existing role-scoped reads already return — a client's `useProjectDetail` call never resolves
`design_versions`/`designs`, so a client session never even requests an `internal-assets` object.
```

- [ ] **Step 2: Update the Verification section's test command**

In the same README, in the `## Verification` section, replace the existing `npx vitest run`
command line:

```markdown
Run the colocated validation and recovery tests from `apps/web`:

```sh
npx vitest run features/playground/playground-model.test.ts features/playground/playground-board.test.tsx features/playground/playground-viewport.test.tsx features/playground/playground-albums.test.ts features/playground/playground-albums-panel.test.tsx
```
```

- [ ] **Step 3: Write the verification record**

Create `docs/verification/playground-albums-2026-09-23.md`:

```markdown
# Playground albums — verification record

Date: 2026-09-23

Spec: `docs/superpowers/specs/2026-09-23-playground-albums-design.md`
Plan: `docs/superpowers/plans/2026-09-23-playground-albums.md`

## Checks executed

- `npm run check` from the repository root: typecheck, eslint, prettier and every unit suite.
- `cd apps/web && npx vitest run features/playground/playground-albums.test.ts features/playground/playground-albums-panel.test.tsx features/playground/playground-board.test.tsx features/projects/project-data.test.ts`
- `cd apps/web && npx playwright test tests/e2e/playground.spec.ts`

## Evidence for the spec's three success criteria

1. **Every role sees only what it can already see elsewhere.** `buildBrandAlbums`/
   `buildProjectAlbums` unit tests (Task 1) prove the transform over each data shape;
   `playground-albums-panel.test.tsx` (Task 3) proves the panel computes its channel the same way
   `project-page.tsx` does; the Playwright client scenario (Task 5) proves no `internal-assets`
   request occurs during a full client Playground session, including the drag itself.
2. **A dragged/added album file behaves exactly like an uploaded file.** The copy flow's only
   integration point is the Playground's existing `addFiles` (Task 4); the agency Playwright
   scenario (Task 5) confirms both a Brand Hub asset and a working design persist as real
   `playground_items` rows with an object in `playground-assets` storage.
3. **A file the Playground cannot hold is visible but disabled.** `computeDisabledReason` unit
   tests and the panel's disabled-thumbnail tests (Tasks 1 and 3) cover SVG, video and the oversize
   branch (see the plan's documented "no stored file size" limitation).

## Known limitation, carried from the plan

Neither `brand_assets` nor `designs`/`published_designs` store a file's byte size, so the oversize
disabled-reason branch cannot fire against real data for a Brand Hub asset between 25 MB and its
own 50 MB ceiling today; a design's stored image can never be oversized because its own upload
ceiling already equals the Playground's. See the plan's Global Constraints for the full reasoning.
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/features/playground/README.md docs/verification/playground-albums-2026-09-23.md
git commit -m "docs(playground): document the albums panel and record its verification"
```
