import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ARTWORK_MAX_BYTES,
  BUCKET_MAX_BYTES,
  brandUploadMimes,
  standardUploadMimes,
  uploadExtensionMap,
  uploadSizeMessage,
  uploadTypeMessage,
  uploadTypesLabel,
  acceptedExtensions,
} from "./upload-rules";

// Postgres owns the upload contract; `upload-rules.ts` only restates it early enough to explain
// the rejection. That restatement is only useful while it is true, so these tests read the
// migrations themselves rather than a copy of their values. If someone raises the bucket limit or
// widens a bucket's `allowed_mime_types` without editing the shared module, this file fails.

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

/** Every `allowed_mime_types` array in a `storage.buckets` insert, keyed by bucket id. */
function bucketMimeTypes(sql: string): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  const pattern = /\('([a-z-]+)','[a-z-]+',(?:true|false),(\d+),array\[([^\]]*)\]\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql))) {
    buckets.set(
      match[1],
      match[3].split(",").map((value) => value.trim().replace(/^'|'$/g, "")),
    );
  }
  return buckets;
}

function bucketSizeLimits(sql: string): number[] {
  return [...sql.matchAll(/\('[a-z-]+','[a-z-]+',(?:true|false),(\d+),array\[/g)].map((match) =>
    Number(match[1]),
  );
}

describe("the client upload ceiling mirrors the bucket limit", () => {
  it("matches `file_size_limit` on every bucket the migrations create", () => {
    const limits = [
      ...bucketSizeLimits(migration("202609200003_storage.sql")),
      ...bucketSizeLimits(migration("202609200004_requests_and_attachments.sql")),
    ];
    expect(limits.length).toBeGreaterThan(0);
    for (const limit of limits) expect(limit).toBe(BUCKET_MAX_BYTES);
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
  it("matches `internal-assets` for the standard uploaders", () => {
    const buckets = bucketMimeTypes(migration("202609200003_storage.sql"));
    expect(buckets.get("internal-assets")).toEqual([...standardUploadMimes]);
  });

  it("matches `briefing-files` for briefing attachments", () => {
    const buckets = bucketMimeTypes(migration("202609200004_requests_and_attachments.sql"));
    expect(buckets.get("briefing-files")).toEqual([...standardUploadMimes]);
  });

  it("grants SVG to brand assets only, which is the only bucket that allows it", () => {
    const buckets = bucketMimeTypes(migration("202609200003_storage.sql"));
    expect(brandUploadMimes).toContain("image/svg+xml");
    expect(standardUploadMimes).not.toContain("image/svg+xml");
    for (const [id, mimes] of buckets) {
      expect(mimes.includes("image/svg+xml")).toBe(id === "brand-assets");
    }
    expect([...brandUploadMimes].sort()).toEqual([...(buckets.get("brand-assets") ?? [])].sort());
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
