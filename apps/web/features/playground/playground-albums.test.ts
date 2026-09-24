import { describe, expect, it } from "vitest";
import { ARTWORK_MAX_BYTES } from "@/features/shared/upload-rules";
import type { BrandAsset, BrandAssetFolder } from "@/features/brand/brand-data";
import type { CanvasDesign, CanvasVersion, TableRow } from "@/features/projects/project-data";
import {
  buildBrandAlbums,
  buildProjectAlbums,
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

const folder: Pick<BrandAssetFolder, "id" | "name"> = { id: "folder-1", name: "Logos" };
const brandAssets: Pick<BrandAsset, "id" | "name" | "folder_id" | "mime_type" | "storage_path">[] =
  [
    {
      id: "asset-1",
      name: "Wordmark",
      folder_id: "folder-1",
      mime_type: "image/png",
      storage_path: "client-1/a1.png",
    },
    {
      id: "asset-2",
      name: "Icon",
      folder_id: "folder-1",
      mime_type: "image/svg+xml",
      storage_path: "client-1/a2.svg",
    },
    {
      id: "asset-3",
      name: "Brief",
      folder_id: null,
      mime_type: "application/pdf",
      storage_path: "client-1/a3.pdf",
    },
    {
      id: "asset-4",
      name: "Never stored",
      folder_id: "folder-2",
      mime_type: "image/png",
      storage_path: null,
    },
  ];

describe("buildBrandAlbums", () => {
  it("orders Unfiled first, then named folders alphabetically, and drops a folder with no stored file", () => {
    const albums = buildBrandAlbums(
      [folder, { id: "folder-2", name: "Even earlier" }],
      brandAssets,
    );
    expect(albums.map((album) => album.label)).toEqual(["Unfiled", "Logos"]);
    expect(albums[0].files.map((file) => file.title)).toEqual(["Brief"]);
    expect(albums[1].files.map((file) => file.title)).toEqual(["Icon", "Wordmark"]);
  });

  it("marks every file's disabled reason from its mime type, keeping a disabled file in the album", () => {
    const albums = buildBrandAlbums([folder], brandAssets);
    const logos = albums.find((album) => album.label === "Logos")!;
    expect(logos.files).toHaveLength(2);
    expect(logos.files.find((file) => file.title === "Wordmark")?.disabledReason).toBeUndefined();
    expect(logos.files.find((file) => file.title === "Icon")?.disabledReason).toBe(
      "Stays in the project.",
    );
  });

  it("omits a folder whose only asset has no stored file", () => {
    const albums = buildBrandAlbums(
      [folder, { id: "folder-2", name: "Even earlier" }],
      brandAssets,
    );
    expect(albums.some((album) => album.label === "Even earlier")).toBe(false);
  });

  it("returns no albums when nothing has a stored file", () => {
    expect(buildBrandAlbums([folder], [])).toEqual([]);
  });

  it("tags every brand file's source with its storage path", () => {
    const albums = buildBrandAlbums([folder], brandAssets);
    const wordmark = albums
      .find((a) => a.label === "Logos")!
      .files.find((f) => f.title === "Wordmark")!;
    expect(wordmark.source).toEqual({ kind: "brand", storagePath: "client-1/a1.png" });
  });
});

const deliverables: Pick<TableRow<"deliverables">, "id" | "name" | "sort_order">[] = [
  { id: "d-square", name: "Campaign square", sort_order: 0 },
  { id: "d-story", name: "Campaign story", sort_order: 1 },
];
const versions: CanvasVersion[] = [
  {
    id: "v1",
    projectId: "project-1",
    deliverableId: "d-square",
    number: 1,
    note: "",
    status: "draft",
    date: "",
  },
  {
    id: "v2",
    projectId: "project-1",
    deliverableId: "d-square",
    number: 2,
    note: "",
    status: "draft",
    date: "",
  },
  {
    id: "v3",
    projectId: "project-1",
    deliverableId: "d-story",
    number: 1,
    note: "",
    status: "draft",
    date: "",
  },
];
const designs: CanvasDesign[] = [
  {
    id: "design-1",
    versionId: "v1",
    title: "Square A",
    content: {},
    assetPath: "project-1/design-1.png",
    order: 0,
  },
  {
    id: "design-2",
    versionId: "v2",
    title: "Square B",
    content: {},
    assetPath: "project-1/design-2.png",
    order: 0,
  },
  {
    id: "design-3",
    versionId: "v2",
    title: "Square B video",
    content: {},
    assetPath: "project-1/design-3.mp4",
    order: 1,
  },
  { id: "design-4", versionId: "v3", title: "Story A", content: {}, assetPath: null, order: 0 },
];

describe("buildProjectAlbums", () => {
  it("builds one chip per deliverable version that has at least one stored design, ordered by deliverable then version", () => {
    const albums = buildProjectAlbums(deliverables, versions, designs, "internal");
    expect(albums.map((album) => album.label)).toEqual([
      "Campaign square · V1",
      "Campaign square · V2",
    ]);
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
