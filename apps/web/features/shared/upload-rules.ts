/**
 * The upload contract every uploader enforces before a file leaves the browser.
 *
 * **Postgres is authoritative.** Each storage bucket is created with an explicit
 * `file_size_limit` and `allowed_mime_types` list in
 * `supabase/migrations/202609200003_storage.sql`, and the briefing-attachment paths are
 * constrained the same way in `supabase/migrations/202609200004_requests_and_attachments.sql`
 * and `202609200008_trusted_media.sql`. A bucket's value is not always set only where it is
 * created, either: `202609210004_video_storage.sql` widens `internal-assets` and
 * `published-assets` with an `update storage.buckets set ...` layered over the original insert.
 * Nothing here decides what storage accepts; it only restates that decision early enough to
 * explain it.
 *
 * The client ceiling exists to reject **before** the upload exactly what the bucket rejects
 * **after** it, so the two must agree. A client ceiling *above* the bucket limit turns a friendly
 * rejection into a raw storage error at the end of a long transfer; one *below* it refuses valid
 * files with no explanation. Raising a limit or widening a MIME list means editing the migration
 * first and this module second — `upload-rules.test.ts` computes each bucket's *effective* value
 * (inserts with later `update storage.buckets` statements applied, regardless of column order or
 * whether the `where` clause names one bucket or several) from the migrations themselves, and
 * fails if that effective value drifts from this module's constants. That check only covers
 * migrations it has been told to read, though: a new migration that changes a bucket must still
 * be added by hand to that test's source list, or the comparison keeps passing against a stale
 * value without any parser being able to notice.
 *
 * The ceiling is expressed per upload path rather than as a single number, because the paths
 * deliberately disagree with each other and with their bucket: see `ARTWORK_MAX_BYTES` (tighter
 * than its bucket, for browser-memory reasons) and `VIDEO_MAX_BYTES` (wider than the default
 * bucket, for storage-cost reasons).
 */

/**
 * The ceiling every bucket enforces: `file_size_limit = 52428800`
 * (`supabase/migrations/202609200003_storage.sql`). This is the default for upload paths that
 * hand the file to storage as-is.
 */
export const BUCKET_MAX_BYTES = 50 * 1024 * 1024;

/**
 * The design-artwork path stops at half the bucket limit **on purpose**.
 *
 * `sanitizeArtwork` (`features/projects/artwork-files.ts`) decodes the file with
 * `createImageBitmap` and re-encodes it through a canvas. Its 40-megapixel guard can only run
 * *after* the decode has already allocated the bitmap, so this byte ceiling is the only thing
 * standing between an oversized source and the decode itself. Handing that path the full bucket
 * allowance would give a browser-memory guard 25 MB of headroom it was never sized for.
 *
 * The consequence is recorded rather than accidental: files between this value and
 * `BUCKET_MAX_BYTES` are refused on the design path although `internal-assets` would have stored
 * them. Do not collapse this into `BUCKET_MAX_BYTES`.
 */
export const ARTWORK_MAX_BYTES = 25 * 1024 * 1024;

/**
 * The design path accepts video up to a gigabyte, matching `internal-assets` and
 * `published-assets` after `supabase/migrations/202609210004_video_storage.sql`.
 *
 * The reason for this ceiling is **remux time and storage cost**, and deliberately not the
 * reason behind `ARTWORK_MAX_BYTES`. Nothing decodes a video frame in the browser: the file is
 * uploaded as-is and `apps/media` strips its metadata with a stream copy. There is no bitmap to
 * allocate, so browser memory does not bound this number. A gigabyte covers ten minutes of
 * 1080p H.264 at roughly 13 Mbit/s.
 *
 * Do not collapse this into `BUCKET_MAX_BYTES` or `ARTWORK_MAX_BYTES`. The three ceilings answer
 * three different questions.
 */
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024;

/**
 * The shared type vocabulary. Each entry lists the filename extensions a file of that type may
 * carry; the **first** is the canonical one a stored object is named with.
 *
 * This is a vocabulary, not an allow-list. No uploader accepts all of it — each declares its own
 * subset below, so adding an entry here grants nothing anywhere on its own.
 */
export const uploadExtensions = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "image/svg+xml": ["svg"],
  "application/pdf": ["pdf"],
  "video/mp4": ["mp4"],
  "video/webm": ["webm"],
  // Playground-only: its board is the one uploader that accepts raster GIFs, plain text/CSV and
  // office documents, so these extensions exist here — and only here — for
  // `features/playground/playground-types.ts` to check its own allow-list against instead of
  // restating each extension.
  "image/gif": ["gif"],
  "text/plain": ["txt"],
  "text/csv": ["csv"],
  "application/rtf": ["rtf"],
  "text/rtf": ["rtf"],
  "application/msword": ["doc"],
  "application/vnd.ms-excel": ["xls"],
  "application/vnd.ms-powerpoint": ["ppt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
} as const satisfies Record<string, readonly [string, ...string[]]>;

export type UploadMime = keyof typeof uploadExtensions;

/**
 * What the project-facing uploaders accept: working files, delivery files and briefing
 * attachments. Mirrors `allowed_mime_types` on `internal-assets` and the briefing-attachment
 * constraint. Declaration order is the order the types are shown to a person.
 */
export const standardUploadMimes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const satisfies readonly UploadMime[];

/**
 * Brand assets accept SVG as well, and `brand-assets` is the only bucket whose
 * `allowed_mime_types` includes `image/svg+xml`. That is a real difference, not drift: a logo
 * legitimately ships as a vector. It is stated as its own allow-list so that widening the
 * standard set cannot grant SVG anywhere else.
 */
export const brandUploadMimes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
] as const satisfies readonly UploadMime[];

/**
 * Web-playable video only. The product accepts what a browser can play without transcoding: a
 * `.mov` or ProRes file is refused rather than converted, because converting it would mean an
 * ffmpeg re-encode, a queue, and processing state in the interface for a case a designer can
 * resolve at export time.
 */
export const videoUploadMimes = [
  "video/mp4",
  "video/webm",
] as const satisfies readonly UploadMime[];

/**
 * What the design uploader accepts: an image to compose or a video to review. The two carry
 * different ceilings and different preparation paths, so `uploadDesignAsset` branches on the
 * file's type rather than treating this as one homogeneous list.
 */
export const designUploadMimes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/webm",
] as const satisfies readonly UploadMime[];

/** Whether a file's declared type takes the video path rather than the image one. */
export function isVideoUpload(mime: string): boolean {
  const allowed: readonly string[] = videoUploadMimes;
  return allowed.includes(mime);
}

const mimeLabels: Record<UploadMime, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WebP",
  "image/svg+xml": "SVG",
  "application/pdf": "PDF",
  "video/mp4": "MP4",
  "video/webm": "WebM",
  "image/gif": "GIF",
  "text/plain": "Text",
  "text/csv": "CSV",
  "application/rtf": "RTF",
  "text/rtf": "RTF",
  "application/msword": "Word",
  "application/vnd.ms-excel": "Excel",
  "application/vnd.ms-powerpoint": "PowerPoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
};

/** A file's type as a person reads it ("PNG", "PDF", "Word"), or "File" outside the vocabulary. */
export function fileTypeLabel(mime: string): string {
  return (mimeLabels as Record<string, string>)[mime] ?? "File";
}

/** The type a stored object's extension names, or null when the vocabulary has none. */
export function mimeForPath(path: string): UploadMime | null {
  const extension = path.includes(".") ? (path.split(".").pop()?.toLowerCase() ?? "") : "";
  const entries = Object.entries(uploadExtensions) as [UploadMime, readonly string[]][];
  return entries.find(([, extensions]) => extensions.includes(extension))?.[0] ?? null;
}

/** The ceiling as it is shown to a person: `50` for 52428800. */
export function uploadLimitMb(maxBytes: number = BUCKET_MAX_BYTES): number {
  return Math.round(maxBytes / (1024 * 1024));
}

/** An allow-list as prose, in declaration order: `"PNG, JPG, WebP, or PDF"`. */
export function uploadTypesLabel(mimes: readonly UploadMime[]): string {
  const labels = mimes.map((mime) => mimeLabels[mime]);
  if (labels.length < 2) return labels.join("");
  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

/** The rejection shown when a file's type is not on the uploader's allow-list. */
export function uploadTypeMessage(mimes: readonly UploadMime[]): string {
  return `Choose a ${uploadTypesLabel(mimes)} file.`;
}

/**
 * The rejection shown when a file is over the ceiling. One wording for every path: the three that
 * existed before this module ("no larger than", "smaller than", "50 MB or smaller") were one rule
 * stated three ways, which is what let the rule drift in the first place.
 */
export function uploadSizeMessage(maxBytes: number = BUCKET_MAX_BYTES): string {
  return `Choose a file no larger than ${uploadLimitMb(maxBytes)} MB.`;
}

/** `mime → canonical extension`, for `accept` attributes and for naming a stored object. */
export function uploadExtensionMap(mimes: readonly UploadMime[]): Record<string, string> {
  return Object.fromEntries(mimes.map((mime) => [mime, uploadExtensions[mime][0]]));
}

/**
 * The allow-list as a filename-extension `accept` attribute: `".png,.jpg,.jpeg,.webp,.pdf"`.
 * Some file pickers filter more reliably on extensions than on media types, so the uploaders that
 * chose that form keep it — this builds it from the same vocabulary rather than restating it.
 */
export function uploadExtensionAccept(mimes: readonly UploadMime[]): string {
  return mimes.flatMap((mime) => uploadExtensions[mime].map((ext) => `.${ext}`)).join(",");
}

/**
 * The extensions a file of this type may carry under this allow-list, or an empty list if the
 * type is not on it. Used where a filename extension is checked against the declared type.
 */
export function acceptedExtensions(mimes: readonly UploadMime[], mime: string): readonly string[] {
  const allowed: readonly string[] = mimes;
  return allowed.includes(mime) ? uploadExtensions[mime as UploadMime] : [];
}

/** Stored video extensions come from the media service's verified container type. */
const videoExtensions = ["mp4", "webm"];

export function isVideoAsset(path: string | null): boolean {
  if (!path) return false;
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return videoExtensions.includes(extension);
}
