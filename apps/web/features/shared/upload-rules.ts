/**
 * Browser validation mirrors the active Storage buckets. The database owns access, MIME and
 * per-file limits; these helpers explain rejections before a transfer starts. Migration
 * 202609270017 restores working files to 50 MiB and PNG/JPEG/WebP/PDF after video retirement.
 * Covers have a separate 10 MiB ceiling beside their media-service request.
 */
export const BUCKET_MAX_BYTES = 50 * 1024 * 1024;

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
/** What a client may add to its Brand Hub: raster images only (SVG can carry script). */
export const clientBrandUploadMimes = [
  "image/png",
  "image/jpeg",
  "image/webp",
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
