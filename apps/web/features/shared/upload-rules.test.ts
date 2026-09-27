import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BUCKET_MAX_BYTES,
  VIDEO_MAX_BYTES,
  brandUploadMimes,
  standardUploadMimes,
  uploadExtensionMap,
  uploadSizeMessage,
  uploadTypeMessage,
  uploadTypesLabel,
  acceptedExtensions,
  fileTypeLabel,
  mimeForPath,
} from "./upload-rules";

// Postgres owns the upload contract; `upload-rules.ts` only restates it early enough to explain
// the rejection. That restatement is only useful while it is true, so these tests read the
// migrations themselves rather than a copy of their values.
//
// A bucket's real value is not always the one it was created with: a later migration can
// `update storage.buckets set ...` over an earlier `insert`. `effectiveBucketLimits` and
// `effectiveBucketMimeTypes` below compute each bucket's final value by applying every source
// file's updates over its inserts, in the order the sources are given, so the assertions compare
// against what the bucket actually enforces rather than only its first migration. The update
// parsing is deliberately shape-tolerant within a single `update storage.buckets ... ;`
// statement: `file_size_limit` and the `allowed_mime_types` append are each found independently
// of their position in the `set` list and of each other (a statement may set only one of the
// two), and the target ids are read from either `where id in (...)` or `where id = '...'`.
//
// What this file still cannot verify for you: a migration that touches `storage.buckets` must be
// added by hand to the source list passed to `effectiveBucketLimits`/`effectiveBucketMimeTypes`
// in each test below. A new migration that changes a bucket but is never added to those lists
// will not be seen, and this file will keep passing against the old, stale values — that gap is
// structural, not something a parsing fix can close. Once a migration *is* in the list, drift
// between its effective values and this module's exported constants does fail this file.

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

function unquote(value: string): string {
  return value.trim().replace(/^'|'$/g, "");
}

/**
 * Every `update storage.buckets ... ;` statement in a migration, as raw SQL text. Matched from
 * the `update` keyword to its terminating semicolon so the two column-specific parsers below can
 * each search the whole statement independently, rather than depending on where a column sits in
 * the `set` list or on the rest of the statement following it.
 */
function bucketUpdateStatements(sql: string): string[] {
  return [...sql.matchAll(/update\s+storage\.buckets[\s\S]*?;/gi)].map((m) => m[0]);
}

/**
 * The bucket ids a single `update storage.buckets` statement targets, whichever `where` shape it
 * uses: a list (`where id in ('a','b')`) or a single id (`where id = 'a'`).
 */
function targetedBucketIds(statement: string): string[] {
  const list = statement.match(/where\s+id\s+in\s*\(([^)]*)\)/i);
  if (list) return list[1].split(",").map(unquote);
  const single = statement.match(/where\s+id\s*=\s*'([a-z-]+)'/i);
  return single ? [single[1]] : [];
}

/** Each bucket's effective `allowed_mime_types`: the inserted list with later appends applied. */
function effectiveBucketMimeTypes(sources: string[]): Map<string, string[]> {
  const mimes = new Map<string, string[]>();
  for (const sql of sources) {
    for (const m of sql.matchAll(/\('([a-z-]+)','[a-z-]+',(?:true|false),\d+,array\[([^\]]*)\]\)/g))
      mimes.set(m[1], m[2].split(",").map(unquote));
    for (const statement of bucketUpdateStatements(sql)) {
      // Found independently of where it sits in the `set` list, and optional: a statement may
      // set only `file_size_limit` and never touch the mime list at all.
      const append = statement.match(
        /allowed_mime_types\s*=\s*allowed_mime_types\s*\|\|\s*array\[([^\]]*)\]/i,
      );
      if (!append) continue;
      const added = append[1].split(",").map(unquote);
      for (const id of targetedBucketIds(statement))
        mimes.set(id, [...(mimes.get(id) ?? []), ...added]);
    }
  }
  return mimes;
}

/** Each bucket's effective `file_size_limit`: the inserted value with later updates applied. */
function effectiveBucketLimits(sources: string[]): Map<string, number> {
  const limits = new Map<string, number>();
  for (const sql of sources) {
    for (const m of sql.matchAll(/\('([a-z-]+)','[a-z-]+',(?:true|false),(\d+),array\[/g))
      limits.set(m[1], Number(m[2]));
    for (const statement of bucketUpdateStatements(sql)) {
      // Found independently of where it sits in the `set` list, and optional: a statement may
      // set only `allowed_mime_types` and never touch the size limit at all.
      const limit = statement.match(/file_size_limit\s*=\s*(\d+)/i);
      if (!limit) continue;
      for (const id of targetedBucketIds(statement)) limits.set(id, Number(limit[1]));
    }
  }
  return limits;
}

/**
 * A `file_size` CHECK constraint's effective ceiling: the value it was created with, with any
 * later `drop constraint` + `add constraint ... check(file_size between 1 and N)` applied over
 * it, in source order — the same effective-value technique `effectiveBucketLimits` above already
 * applies to `storage.buckets`.
 *
 * Final whole-branch review, Important 5 (I5): the drift guard below used to read only the
 * inline `check(...)` a table was originally created with, so it never saw
 * `202609210004_video_storage.sql`'s `alter table private.sanitized_assets ... add constraint
 * ... check(file_size between 1 and 1073741824)` — the same failure class Task 3 built
 * `effectiveBucketLimits` to close for `storage.buckets`, one migration away, in the same file
 * this test lives in. The test kept passing throughout because it happened to compare against
 * the *original* 52428800, which was still textually present in `202609200008_trusted_media.sql`
 * — it was asserting a value that was true once, not the constraint's current effective one.
 *
 * The inline form (`file_size bigint not null check(file_size between 1 and N)`) and the ALTER
 * form (`check(file_size between 1 and N)` alone, following a same-table `add constraint`) both
 * end in the same `check(file_size between 1 and N)` shape, so one pattern reads either; sources
 * are still passed in per assertion, one table's migrations at a time, the same way
 * `effectiveBucketLimits` is always called with a scoped list rather than every migration file at
 * once.
 */
function effectiveFileSizeCheckMax(sources: string[]): number {
  let value: number | undefined;
  for (const sql of sources)
    for (const m of sql.matchAll(/check\(file_size between 1 and (\d+)\)/gi)) value = Number(m[1]);
  if (value === undefined)
    throw new Error("no file_size check constraint found in the given sources");
  return value;
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

  it("matches the `file_size` check constraint that guards briefing attachments", () => {
    // Untouched by the video work: briefing attachments were never widened, so this stays at the
    // effective value it has always had.
    expect(
      effectiveFileSizeCheckMax([migration("202609200004_requests_and_attachments.sql")]),
    ).toBe(BUCKET_MAX_BYTES);
  });

  it("matches the `file_size` check constraint's EFFECTIVE ceiling on the sanitized-asset attestation table", () => {
    // `private.sanitized_assets.file_size` was created at BUCKET_MAX_BYTES in
    // `202609200008_trusted_media.sql` and raised to VIDEO_MAX_BYTES by
    // `202609210004_video_storage.sql`'s `drop constraint` + `add constraint`. Asserting against
    // only the first source would silently re-introduce the drift this test exists to catch.
    const sources = [
      migration("202609200008_trusted_media.sql"),
      migration("202609210004_video_storage.sql"),
    ];
    expect(effectiveFileSizeCheckMax([sources[0]])).toBe(BUCKET_MAX_BYTES);
    expect(effectiveFileSizeCheckMax(sources)).toBe(VIDEO_MAX_BYTES);
  });
});

describe("the per-consumer allow-lists mirror their buckets", () => {
  it("matches `internal-assets` for the standard uploaders, plus video", () => {
    const mimes = effectiveBucketMimeTypes([
      migration("202609200003_storage.sql"),
      migration("202609210004_video_storage.sql"),
    ]);
    // `internal-assets` keeps every standard type and gains video on top from the retired
    // per-deliverable video-design path; no current uploader offers video on this bucket.
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
    expect(uploadSizeMessage(VIDEO_MAX_BYTES)).toBe("Choose a file no larger than 1024 MB.");
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

describe("a stored file's type, for the people reading a file list", () => {
  it("names a file by its own type, and says only File when the vocabulary has none", () => {
    expect(fileTypeLabel("image/png")).toBe("PNG");
    expect(fileTypeLabel("application/pdf")).toBe("PDF");
    expect(fileTypeLabel("video/mp4")).toBe("MP4");
    expect(
      fileTypeLabel("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("Word");
    expect(fileTypeLabel("application/zip")).toBe("File");
  });

  it("reads a stored object's type from its extension", () => {
    expect(mimeForPath("project/v1/design.mp4")).toBe("video/mp4");
    expect(mimeForPath("project/v1/DESIGN.JPEG")).toBe("image/jpeg");
    expect(mimeForPath("project/v1/design.png")).toBe("image/png");
    expect(mimeForPath("project/v1/no-extension")).toBeNull();
  });
});
