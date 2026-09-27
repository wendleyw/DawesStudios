import { describe, expect, it, vi } from "vitest";
import type { BrandAsset, BrandAssetFolder } from "@/features/brand/brand-data";
import {
  buildBrandAlbums,
  buildPlaygroundAlbum,
  clipboardDisabledReason,
  CLIPBOARD_ONLY_IMAGES,
  computeDisabledReason,
  copyAlbumFilesToBoard,
  type AlbumFile,
  type CopyDependencies,
  type CopyStatus,
  fileNameFor,
  isPreviewableImage,
  PLAYGROUND_ALBUM_DRAG_TYPE,
} from "./playground-albums";
import type { PlaygroundItem } from "./playground-types";

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

function albumFile(id: string): AlbumFile {
  return {
    id,
    title: `File ${id}`,
    mimeType: "image/png",
    sizeBytes: null,
    source: { kind: "brand", storagePath: `client-1/${id}.png` },
  };
}

describe("copyAlbumFilesToBoard", () => {
  it("downloads every file, reports loading then done, and resolves Files in input order", async () => {
    const statuses: CopyStatus[] = [];
    const deps: CopyDependencies = {
      downloadBrand: async (path) => new Blob([path]),
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
    };
    await copyAlbumFilesToBoard(
      [albumFile("a"), albumFile("b"), albumFile("c"), albumFile("d"), albumFile("e")],
      { x: 0, y: 0 },
      deps,
      () => {},
    );
    expect(peak).toBe(3);
  });

  it("refuses a Playground file, which is already on the board", async () => {
    const downloadBrand = vi.fn(async () => new Blob(["x"]));
    const statuses: CopyStatus[] = [];
    const files = await copyAlbumFilesToBoard(
      [
        {
          id: "pg",
          title: "Moodboard",
          mimeType: "image/png",
          sizeBytes: null,
          source: { kind: "playground", assetPath: "b/1/m.png" },
        },
      ],
      { x: 0, y: 0 },
      { downloadBrand },
      (status) => statuses.push(status),
    );
    expect(files).toEqual([]);
    expect(downloadBrand).not.toHaveBeenCalled();
    expect(statuses.at(-1)?.state).toBe("error");
  });
});

describe("buildPlaygroundAlbum", () => {
  const item = (
    id: string,
    kind: PlaygroundItem["kind"],
    asset: string | null,
    mime: string | null,
  ) =>
    ({
      id,
      board_id: "b",
      kind,
      title: `Item ${id}`,
      body: "",
      asset_path: asset,
      mime_type: mime,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      revision: 1,
      url: asset ? `https://signed/${id}` : undefined,
    }) as PlaygroundItem;

  it("lists the board's images newest first", () => {
    const album = buildPlaygroundAlbum([
      item("1", "image", "b/1/a.png", "image/png"),
      item("2", "note", null, null),
      item("3", "file", "b/3/a.pdf", "application/pdf"),
      item("4", "image", "b/4/a.jpg", "image/jpeg"),
    ]);
    expect(album?.label).toBe("Playground");
    expect(album?.group).toBe("playground");
    expect(album?.files.map((file) => file.id)).toEqual(["4", "1"]);
    expect(album?.files[0].source).toEqual({
      kind: "playground",
      assetPath: "b/4/a.jpg",
      previewUrl: "https://signed/4",
    });
  });

  it("is null without images", () => {
    expect(buildPlaygroundAlbum([item("2", "note", null, null)])).toBeNull();
  });
});

describe("clipboardDisabledReason", () => {
  const file = (mimeType: string) =>
    ({
      id: "f",
      title: "F",
      mimeType,
      sizeBytes: null,
      source: { kind: "brand", storagePath: "p" },
    }) as const;
  it("allows PNG, JPEG and WebP", () => {
    for (const mime of ["image/png", "image/jpeg", "image/webp"])
      expect(clipboardDisabledReason({ ...file(mime) })).toBeUndefined();
  });
  it("refuses everything else", () => {
    for (const mime of ["application/pdf", "image/svg+xml", "video/mp4", "image/gif"])
      expect(clipboardDisabledReason({ ...file(mime) })).toBe(CLIPBOARD_ONLY_IMAGES);
  });
});
