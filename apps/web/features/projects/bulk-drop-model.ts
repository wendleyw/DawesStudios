/**
 * Classification, ordering and per-deliverable plan-building for a bulk image drop on the project
 * canvas. Pure logic only: dimensions are read through an injected `DimensionReader` rather than
 * `createImageBitmap` directly, so this file needs no DOM and no Supabase client to unit test.
 *
 * docs/superpowers/specs/2026-09-23-bulk-image-drop-design.md
 */
import {
  ARTWORK_MAX_BYTES,
  isVideoUpload,
  uploadSizeMessage,
  uploadTypeMessage,
  type UploadMime,
} from "@/features/shared/upload-rules";

/**
 * The spec's own concurrency ceiling, for both dimension-reading (this file) and the upload phase
 * (`bulk-drop-upload.ts`). Kept in one place so the two phases cannot silently drift apart.
 */
export const BULK_DROP_CONCURRENCY = 3;

/** What this feature accepts, distinct from `designUploadMimes` (which also allows video). */
export const bulkDropImageMimes = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const satisfies readonly UploadMime[];

/**
 * Natural-order comparison: `"square-2.png"` sorts before `"square-10.png"`, unlike a plain
 * lexical comparison. Splits each name into runs of digits and non-digits, and compares
 * corresponding runs — numerically when both are digit runs, lexically otherwise.
 */
export function naturalCompare(a: string, b: string): number {
  const chunk = /(\d+|\D+)/g;
  const partsA = a.match(chunk) ?? [a];
  const partsB = b.match(chunk) ?? [b];
  const length = Math.max(partsA.length, partsB.length);
  for (let index = 0; index < length; index++) {
    const x = partsA[index] ?? "";
    const y = partsB[index] ?? "";
    if (x === y) continue;
    const numericX = /^\d+$/.test(x);
    const numericY = /^\d+$/.test(y);
    if (numericX && numericY) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
      continue;
    }
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Runs `run` over `items`, never more than `limit` at once, resolving to results in the same
 * order as `items` regardless of which one finishes first.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export type BulkDropDeliverable = {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
};

type SizedDeliverable = BulkDropDeliverable & { width: number; height: number };

function isSized(deliverable: BulkDropDeliverable): deliverable is SizedDeliverable {
  return (
    !!deliverable.width && !!deliverable.height && deliverable.width > 0 && deliverable.height > 0
  );
}
function ratioOf(width: number, height: number): number {
  return width / height;
}
function withinOnePercent(a: number, b: number): boolean {
  return Math.abs(a - b) <= b * 0.01;
}

/**
 * Exact pixel size first; when nothing matches exactly, the same aspect ratio within 1%. A
 * deliverable with no declared `width`/`height` is never an automatic match target — it only
 * receives an image assigned by hand in the dialog's unmatched picker.
 */
export function matchDeliverable(
  dimensions: { width: number; height: number },
  deliverables: BulkDropDeliverable[],
):
  | { kind: "exact" | "ratio"; deliverableId: string }
  | { kind: "tie"; candidateDeliverableIds: string[] }
  | { kind: "none" } {
  const sized = deliverables.filter(isSized);
  const exact = sized.filter((d) => d.width === dimensions.width && d.height === dimensions.height);
  if (exact.length === 1) return { kind: "exact", deliverableId: exact[0].id };
  if (exact.length > 1) return { kind: "tie", candidateDeliverableIds: exact.map((d) => d.id) };

  const fileRatio = ratioOf(dimensions.width, dimensions.height);
  const byRatio = sized.filter((d) => withinOnePercent(fileRatio, ratioOf(d.width, d.height)));
  if (byRatio.length === 1) return { kind: "ratio", deliverableId: byRatio[0].id };
  if (byRatio.length > 1) return { kind: "tie", candidateDeliverableIds: byRatio.map((d) => d.id) };
  return { kind: "none" };
}

export type ClassifiedFiles = {
  matched: { file: File; deliverableId: string }[];
  tied: { file: File; candidateDeliverableIds: string[] }[];
  unmatched: { file: File }[];
  rejected: { file: File; reason: string }[];
};

export type DimensionReader = (file: File) => Promise<{ width: number; height: number } | null>;

/**
 * Classifies every dropped file exactly once, bounded to `BULK_DROP_CONCURRENCY` in flight for the
 * dimension-read step (the memory-bound part: `readDimensions` decodes the image).
 */
export async function classifyFiles(
  files: File[],
  deliverables: BulkDropDeliverable[],
  readDimensions: DimensionReader,
  maxBytes: number = ARTWORK_MAX_BYTES,
): Promise<ClassifiedFiles> {
  type Outcome =
    | { kind: "rejected"; file: File; reason: string }
    | { kind: "matched"; file: File; deliverableId: string }
    | { kind: "tied"; file: File; candidateDeliverableIds: string[] }
    | { kind: "unmatched"; file: File };

  const outcomes = await mapWithConcurrency<File, Outcome>(
    files,
    BULK_DROP_CONCURRENCY,
    async (input) => {
      if (isVideoUpload(input.type))
        return {
          kind: "rejected",
          file: input,
          reason: "This is a video — use Add design to upload it.",
        };
      if (!(bulkDropImageMimes as readonly string[]).includes(input.type))
        return { kind: "rejected", file: input, reason: uploadTypeMessage(bulkDropImageMimes) };
      if (input.size > maxBytes)
        return { kind: "rejected", file: input, reason: uploadSizeMessage(maxBytes) };
      const dimensions = await readDimensions(input);
      if (!dimensions)
        return { kind: "rejected", file: input, reason: "This image could not be read." };
      const match = matchDeliverable(dimensions, deliverables);
      if (match.kind === "exact" || match.kind === "ratio")
        return { kind: "matched", file: input, deliverableId: match.deliverableId };
      if (match.kind === "tie")
        return {
          kind: "tied",
          file: input,
          candidateDeliverableIds: match.candidateDeliverableIds,
        };
      return { kind: "unmatched", file: input };
    },
  );

  const result: ClassifiedFiles = { matched: [], tied: [], unmatched: [], rejected: [] };
  for (const outcome of outcomes) {
    if (outcome.kind === "rejected")
      result.rejected.push({ file: outcome.file, reason: outcome.reason });
    else if (outcome.kind === "matched")
      result.matched.push({ file: outcome.file, deliverableId: outcome.deliverableId });
    else if (outcome.kind === "tied")
      result.tied.push({
        file: outcome.file,
        candidateDeliverableIds: outcome.candidateDeliverableIds,
      });
    else result.unmatched.push({ file: outcome.file });
  }
  return result;
}

/** The design name a bulk-dropped file gets: its filename without the extension. */
export function deriveDesignTitle(fileName: string): string {
  const stripped = fileName.replace(/\.[^./\\]+$/, "").trim();
  return stripped.length ? stripped : fileName.trim();
}

/**
 * The same default text-field shape `project-action-dialog.tsx` writes for a plain image upload
 * (`headline` defaulted to the title, empty body/eyebrow, the two default swatch colors) — kept
 * identical so a bulk-dropped design renders exactly like one added through Add design.
 */
export function buildDesignContent(title: string): Record<string, string> {
  return { headline: title, body: "", background: "#f2f0e8", foreground: "#20231f", eyebrow: "" };
}

export type CurrentVersionInfo = { deliverableId: string; versionId: string; number: number };

/** The highest `number` version per deliverable, mirroring `versionsByDeliverable.get(...).at(-1)` in `project-page.tsx`. */
export function latestVersionPerDeliverable(
  versions: { id: string; deliverableId: string; number: number }[],
): CurrentVersionInfo[] {
  const latest = new Map<string, CurrentVersionInfo>();
  for (const version of versions) {
    const current = latest.get(version.deliverableId);
    if (!current || version.number > current.number)
      latest.set(version.deliverableId, {
        deliverableId: version.deliverableId,
        versionId: version.id,
        number: version.number,
      });
  }
  return [...latest.values()];
}

export type VersionChoice = "current" | "new";

export type DeliverablePlan = {
  deliverableId: string;
  deliverableName: string;
  /** Naturally sorted by file name. */
  files: File[];
  /** Absent when the deliverable has no version yet. */
  currentVersion?: CurrentVersionInfo;
  defaultChoice: VersionChoice;
  /** False only for a deliverable with no version yet — the person is never asked in that case. */
  askChoice: boolean;
};

/**
 * Groups assigned files by deliverable and applies the default-version rule: the current version,
 * unless it is already shared with the client, in which case a new version; V1 with no question
 * for a deliverable that has no version at all.
 */
export function buildDeliverablePlans(
  assignments: { file: File; deliverableId: string }[],
  deliverables: BulkDropDeliverable[],
  currentVersions: CurrentVersionInfo[],
  isPublished: (deliverableId: string, versionNumber: number) => boolean,
): DeliverablePlan[] {
  const byDeliverable = new Map<string, File[]>();
  for (const { file, deliverableId } of assignments)
    byDeliverable.set(deliverableId, [...(byDeliverable.get(deliverableId) ?? []), file]);

  const plans: DeliverablePlan[] = [];
  for (const [deliverableId, files] of byDeliverable) {
    const deliverable = deliverables.find((d) => d.id === deliverableId);
    if (!deliverable) continue;
    const currentVersion = currentVersions.find((v) => v.deliverableId === deliverableId);
    const published = currentVersion ? isPublished(deliverableId, currentVersion.number) : false;
    plans.push({
      deliverableId,
      deliverableName: deliverable.name,
      files: [...files].sort((a, b) => naturalCompare(a.name, b.name)),
      currentVersion,
      defaultChoice: !currentVersion || published ? "new" : "current",
      askChoice: !!currentVersion,
    });
  }
  return plans.sort((a, b) => a.deliverableName.localeCompare(b.deliverableName));
}
