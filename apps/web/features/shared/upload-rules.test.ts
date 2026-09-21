import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ARTWORK_MAX_BYTES,
  BUCKET_MAX_BYTES,
  VIDEO_MAX_BYTES,
  brandUploadMimes,
  designUploadMimes,
  standardUploadMimes,
  uploadExtensionMap,
  uploadSizeMessage,
  uploadTypeMessage,
  uploadTypesLabel,
  videoUploadMimes,
  acceptedExtensions,
} from "./upload-rules";

// Postgres owns the upload contract; `upload-rules.ts` only restates it early enough to explain
// the rejection. That restatement is only useful while it is true, so these tests read the
// migrations themselves rather than a copy of their values.
//
// A bucket's real value is not always the one it was created with: a later migration can
// `update storage.buckets set ...` over an earlier `insert`. `effectiveBucketLimits` and
// `effectiveBucketMimeTypes` below compute each bucket's final value by applying every source
// file's updates over its inserts, in the order the sources are given, so the assertions compare
// against what the bucket actually enforces rather than only its first migration. Adding a
// migration that touches `storage.buckets` therefore requires adding its filename to the source
// list passed to those functions here — that is the one manual step this file cannot verify for
// you. Forgetting it, or drifting the module's exported constants from the bucket values, fails
// this file.

const migrations = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
);

function migration(name: string): string {
  return readFileSync(join(migrations, name), "utf8");
}

/** Each bucket's effective `allowed_mime_types`: the inserted list with later appends applied. */
function effectiveBucketMimeTypes(sources: string[]): Map<string, string[]> {
  const mimes = new Map<string, string[]>();
  const unquote = (v: string) => v.trim().replace(/^'|'$/g, "");
  for (const sql of sources) {
    for (const m of sql.matchAll(/\('([a-z-]+)','[a-z-]+',(?:true|false),\d+,array\[([^\]]*)\]\)/g))
      mimes.set(m[1], m[2].split(",").map(unquote));
    // `update storage.buckets set ... allowed_mime_types = allowed_mime_types || array[...]
    //  where id in ('a','b')`
    for (const m of sql.matchAll(
      /update storage\.buckets[\s\S]*?allowed_mime_types\s*=\s*allowed_mime_types\s*\|\|\s*array\[([^\]]*)\][\s\S]*?where id in \(([^)]*)\)/gi,
    ))
      for (const id of m[2].split(",").map(unquote))
        mimes.set(id, [...(mimes.get(id) ?? []), ...m[1].split(",").map(unquote)]);
  }
  return mimes;
}

/** Each bucket's effective `file_size_limit`: the inserted value with later updates applied. */
function effectiveBucketLimits(sources: string[]): Map<string, number> {
  const limits = new Map<string, number>();
  for (const sql of sources) {
    for (const m of sql.matchAll(/\('([a-z-]+)','[a-z-]+',(?:true|false),(\d+),array\[/g))
      limits.set(m[1], Number(m[2]));
    // `update storage.buckets set file_size_limit = N ... where id in ('a','b')`
    for (const m of sql.matchAll(
      /update storage\.buckets\s+set\s+file_size_limit\s*=\s*(\d+)[\s\S]*?where id in \(([^)]*)\)/gi,
    ))
      for (const id of m[2].split(",").map((v) => v.trim().replace(/^'|'$/g, "")))
        limits.set(id, Number(m[1]));
  }
  return limits;
}

describe("the client upload ceiling mirrors the bucket limit", () => {
  it("matches the effective file_size_limit on every bucket the migrations create", () => {
    const limits = effectiveBucketLimits([
      migration("202609200003_storage.sql"),
      migration("202609200004_requests_and_attachments.sql"),
      migration("202609210004_video_storage.sql"),
    ]);
    expect(limits.size).toBeGreaterThan(0);
    // The two design buckets carry video and are deliberately larger. Every other bucket holds
    // images, PDFs and delivery archives, and stays where it was.
    const designBuckets = ["internal-assets", "published-assets"];
    for (const [id, limit] of limits)
      expect(limit).toBe(designBuckets.includes(id) ? VIDEO_MAX_BYTES : BUCKET_MAX_BYTES);
  });

  it("fails a bucket that has drifted from the pre-video expectation", () => {
    // This is the guard proving itself: without applying the video migration's `update`, every
    // bucket "looks like" it is still at the base ceiling, so asserting the old, single-value
    // expectation against the effective (post-update) limits must now fail for the design
    // buckets. If this assertion stopped failing, the guard above would be blind again.
    const limits = effectiveBucketLimits([
      migration("202609200003_storage.sql"),
      migration("202609200004_requests_and_attachments.sql"),
      migration("202609210004_video_storage.sql"),
    ]);
    const drifted = [...limits.values()].some((limit) => limit !== BUCKET_MAX_BYTES);
    expect(drifted).toBe(true);
  });

  it("matches the `file_size` check constraints that guard the attachment tables", () => {
    const checks = [
      ...migration("202609200004_requests_and_attachments.sql").matchAll(
        /file_size bigint not null check\(file_size between 1 and (\d+)\)/g,
      ),
      ...migration("202609200008_trusted_media.sql").matchAll(
        /file_size bigint not null check\(file_size between 1 and (\d+)\)/g,
      ),
    ].map((match) => Number(match[1]));
    expect(checks.length).toBeGreaterThan(0);
    for (const limit of checks) expect(limit).toBe(BUCKET_MAX_BYTES);
  });

  it("keeps the design-artwork ceiling deliberately below the bucket limit", () => {
    // Not drift. `sanitizeArtwork` decodes and re-encodes the file through a canvas, and its
    // megapixel guard can only run after the decode has allocated the bitmap.
    expect(ARTWORK_MAX_BYTES).toBeLessThan(BUCKET_MAX_BYTES);
  });
});

describe("the per-consumer allow-lists mirror their buckets", () => {
  it("matches `internal-assets` for the standard uploaders, plus video", () => {
    const mimes = effectiveBucketMimeTypes([
      migration("202609200003_storage.sql"),
      migration("202609210004_video_storage.sql"),
    ]);
    // `internal-assets` is a design bucket: it keeps every standard type and gains video on top,
    // it does not shrink to `designUploadMimes`.
    expect(mimes.get("internal-assets")).toEqual([
      ...standardUploadMimes,
      "video/mp4",
      "video/webm",
    ]);
  });

  it("matches `briefing-files` for briefing attachments", () => {
    const mimes = effectiveBucketMimeTypes([
      migration("202609200004_requests_and_attachments.sql"),
    ]);
    expect(mimes.get("briefing-files")).toEqual([...standardUploadMimes]);
  });

  it("grants SVG to brand assets only, which is the only bucket that allows it", () => {
    const mimes = effectiveBucketMimeTypes([
      migration("202609200003_storage.sql"),
      migration("202609210004_video_storage.sql"),
    ]);
    expect(brandUploadMimes).toContain("image/svg+xml");
    expect(standardUploadMimes).not.toContain("image/svg+xml");
    for (const [id, list] of mimes) {
      expect(list.includes("image/svg+xml")).toBe(id === "brand-assets");
    }
    expect([...brandUploadMimes].sort()).toEqual([...(mimes.get("brand-assets") ?? [])].sort());
  });
});

describe("the messages each uploader shows", () => {
  it("names the allow-list in declaration order", () => {
    expect(uploadTypesLabel(standardUploadMimes)).toBe("PNG, JPG, WebP, or PDF");
    expect(uploadTypesLabel(brandUploadMimes)).toBe("PNG, JPG, WebP, SVG, or PDF");
    expect(uploadTypeMessage(standardUploadMimes)).toBe("Choose a PNG, JPG, WebP, or PDF file.");
    expect(uploadTypeMessage(brandUploadMimes)).toBe("Choose a PNG, JPG, WebP, SVG, or PDF file.");
  });

  it("states the ceiling once, in megabytes, from the byte value", () => {
    expect(uploadSizeMessage()).toBe("Choose a file no larger than 50 MB.");
    expect(uploadSizeMessage(ARTWORK_MAX_BYTES)).toBe("Choose a file no larger than 25 MB.");
  });
});

describe("the extension vocabulary", () => {
  it("names a stored object with the canonical extension for its type", () => {
    expect(uploadExtensionMap(standardUploadMimes)).toEqual({
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "application/pdf": "pdf",
    });
  });

  it("accepts both spellings of a JPEG filename but nothing off the allow-list", () => {
    expect(acceptedExtensions(standardUploadMimes, "image/jpeg")).toEqual(["jpg", "jpeg"]);
    expect(acceptedExtensions(standardUploadMimes, "image/svg+xml")).toEqual([]);
    expect(acceptedExtensions(brandUploadMimes, "image/svg+xml")).toEqual(["svg"]);
    expect(acceptedExtensions(standardUploadMimes, "text/html")).toEqual([]);
  });
});

describe("video", () => {
  it("keeps the artwork ceiling far below the video one", () => {
    expect(ARTWORK_MAX_BYTES).toBeLessThan(VIDEO_MAX_BYTES);
  });

  it("offers image and video together on the design path", () => {
    expect(designUploadMimes).toContain("image/png");
    expect(designUploadMimes).toContain("video/mp4");
    expect(designUploadMimes).toContain("video/webm");
  });

  it("names video types in prose a person can read", () => {
    expect(uploadTypesLabel(videoUploadMimes)).toBe("MP4, or WebM");
  });
});
