# Bulk Image Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the agency, or the designer assigned to a project, drop a whole bundle of images onto
the project canvas in **Working files**; the system matches each image to the deliverable it
belongs to by pixel size, asks once per affected deliverable whether new images join the current
version or start a new one, and uploads everything in file-name order, with retry for partial
failure and no orphaned files or empty versions.

**Architecture:** A pure model module (`bulk-drop-model.ts`) classifies dropped files against the
project's deliverables and builds the per-deliverable plan, including the default current-vs-new
rule. A pure-ish orchestration module (`bulk-drop-upload.ts`) drives the actual upload/registration
work against injected async dependencies, capping browser-memory-bound uploads at three in flight
while keeping each deliverable's `add_design` calls strictly sequential in natural order (the RPC's
`sort_order` is a plain `count(*)`, so concurrent calls on one version can collide). A confirmation
dialog (`bulk-drop-dialog.tsx`) wires the two together with per-deliverable choices, an
unmatched/tie picker, progress and retry. The project canvas (`project-page.tsx`) gains the drop
handlers and overlay, gated by the exact same `canProduce`/`channel` check the existing Add design
tile already uses, plus a transient hint on the client-facing tab. No schema, RPC, policy or new
Supabase-bucket change; the two production RPCs (`create_design_version`, `add_design`) and the two
`artwork-files.ts` exports (`uploadArtwork`, `discardUnreferencedArtwork`) are called as-is.

**Tech Stack:** Next.js App Router + TypeScript (`apps/web`), React 19, `@tanstack/react-query`,
`@xyflow/react`, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-bulk-image-drop-design.md`

## Task ordering, adjusted from the brief

The brief's suggested order is followed with two changes, both because of a real dependency the
brief's own step numbers do not reflect:

- **"Data helpers in `project-data.ts`" moves before the dialog (Task 2, not Task 3-after-the-fact
  in a same-numbered slot).** Research found the dialog cannot implement the spec's default-version
  rule without a new read: viewing **Working files** never fetches `published_versions` today (see
  Task 2's "Fact discovered during research"), so "already shared with the client" is unknowable
  without it.
- **"Upload orchestration" becomes its own task (Task 3) before the dialog (Task 4), not folded
  into it.** The dialog needs to call a finished orchestration API (`runBulkDrop`) to render
  progress and retry; writing it inline inside the dialog component would make the concurrency,
  ordering and retry logic untestable without React Testing Library. Splitting it out also lets its
  non-obvious correctness property — per-deliverable strict ordering despite global upload
  concurrency — get its own focused unit tests.

Resulting order: (1) model, (2) data helpers, (3) upload orchestration, (4) dialog, (5) canvas
wiring, (6) Playwright, (7) docs.

## Global Constraints

- Accepted files: PNG, JPG, WebP only. A video, any other type, or a file over the limit is
  rejected with a stated reason, never silently dropped.
- Artwork size ceiling: `ARTWORK_MAX_BYTES` (25 MB, `apps/web/features/shared/upload-rules.ts`) —
  the same ceiling the single-file Add design dialog already enforces. Do not introduce a second
  ceiling.
- Matching: exact pixel size first; otherwise the same aspect ratio within 1%; a tie between two or
  more deliverables is asked, never guessed; a deliverable with no `width`/`height` never receives
  an automatic match, only a hand assignment.
- Confirmation: one block per affected deliverable, asking **Add to V{current}** or **Create
  V{current + 1}**. Default is the current version, unless that version is already shared with the
  client (a `published_versions` row exists for the same `deliverable_id`/`version_number`), in
  which case the default is a new version. A deliverable with no version yet creates V1 with no
  question asked.
- Order: files are added in natural file-name order (`1, 2, 10`, not `1, 10, 2`), after the
  version's existing designs.
- Concurrency: at most three files in flight at a time, for both dimension-reading and upload —
  `BULK_DROP_CONCURRENCY = 3` (`bulk-drop-model.ts`), reused everywhere this limit applies.
- Where it works: only the project's **Working files** view, only for someone the same
  `canProduce` gate as the existing Add design controls already admits
  (`profile?.role !== "client" && channel === "internal"`, `apps/web/features/projects/project-page.tsx:125`).
  No drop overlay for a client account or in **Shared with client**; a drop is swallowed there
  (never lets the browser navigate to the file), and **Shared with client** additionally shows the
  hint **Switch to Working files to add designs**.
- No videos in the bundle, no folders or archives, no drop into **Shared with client**.
- No schema, RPC, policy or permission change. `create_design_version` and `add_design` are called
  exactly as they exist today (`supabase/migrations/202609200002_workflows.sql:103-123`).
- Do not modify `apps/web/features/projects/artwork-files.ts` or
  `apps/web/features/projects/project-action-dialog.tsx` — the approved
  [video upload lifecycle plan](2026-09-23-video-upload-lifecycle.md) owns those files. Only call
  their existing exports `uploadArtwork(database, projectId, file)` and
  `discardUnreferencedArtwork(database, path)`.
- `uploadArtwork` sanitizes internally: it calls the module-private `sanitizeArtwork` itself
  (`artwork-files.ts:22,50`) before storing. No caller applies `sanitizeArtwork` separately — it is
  not exported. Bulk drop calls `uploadArtwork` directly with the raw dropped `File`.
- Data-access contract: Supabase calls live only in `project-data.ts`; writes are plain
  `async (database, input)` functions; reads rendered by a component are `use<Thing>()` hooks
  (`docs/architecture/data-access.md`). `bulk-drop-model.ts` and `bulk-drop-upload.ts` import
  neither Supabase nor `useAuth` — they take plain injected functions — so neither needs a
  data-access exception.
- English for all identifiers, code, tests, comments and docs (`CLAUDE.md` Language Policy); this
  plan document itself stays in English throughout, including if execution updates are relayed to
  the user in Brazilian Portuguese in chat.
- Gate: `npm run check` (typecheck, eslint, prettier, unit suites) and the projects browser specs
  (`npx playwright test tests/e2e/bulk-image-drop.spec.ts tests/e2e/project-feedback.spec.ts`).

## Review Focus

- **Many files land on the same deliverable/version at once.** `add_design`'s `sort_order` is
  `(select count(*) from public.designs where version_id=p_version_id)` with no row lock
  (`202609200002_workflows.sql:121`), so two concurrent calls on the same version can read the same
  count and collide. A person dropping five images that all match one deliverable is the ordinary
  case, not an edge case. Pinned in Task 3's ordering test (out-of-order upload completion, in-order
  registration).
- **A person without production rights drops files.** A client account, or the agency/designer
  viewing **Shared with client**, must never have the browser navigate away to open the dropped
  image — every one of the three gating branches (client role; Shared with client; no `"Files"` in
  `dataTransfer.types`) must call `preventDefault()`. Pinned in Task 5's handler and the
  Playwright client-session scenario in Task 6.
- **One file fails after its siblings in the same deliverable already succeeded.** The version was
  already lazily created and other designs already registered; only the failing file is marked
  failed (with its upload discarded), the rest of that deliverable and every other deliverable
  continue untouched. Pinned in Task 3.
- **A drop with nothing usable in it** (every file is a video, an unsupported type, or oversized).
  The dialog must show the "not added" list with each reason and never present an empty, confusable
  confirmation step with a disabled button and no explanation. Pinned in Task 4.
- **An assigned designer runs bulk drop on a deliverable already shared with the client.** RLS
  restricts `published_versions` to `private.can_client_channel` — agency or client member
  (`supabase/migrations/202609200001_foundation.sql:266`) — which a `designer` role never satisfies.
  A designer's `usePublishedVersionNumbers` read therefore always comes back empty, so the
  "already shared → default new version" rule silently degrades to always-default-current for a
  designer session. This is an accepted, documented consequence of an existing permission boundary,
  not a bug this plan introduces or can fix without a policy change (out of scope). Recorded as a
  fact in Task 2 and in the Task 7 README update; the person can still choose **Create new
  version** by hand.

---

### Task 1: `bulk-drop-model.ts` — classification, natural sort, plan building

**Files:**
- Create: `apps/web/features/projects/bulk-drop-model.ts`
- Create: `apps/web/features/projects/bulk-drop-model.test.ts`

**Interfaces:**
- Consumes: `ARTWORK_MAX_BYTES`, `isVideoUpload`, `uploadSizeMessage`, `uploadTypeMessage`, and the
  `UploadMime` type, all from `@/features/shared/upload-rules` (unmodified).
- Produces (consumed by Task 3 and Task 4):
  - `export const BULK_DROP_CONCURRENCY = 3`
  - `export const bulkDropImageMimes: readonly UploadMime[]` = `["image/png", "image/jpeg", "image/webp"]`
  - `export type DimensionReader = (file: File) => Promise<{ width: number; height: number } | null>`
  - `export type BulkDropDeliverable = { id: string; name: string; width: number | null; height: number | null }`
  - `export type ClassifiedFiles = { matched: { file: File; deliverableId: string }[]; tied: { file: File; candidateDeliverableIds: string[] }[]; unmatched: { file: File }[]; rejected: { file: File; reason: string }[] }`
  - `export function naturalCompare(a: string, b: string): number`
  - `export function mapWithConcurrency<T, R>(items: T[], limit: number, run: (item: T, index: number) => Promise<R>): Promise<R[]>`
  - `export function matchDeliverable(dimensions: { width: number; height: number }, deliverables: BulkDropDeliverable[]): { kind: "exact" | "ratio"; deliverableId: string } | { kind: "tie"; candidateDeliverableIds: string[] } | { kind: "none" }`
  - `export function classifyFiles(files: File[], deliverables: BulkDropDeliverable[], readDimensions: DimensionReader, maxBytes?: number): Promise<ClassifiedFiles>`
  - `export function deriveDesignTitle(fileName: string): string`
  - `export function buildDesignContent(title: string): Record<string, string>`
  - `export type CurrentVersionInfo = { deliverableId: string; versionId: string; number: number }`
  - `export function latestVersionPerDeliverable(versions: { id: string; deliverableId: string; number: number }[]): CurrentVersionInfo[]`
  - `export type VersionChoice = "current" | "new"`
  - `export type DeliverablePlan = { deliverableId: string; deliverableName: string; files: File[]; currentVersion?: CurrentVersionInfo; defaultChoice: VersionChoice; askChoice: boolean }`
  - `export function buildDeliverablePlans(assignments: { file: File; deliverableId: string }[], deliverables: BulkDropDeliverable[], currentVersions: CurrentVersionInfo[], isPublished: (deliverableId: string, versionNumber: number) => boolean): DeliverablePlan[]`

- [ ] **Step 1: Write the failing tests for `naturalCompare` and `mapWithConcurrency`**

```ts
import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency, naturalCompare } from "./bulk-drop-model";

describe("naturalCompare", () => {
  it("orders numeric runs numerically, not lexically", () => {
    const names = ["square-10.png", "square-1.png", "square-2.png"];
    expect([...names].sort(naturalCompare)).toEqual([
      "square-1.png",
      "square-2.png",
      "square-10.png",
    ]);
  });

  it("falls back to plain comparison when neither side has a numeric run", () => {
    expect(naturalCompare("banner.png", "avatar.png")).toBeGreaterThan(0);
  });

  it("treats an exact match as equal", () => {
    expect(naturalCompare("hero-1.png", "hero-1.png")).toBe(0);
  });
});

describe("mapWithConcurrency", () => {
  it("never runs more than the given limit at once", async () => {
    let active = 0;
    let peak = 0;
    const items = [1, 2, 3, 4, 5];
    // A real, short timeout rather than manually-released gates: with five items and a limit of
    // three, a gate-draining test has to keep draining as later items start after earlier ones
    // release, which is easy to get wrong. A fixed delay measures the same peak deterministically
    // without that bookkeeping.
    const result = await mapWithConcurrency(items, 3, async (item) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return item * 10;
    });
    expect(peak).toBe(3);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("preserves input order regardless of resolution order", async () => {
    const delays = [30, 0, 20];
    const results = await mapWithConcurrency(delays, 3, (ms, index) =>
      new Promise<number>((resolve) => setTimeout(() => resolve(index), ms)),
    );
    expect(results).toEqual([0, 1, 2]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-model.test.ts`
Expected: FAIL — `./bulk-drop-model` does not exist yet.

- [ ] **Step 3: Implement `naturalCompare` and `mapWithConcurrency`**

```ts
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
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-model.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing tests for `matchDeliverable` and `classifyFiles`**

```ts
import { matchDeliverable, classifyFiles, type BulkDropDeliverable } from "./bulk-drop-model";

function file(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

const square: BulkDropDeliverable = { id: "d-square", name: "Campaign square", width: 1080, height: 1080 };
const story: BulkDropDeliverable = { id: "d-story", name: "Campaign story", width: 1080, height: 1920 };
const brandKit: BulkDropDeliverable = { id: "d-kit", name: "Brand kit", width: null, height: null };
const deliverables = [square, story, brandKit];

describe("matchDeliverable", () => {
  it("matches an exact pixel size", () => {
    expect(matchDeliverable({ width: 1080, height: 1080 }, deliverables)).toEqual({
      kind: "exact",
      deliverableId: "d-square",
    });
  });

  it("matches the same aspect ratio within 1% when no exact size matches", () => {
    // 1090/1090 keeps a 1:1 ratio, 0.93% off 1080x1080 in width alone -- within tolerance.
    expect(matchDeliverable({ width: 1090, height: 1090 }, deliverables)).toEqual({
      kind: "ratio",
      deliverableId: "d-square",
    });
  });

  it("reports a tie when two deliverables match equally", () => {
    const twin: BulkDropDeliverable = { id: "d-twin", name: "Also square", width: 1080, height: 1080 };
    const result = matchDeliverable({ width: 1080, height: 1080 }, [square, twin]);
    expect(result.kind).toBe("tie");
    if (result.kind === "tie")
      expect(result.candidateDeliverableIds.sort()).toEqual(["d-square", "d-twin"]);
  });

  it("never matches a deliverable with no declared dimensions", () => {
    expect(matchDeliverable({ width: 1080, height: 1080 }, [brandKit])).toEqual({ kind: "none" });
  });

  it("reports no match when nothing is within 1% ratio", () => {
    expect(matchDeliverable({ width: 800, height: 600 }, deliverables)).toEqual({ kind: "none" });
  });
});

describe("classifyFiles", () => {
  const readDimensions = vi.fn(async (input: File) => {
    const sizes: Record<string, { width: number; height: number }> = {
      "square-1.png": { width: 1080, height: 1080 },
      "story-1.png": { width: 1080, height: 1920 },
      "unmatched.png": { width: 800, height: 600 },
    };
    return sizes[input.name] ?? null;
  });

  it("sorts every file into exactly one bucket", async () => {
    const files = [
      file("square-1.png", "image/png"),
      file("story-1.png", "image/jpeg"),
      file("unmatched.png", "image/webp"),
      file("clip.mp4", "video/mp4"),
      file("brief.pdf", "application/pdf"),
      file("huge.png", "image/png", ARTWORK_MAX_BYTES_FOR_TEST + 1),
    ];
    const result = await classifyFiles(files, deliverables, readDimensions, ARTWORK_MAX_BYTES_FOR_TEST);
    expect(result.matched.map((m) => [m.file.name, m.deliverableId])).toEqual([
      ["square-1.png", "d-square"],
      ["story-1.png", "d-story"],
    ]);
    expect(result.unmatched.map((u) => u.file.name)).toEqual(["unmatched.png"]);
    expect(result.rejected.map((r) => r.file.name)).toEqual(["clip.mp4", "brief.pdf", "huge.png"]);
    expect(result.rejected[0].reason).toMatch(/video/i);
    expect(result.rejected[1].reason).toMatch(/PNG, JPG, or WebP/);
    expect(result.rejected[2].reason).toMatch(/no larger than/);
  });

  it("rejects a file the reader could not decode", async () => {
    const result = await classifyFiles(
      [file("corrupt.png", "image/png")],
      deliverables,
      async () => null,
      ARTWORK_MAX_BYTES_FOR_TEST,
    );
    expect(result.rejected[0].reason).toMatch(/could not be read/);
  });
});

const ARTWORK_MAX_BYTES_FOR_TEST = 1024 * 1024;
```

- [ ] **Step 6: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-model.test.ts`
Expected: FAIL — `matchDeliverable` and `classifyFiles` are not exported yet.

- [ ] **Step 7: Implement `matchDeliverable` and `classifyFiles`**

Append to `bulk-drop-model.ts`:

```ts
type SizedDeliverable = BulkDropDeliverable & { width: number; height: number };

function isSized(deliverable: BulkDropDeliverable): deliverable is SizedDeliverable {
  return !!deliverable.width && !!deliverable.height && deliverable.width > 0 && deliverable.height > 0;
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

  const outcomes = await mapWithConcurrency<File, Outcome>(files, BULK_DROP_CONCURRENCY, async (input) => {
    if (isVideoUpload(input.type))
      return { kind: "rejected", file: input, reason: "This is a video — use Add design to upload it." };
    if (!bulkDropImageMimes.includes(input.type as UploadMime))
      return { kind: "rejected", file: input, reason: uploadTypeMessage(bulkDropImageMimes) };
    if (input.size > maxBytes)
      return { kind: "rejected", file: input, reason: uploadSizeMessage(maxBytes) };
    const dimensions = await readDimensions(input);
    if (!dimensions) return { kind: "rejected", file: input, reason: "This image could not be read." };
    const match = matchDeliverable(dimensions, deliverables);
    if (match.kind === "exact" || match.kind === "ratio")
      return { kind: "matched", file: input, deliverableId: match.deliverableId };
    if (match.kind === "tie")
      return { kind: "tied", file: input, candidateDeliverableIds: match.candidateDeliverableIds };
    return { kind: "unmatched", file: input };
  });

  const result: ClassifiedFiles = { matched: [], tied: [], unmatched: [], rejected: [] };
  for (const outcome of outcomes) {
    if (outcome.kind === "rejected") result.rejected.push({ file: outcome.file, reason: outcome.reason });
    else if (outcome.kind === "matched")
      result.matched.push({ file: outcome.file, deliverableId: outcome.deliverableId });
    else if (outcome.kind === "tied")
      result.tied.push({ file: outcome.file, candidateDeliverableIds: outcome.candidateDeliverableIds });
    else result.unmatched.push({ file: outcome.file });
  }
  return result;
}
```

- [ ] **Step 8: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-model.test.ts`
Expected: PASS (12 tests total so far).

- [ ] **Step 9: Write the failing tests for `deriveDesignTitle`, `buildDesignContent`, `latestVersionPerDeliverable` and `buildDeliverablePlans`**

```ts
import {
  buildDeliverablePlans,
  buildDesignContent,
  deriveDesignTitle,
  latestVersionPerDeliverable,
} from "./bulk-drop-model";

describe("deriveDesignTitle", () => {
  it("strips the extension", () => {
    expect(deriveDesignTitle("hero-1.png")).toBe("hero-1");
  });
  it("falls back to the raw name when stripping leaves nothing", () => {
    expect(deriveDesignTitle(".png")).toBe(".png");
  });
});

describe("buildDesignContent", () => {
  it("matches the single-upload dialog's default color fields", () => {
    expect(buildDesignContent("Hero")).toEqual({
      headline: "Hero",
      body: "",
      background: "#f2f0e8",
      foreground: "#20231f",
      eyebrow: "",
    });
  });
});

describe("latestVersionPerDeliverable", () => {
  it("keeps the highest-numbered version per deliverable", () => {
    const versions = [
      { id: "v1", deliverableId: "d-square", number: 1 },
      { id: "v2", deliverableId: "d-square", number: 2 },
      { id: "v3", deliverableId: "d-story", number: 1 },
    ];
    expect(latestVersionPerDeliverable(versions)).toEqual([
      { deliverableId: "d-square", versionId: "v2", number: 2 },
      { deliverableId: "d-story", versionId: "v3", number: 1 },
    ]);
  });
});

describe("buildDeliverablePlans", () => {
  const square = { id: "d-square", name: "Campaign square", width: 1080, height: 1080 };
  const story = { id: "d-story", name: "Campaign story", width: 1080, height: 1920 };
  const deliverables = [square, story];
  const f = (name: string) => new File([], name, { type: "image/png" });

  it("defaults to the current version when it is not shared with the client", () => {
    const currentVersions = [{ deliverableId: "d-square", versionId: "v1", number: 1 }];
    const plans = buildDeliverablePlans(
      [{ file: f("square-2.png"), deliverableId: "d-square" }, { file: f("square-1.png"), deliverableId: "d-square" }],
      deliverables,
      currentVersions,
      () => false,
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].defaultChoice).toBe("current");
    expect(plans[0].askChoice).toBe(true);
    expect(plans[0].files.map((file) => file.name)).toEqual(["square-1.png", "square-2.png"]);
  });

  it("defaults to a new version when the current one is already shared with the client", () => {
    const currentVersions = [{ deliverableId: "d-story", versionId: "v1", number: 1 }];
    const plans = buildDeliverablePlans(
      [{ file: f("story-1.png"), deliverableId: "d-story" }],
      deliverables,
      currentVersions,
      (deliverableId, number) => deliverableId === "d-story" && number === 1,
    );
    expect(plans[0].defaultChoice).toBe("new");
    expect(plans[0].askChoice).toBe(true);
  });

  it("asks no question for a deliverable with no version yet", () => {
    const plans = buildDeliverablePlans(
      [{ file: f("square-1.png"), deliverableId: "d-square" }],
      deliverables,
      [],
      () => false,
    );
    expect(plans[0].defaultChoice).toBe("new");
    expect(plans[0].askChoice).toBe(false);
    expect(plans[0].currentVersion).toBeUndefined();
  });

  it("groups by deliverable and orders deliverables by name", () => {
    const plans = buildDeliverablePlans(
      [
        { file: f("story-1.png"), deliverableId: "d-story" },
        { file: f("square-1.png"), deliverableId: "d-square" },
      ],
      deliverables,
      [],
      () => false,
    );
    expect(plans.map((p) => p.deliverableName)).toEqual(["Campaign square", "Campaign story"]);
  });
});
```

- [ ] **Step 10: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-model.test.ts`
Expected: FAIL — the four new exports do not exist yet.

- [ ] **Step 11: Implement `deriveDesignTitle`, `buildDesignContent`, `latestVersionPerDeliverable`, `buildDeliverablePlans`**

Append to `bulk-drop-model.ts`:

```ts
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
```

- [ ] **Step 12: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-model.test.ts`
Expected: PASS (20 tests total).

- [ ] **Step 13: Commit**

```bash
git add apps/web/features/projects/bulk-drop-model.ts apps/web/features/projects/bulk-drop-model.test.ts
git commit -m "feat(projects): add bulk-drop classification, natural sort and version-choice model"
```

---

### Task 2: `project-data.ts` — the missing read and a return-value fix

**Files:**
- Modify: `apps/web/features/projects/project-data.ts:298-318` (insert the new hook after
  `useDesignAssetUrl`, before `projectQueryKeys` at line 328)
- Modify: `apps/web/features/projects/project-data.ts:464-475` (`createDesignVersion`)
- Modify: `apps/web/features/projects/project-data.test.ts` (extend the existing
  `createDesignVersion` tests)
- Create: `apps/web/features/projects/project-published-versions.test.tsx`

**Fact discovered during research:** viewing **Working files** never fetches `published_versions`.
`useProjectDetail`'s `clientChannel` is only true when `channel === "client"` or the viewer is a
client (`project-data.ts:105`); on Working files it queries `design_versions`/`designs` only. So
the dialog has no way today to know whether a deliverable's current version is already shared with
the client — the exact fact the default-version rule needs. This task adds that read.

**A second fact:** `createDesignVersion` currently discards the id `create_design_version` returns.
The RPC is declared `returns uuid` and the generated type confirms
`Database["public"]["Functions"]["create_design_version"]["Returns"]` is `string`
(`supabase/database.types.ts:1671-1678`), but the wrapper's `assertResult(...)` call has no `return`
keyword (`project-data.ts:468-474`), so it always resolves to `undefined`. `project-action-dialog.tsx`
never captures the return value (it just invalidates and closes), so this was never noticed. Bulk
drop's orchestration (Task 3) needs the new version's id synchronously, to call `add_design` against
it for every file in that deliverable without waiting on a query refetch. Fixing the missing
`return` is a pure addition — no existing caller's behavior changes. `addDesign`'s own discarded
return value is left alone: nothing in this feature needs a created design's id.

**Interfaces:**
- Consumes: `useAuth()` (`@/features/auth/auth-provider`), `assertResult` (`@/lib/supabase`),
  `useQuery` (`@tanstack/react-query`) — all already imported in this file.
- Produces (consumed by Task 4):
  - `export function usePublishedVersionNumbers(projectId: string, enabled: boolean)` — a
    `useQuery` hook resolving to `{ deliverable_id: string; version_number: number }[]`.
  - `createDesignVersion(...)` now resolves to `Promise<string>` (the new version's id), not
    `Promise<void>`.

- [ ] **Step 1: Write the failing test for `createDesignVersion`'s return value**

Add to `apps/web/features/projects/project-data.test.ts`, inside the existing
`describe("project procedures", ...)` block, right after the two existing `createDesignVersion`
tests (after line 75):

```ts
  it("resolves to the new version's id", async () => {
    const { database } = stubDatabase({ data: "version-99", error: null });
    await expect(
      createDesignVersion(database, { deliverableId: "deliverable-1", notes: "" }),
    ).resolves.toBe("version-99");
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd apps/web && npx vitest run features/projects/project-data.test.ts -t "resolves to the new version"`
Expected: FAIL — the promise resolves to `undefined`, not `"version-99"`.

- [ ] **Step 3: Add the missing `return`**

In `apps/web/features/projects/project-data.ts`, replace lines 464-475:

```ts
export async function createDesignVersion(
  database: SupabaseDatabase,
  input: { deliverableId: string; notes: string; copyVersionId?: string },
) {
  return assertResult(
    await database.rpc("create_design_version", {
      p_deliverable_id: input.deliverableId,
      p_notes: input.notes,
      ...(input.copyVersionId ? { p_copy_version_id: input.copyVersionId } : {}),
    }),
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/projects/project-data.test.ts`
Expected: PASS, including the two pre-existing `createDesignVersion` tests and the
`"project write failures"` table's `createDesignVersion` entry (error propagation is unaffected by
adding a return value on the success path).

- [ ] **Step 5: Write the failing test for `usePublishedVersionNumbers`**

```ts
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePublishedVersionNumbers } from "./project-data";

const auth = vi.hoisted(() => ({
  session: { user: { id: "viewer-a" } },
  database: { from: vi.fn() },
}));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));
const clients: QueryClient[] = [];

function environment() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.session = { user: { id: "viewer-a" } };
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

describe("usePublishedVersionNumbers", () => {
  it("reads deliverable_id/version_number pairs for the project, scoped by project_id", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [{ deliverable_id: "d-story", version_number: 1 }],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ eq });
    auth.database.from.mockReturnValue({ select });
    const { wrapper } = environment();
    const { result } = renderHook(() => usePublishedVersionNumbers("project-1", true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(auth.database.from).toHaveBeenCalledWith("published_versions");
    expect(select).toHaveBeenCalledWith("deliverable_id,version_number");
    expect(eq).toHaveBeenCalledWith("project_id", "project-1");
    expect(result.current.data).toEqual([{ deliverable_id: "d-story", version_number: 1 }]);
  });

  it("stays disabled until the dialog opens", async () => {
    const { wrapper } = environment();
    const { result } = renderHook(() => usePublishedVersionNumbers("project-1", false), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(auth.database.from).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the test and verify it fails**

Run: `cd apps/web && npx vitest run features/projects/project-published-versions.test.tsx`
Expected: FAIL — `usePublishedVersionNumbers` is not exported yet.

- [ ] **Step 7: Implement `usePublishedVersionNumbers`**

In `apps/web/features/projects/project-data.ts`, insert immediately after `useDesignAssetUrl` ends
(after line 318, before the `projectQueryKeys` comment at line 320):

```ts
/**
 * Whether each deliverable's current version is already shared with the client, needed only by
 * the bulk-drop confirmation dialog's default current-vs-new-version rule.
 *
 * Deliberately absent from `projectQueryKeys`: this read is only ever active while the dialog is
 * open (a fresh mount each time, via `enabled`), so React Query's default zero staleTime already
 * refetches it on every open — no write in this feature needs to dirty a long-lived cache entry
 * for it. `publish_version` (the only write that changes this table) already invalidates
 * `project-detail` for the same reason `assignments`/`asset-url` are excluded above: this key
 * would only ever be stale for a dialog that is not mounted, and a closed dialog cannot show a
 * stale default to anyone.
 *
 * A designer session gets an empty result here even for a deliverable that genuinely is shared:
 * `publications_read` (`supabase/migrations/202609200001_foundation.sql:266`) grants
 * `published_versions` only to `private.can_client_channel` — agency or a client member — which a
 * `designer` role never satisfies. That is an existing permission boundary, not something this
 * hook can or should work around.
 */
export function usePublishedVersionNumbers(projectId: string, enabled: boolean) {
  const { database, session } = useAuth();
  return useQuery({
    queryKey: ["published-version-numbers", session?.user.id, projectId],
    enabled: !!session && enabled,
    queryFn: async () =>
      assertResult(
        await database
          .from("published_versions")
          .select("deliverable_id,version_number")
          .eq("project_id", projectId),
      ),
  });
}

```

- [ ] **Step 8: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/projects/project-published-versions.test.tsx features/projects/project-data.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/features/projects/project-data.ts apps/web/features/projects/project-data.test.ts apps/web/features/projects/project-published-versions.test.tsx
git commit -m "feat(projects): read published-version numbers and return the created version id"
```

---

### Task 3: `bulk-drop-upload.ts` — upload orchestration

**Files:**
- Create: `apps/web/features/projects/bulk-drop-upload.ts`
- Create: `apps/web/features/projects/bulk-drop-upload.test.ts`

**Design decision (why registration is sequential per deliverable while uploads are not):**
`add_design`'s `sort_order` is a plain `count(*)` with no row lock (Task 2's research note). If two
files for the same deliverable/version called `add_design` concurrently, both could read the same
count and either violate natural order or (less likely but possible) both land at the same
`sort_order`. Global upload concurrency (memory-bound, the spec's actual "three in flight"
constraint) and per-deliverable registration order are therefore decoupled: every file's
`uploadArtwork` call goes through one shared `BULK_DROP_CONCURRENCY`-wide slot pool, but each
deliverable runs its own independent, strictly sequential loop over its naturally-sorted files —
awaiting that specific file's upload (already dispatched to the shared pool, so it may already be
settled) before calling `add_design`, then moving to the next file. Two different deliverables'
loops run fully concurrently with each other; nothing about one deliverable's version is shared
mutable state with another's.

**Interfaces:**
- Consumes: `BULK_DROP_CONCURRENCY`, `deriveDesignTitle`, `buildDesignContent` (`bulk-drop-model.ts`, Task 1).
- Produces (consumed by Task 4):
  - `export type UploadFileTask = { id: string; file: File }`
  - `export type DeliverableRun = { deliverableId: string; deliverableName: string; versionChoice: "current" | "new"; currentVersionId?: string; files: UploadFileTask[] }`
  - `export type FileStatus = { state: "queued" } | { state: "uploading" } | { state: "done" } | { state: "failed"; message: string } | { state: "blocked" } | { state: "cancelled" }`
  - `export type BulkDropDependencies = { uploadArtwork: (file: File) => Promise<string>; discardUnreferencedArtwork: (path: string) => Promise<void>; createDesignVersion: (deliverableId: string) => Promise<string>; addDesign: (versionId: string, title: string, assetPath: string) => Promise<void> }`
  - `export type BulkDropOptions = { concurrency?: number; isCancelled?: () => boolean; knownVersionIds?: Record<string, string>; onFileStatus?: (fileId: string, status: FileStatus) => void }`
  - `export type BulkDropResult = { resolvedVersionIds: Record<string, string>; outcomes: Record<string, FileStatus>; permissionDenied: boolean }`
  - `export function isPermissionDeniedError(error: unknown): boolean`
  - `export async function runBulkDrop(deps: BulkDropDependencies, runs: DeliverableRun[], options?: BulkDropOptions): Promise<BulkDropResult>`

- [ ] **Step 1: Write the failing tests for concurrency and per-deliverable order**

```ts
import { describe, expect, it, vi } from "vitest";
import { runBulkDrop, type BulkDropDependencies, type DeliverableRun } from "./bulk-drop-upload";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function task(id: string, name: string): { id: string; file: File } {
  return { id, file: new File([], name, { type: "image/png" }) };
}

describe("runBulkDrop concurrency", () => {
  it("never has more than the given concurrency limit uploading at once", async () => {
    let active = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, () => deferred<string>());
    let call = 0;
    const deps: BulkDropDependencies = {
      uploadArtwork: async () => {
        active++;
        peak = Math.max(peak, active);
        const gate = gates[call++];
        const path = await gate.promise;
        active--;
        return path;
      },
      discardUnreferencedArtwork: async () => {},
      createDesignVersion: async () => "version-new",
      addDesign: async () => {},
    };
    const runs: DeliverableRun[] = [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png"), task("f3", "c.png"), task("f4", "d.png"), task("f5", "e.png")],
      },
    ];
    const run = runBulkDrop(deps, runs, { concurrency: 3 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(peak).toBe(3);
    gates.forEach((gate, index) => gate.resolve(`path-${index}`));
    await run;
  });

  it("registers files in natural order within a deliverable even when uploads resolve out of order", async () => {
    const gates = { "b.png": deferred<string>(), "a.png": deferred<string>(), "c.png": deferred<string>() };
    const registered: string[] = [];
    const deps: BulkDropDependencies = {
      uploadArtwork: async (file) => (await gates[file.name as keyof typeof gates].promise),
      discardUnreferencedArtwork: async () => {},
      createDesignVersion: async () => "version-new",
      addDesign: async (_versionId, title) => {
        registered.push(title);
      },
    };
    const runs: DeliverableRun[] = [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png"), task("f3", "c.png")],
      },
    ];
    const run = runBulkDrop(deps, runs, { concurrency: 3 });
    // Resolve out of order: b, then c, then a.
    gates["b.png"].resolve("path-b");
    await new Promise((resolve) => setTimeout(resolve, 0));
    gates["c.png"].resolve("path-c");
    await new Promise((resolve) => setTimeout(resolve, 0));
    gates["a.png"].resolve("path-a");
    await run;
    expect(registered).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-upload.test.ts`
Expected: FAIL — `./bulk-drop-upload` does not exist yet.

- [ ] **Step 3: Implement the concurrency-limited upload slot and per-deliverable walk**

```ts
/**
 * Drives the actual upload/registration work for a confirmed bulk drop. Every side effect goes
 * through the injected `BulkDropDependencies` — this module imports neither Supabase nor React, so
 * it is unit-tested with plain fakes. See `bulk-drop-dialog.tsx` for the real dependencies, built
 * from `artwork-files.ts` and `project-data.ts`.
 *
 * docs/superpowers/specs/2026-09-23-bulk-image-drop-design.md
 */
import { BULK_DROP_CONCURRENCY, buildDesignContent, deriveDesignTitle } from "./bulk-drop-model";

export type UploadFileTask = { id: string; file: File };

export type DeliverableRun = {
  deliverableId: string;
  deliverableName: string;
  versionChoice: "current" | "new";
  /** Required when `versionChoice` is `"current"`. */
  currentVersionId?: string;
  /** Already naturally sorted by `bulk-drop-model.ts`'s `buildDeliverablePlans`. */
  files: UploadFileTask[];
};

export type FileStatus =
  | { state: "queued" }
  | { state: "uploading" }
  | { state: "done" }
  | { state: "failed"; message: string }
  | { state: "blocked" }
  | { state: "cancelled" };

export type BulkDropDependencies = {
  uploadArtwork: (file: File) => Promise<string>;
  discardUnreferencedArtwork: (path: string) => Promise<void>;
  createDesignVersion: (deliverableId: string) => Promise<string>;
  addDesign: (versionId: string, title: string, assetPath: string) => Promise<void>;
};

export type BulkDropOptions = {
  concurrency?: number;
  isCancelled?: () => boolean;
  /** Deliverable ids whose version was already created by an earlier attempt (a retry). */
  knownVersionIds?: Record<string, string>;
  onFileStatus?: (fileId: string, status: FileStatus) => void;
};

export type BulkDropResult = {
  resolvedVersionIds: Record<string, string>;
  outcomes: Record<string, FileStatus>;
  permissionDenied: boolean;
};

const PERMISSION_DENIED_MESSAGE = "Production access required";

/** Matches the exact message `create_design_version`/`add_design` raise for `private.can_produce` failing. */
export function isPermissionDeniedError(error: unknown): boolean {
  return error instanceof Error && error.message === PERMISSION_DENIED_MESSAGE;
}

/** A counting semaphore: at most `limit` callers past `acquire()` release before the next queued one starts. */
function createLimiter(limit: number) {
  let active = 0;
  const waiters: (() => void)[] = [];
  return async function withSlot<T>(run: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => waiters.push(resolve));
    active++;
    try {
      return await run();
    } finally {
      active--;
      waiters.shift()?.();
    }
  };
}

export async function runBulkDrop(
  deps: BulkDropDependencies,
  runs: DeliverableRun[],
  options: BulkDropOptions = {},
): Promise<BulkDropResult> {
  const withUploadSlot = createLimiter(options.concurrency ?? BULK_DROP_CONCURRENCY);
  const isCancelled = options.isCancelled ?? (() => false);
  const onFileStatus = options.onFileStatus ?? (() => {});
  const resolvedVersionIds: Record<string, string> = { ...options.knownVersionIds };
  const outcomes: Record<string, FileStatus> = {};
  let permissionDenied = false;

  function setStatus(id: string, status: FileStatus) {
    outcomes[id] = status;
    onFileStatus(id, status);
  }

  async function walk(run: DeliverableRun) {
    let versionId = run.versionChoice === "current" ? run.currentVersionId : resolvedVersionIds[run.deliverableId];
    if (!versionId) {
      if (isCancelled()) {
        for (const task of run.files) setStatus(task.id, { state: "cancelled" });
        return;
      }
      try {
        versionId = await deps.createDesignVersion(run.deliverableId);
        resolvedVersionIds[run.deliverableId] = versionId;
      } catch (error) {
        if (isPermissionDeniedError(error)) permissionDenied = true;
        const message = error instanceof Error ? error.message : "Could not create the new version.";
        for (const task of run.files) setStatus(task.id, { state: "failed", message });
        return;
      }
    }
    for (const task of run.files) {
      if (isCancelled()) {
        setStatus(task.id, { state: "cancelled" });
        continue;
      }
      if (permissionDenied) {
        setStatus(task.id, { state: "blocked" });
        continue;
      }
      setStatus(task.id, { state: "uploading" });
      let path: string;
      try {
        path = await withUploadSlot(() => deps.uploadArtwork(task.file));
      } catch (error) {
        const message = error instanceof Error ? error.message : "The upload failed.";
        setStatus(task.id, { state: "failed", message });
        continue;
      }
      try {
        await deps.addDesign(versionId, deriveDesignTitle(task.file.name), path);
        setStatus(task.id, { state: "done" });
      } catch (error) {
        if (isPermissionDeniedError(error)) permissionDenied = true;
        await deps.discardUnreferencedArtwork(path).catch(() => {});
        const message = error instanceof Error ? error.message : "The design could not be registered.";
        setStatus(task.id, { state: "failed", message });
      }
    }
  }

  await Promise.all(runs.map(walk));
  return { resolvedVersionIds, outcomes, permissionDenied };
}
```

Note: `buildDesignContent` is imported for symmetry with the real dependency wiring in Task 4 (the
dialog builds its `addDesign` wrapper with it); `runBulkDrop` itself only needs `deriveDesignTitle`.
Remove the unused `buildDesignContent` import if the linter flags it — the dialog is the one that
calls it.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-upload.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing tests for upload failure, isolation, lazy version reuse, permission-denied and cancel**

```ts
describe("runBulkDrop isolation and version lifecycle", () => {
  const okDeps = (): BulkDropDependencies => ({
    uploadArtwork: async (file) => `path/${file.name}`,
    discardUnreferencedArtwork: vi.fn(async () => {}),
    createDesignVersion: vi.fn(async () => "version-new"),
    addDesign: vi.fn(async () => {}),
  });

  it("creates a deliverable's new version exactly once, even with several files", async () => {
    const deps = okDeps();
    await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png")],
      },
    ]);
    expect(deps.createDesignVersion).toHaveBeenCalledTimes(1);
    expect(deps.addDesign).toHaveBeenCalledTimes(2);
  });

  it("never calls createDesignVersion when the choice is the current version", async () => {
    const deps = okDeps();
    await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "current",
        currentVersionId: "version-1",
        files: [task("f1", "a.png")],
      },
    ]);
    expect(deps.createDesignVersion).not.toHaveBeenCalled();
    expect(deps.addDesign).toHaveBeenCalledWith("version-1", "a", "path/a.png");
  });

  it("reuses a known version id instead of creating a second one on retry", async () => {
    const deps = okDeps();
    await runBulkDrop(
      deps,
      [
        {
          deliverableId: "d-square",
          deliverableName: "Campaign square",
          versionChoice: "new",
          files: [task("f1", "a.png")],
        },
      ],
      { knownVersionIds: { "d-square": "version-already-made" } },
    );
    expect(deps.createDesignVersion).not.toHaveBeenCalled();
    expect(deps.addDesign).toHaveBeenCalledWith("version-already-made", "a", "path/a.png");
  });

  it("marks only the failed upload as failed, without discarding anything or touching its siblings", async () => {
    const deps = okDeps();
    deps.uploadArtwork = vi
      .fn()
      .mockResolvedValueOnce("path/a.png")
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce("path/c.png");
    const result = await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png"), task("f3", "c.png")],
      },
    ]);
    expect(result.outcomes["f1"]).toEqual({ state: "done" });
    expect(result.outcomes["f2"]).toEqual({ state: "failed", message: "network error" });
    expect(result.outcomes["f3"]).toEqual({ state: "done" });
    // Nothing was ever uploaded for f2, so there is nothing to discard -- unlike the add_design
    // failure case below, which discards a real stored object.
    expect(deps.discardUnreferencedArtwork).not.toHaveBeenCalled();
    expect(deps.addDesign).toHaveBeenCalledTimes(2);
  });

  it("discards the upload and fails only that file when add_design fails, leaving siblings untouched", async () => {
    const deps = okDeps();
    deps.addDesign = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const result = await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png"), task("f3", "c.png")],
      },
    ]);
    expect(result.outcomes["f1"]).toEqual({ state: "done" });
    expect(result.outcomes["f2"]).toEqual({ state: "failed", message: "boom" });
    expect(result.outcomes["f3"]).toEqual({ state: "done" });
    expect(deps.discardUnreferencedArtwork).toHaveBeenCalledWith("path/b.png");
    expect(deps.discardUnreferencedArtwork).toHaveBeenCalledTimes(1);
  });

  it("fails every file in a deliverable when create_design_version fails, without touching other deliverables", async () => {
    const deps = okDeps();
    deps.createDesignVersion = vi.fn(async (deliverableId) => {
      if (deliverableId === "d-square") throw new Error("no room");
      return "version-story";
    });
    const result = await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png")],
      },
      {
        deliverableId: "d-story",
        deliverableName: "Campaign story",
        versionChoice: "new",
        files: [task("f3", "c.png")],
      },
    ]);
    expect(result.outcomes["f1"]).toEqual({ state: "failed", message: "no room" });
    expect(result.outcomes["f2"]).toEqual({ state: "failed", message: "no room" });
    expect(result.outcomes["f3"]).toEqual({ state: "done" });
    expect(deps.addDesign).toHaveBeenCalledTimes(1);
  });

  it("stops the whole batch on a permission-denied error, blocking files not yet started", async () => {
    const deps = okDeps();
    let calls = 0;
    deps.addDesign = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("Production access required");
    });
    const result = await runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png")],
      },
    ]);
    expect(result.permissionDenied).toBe(true);
    expect(result.outcomes["f1"].state).toBe("failed");
    expect(result.outcomes["f2"]).toEqual({ state: "blocked" });
  });

  it("marks not-yet-started files cancelled, while an already in-flight file still finishes and registers", async () => {
    const deps = okDeps();
    const gate = deferred<string>();
    let uploadCalls = 0;
    deps.uploadArtwork = vi.fn(async (file) => {
      uploadCalls++;
      if (uploadCalls === 1) return gate.promise;
      return `path/${file.name}`;
    });
    let cancelled = false;
    const run = runBulkDrop(deps, [
      {
        deliverableId: "d-square",
        deliverableName: "Campaign square",
        versionChoice: "new",
        files: [task("f1", "a.png"), task("f2", "b.png")],
      },
    ], { isCancelled: () => cancelled });
    await new Promise((resolve) => setTimeout(resolve, 0));
    cancelled = true;
    gate.resolve("path/a.png");
    const result = await run;
    expect(result.outcomes["f1"]).toEqual({ state: "done" });
    expect(result.outcomes["f2"]).toEqual({ state: "cancelled" });
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-upload.test.ts`
Expected: the eight new cases most likely PASS immediately — Step 3's `walk` was written with
isolation, lazy-once version creation, permission-denied propagation and cancel already in mind
(the shared `permissionDenied`/`isCancelled()` closures are read at the top of every loop
iteration, in every deliverable's independent `walk(...)` call), not added incrementally case by
case. This step exists to confirm that design against real assertions, not to assume a gap exists:
run the suite and read the actual result before changing anything.

- [ ] **Step 7: If any case fails, fix the implementation, not the test**

If a case fails, the most likely gap is the `permissionDenied` check's placement: it must be read
at the *top* of each loop iteration (both the version-creation guard and the per-file loop), so a
permission-denied error raised by one file is seen by every file after it — in its own deliverable
immediately, and in every other deliverable's independent `walk(...)` the next time that walk's
loop advances (the flag is a variable shared by closure across every `walk(...)` call started by
the same `runBulkDrop` invocation, not per-deliverable state). Add the missing check rather than
loosening what a test asserts — the eight cases encode the spec's Failure Handling table verbatim,
not a guess at behavior.

- [ ] **Step 8: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-upload.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 9: Commit**

```bash
git add apps/web/features/projects/bulk-drop-upload.ts apps/web/features/projects/bulk-drop-upload.test.ts
git commit -m "feat(projects): add bulk-drop upload orchestration with bounded concurrency and ordered registration"
```

---

### Task 4: `bulk-drop-dialog.tsx` — confirmation, unmatched picker, progress, retry

**Files:**
- Create: `apps/web/features/projects/bulk-drop-dialog.tsx`
- Create: `apps/web/features/projects/bulk-drop-dialog.test.tsx`

**Interfaces:**
- Consumes: `classifyFiles`, `buildDeliverablePlans`, `latestVersionPerDeliverable`,
  `deriveDesignTitle`, `buildDesignContent`, `bulkDropImageMimes`, `ARTWORK_MAX_BYTES`-shaped
  `DeliverablePlan`/`VersionChoice`/`BulkDropDeliverable` types (`bulk-drop-model.ts`, Task 1);
  `runBulkDrop`, `UploadFileTask`, `DeliverableRun`, `FileStatus`, `BulkDropResult`
  (`bulk-drop-upload.ts`, Task 3); `usePublishedVersionNumbers`, `createDesignVersion`, `addDesign`,
  `useInvalidateProject`, `type CanvasVersion` (`project-data.ts`, Task 2); `uploadArtwork`,
  `discardUnreferencedArtwork` (`artwork-files.ts`, unmodified); `Modal` (`@/features/shared/modal`);
  `useAuth` (`@/features/auth/auth-provider`).
- Produces (consumed by Task 5): `export function BulkDropDialog({ projectId, deliverables,
  versions, files, onClose }: { projectId: string; deliverables: BulkDropDeliverable[]; versions:
  Pick<CanvasVersion, "id" | "deliverableId" | "number">[]; files: File[] | null; onClose: () =>
  void })`.

- [ ] **Step 1: Write the failing component tests for classification, choices and confirm-gating**

```tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BulkDropDialog } from "./bulk-drop-dialog";
import type { BulkDropDeliverable } from "./bulk-drop-model";

const data = vi.hoisted(() => ({
  usePublishedVersionNumbers: vi.fn(),
  useInvalidateProject: vi.fn(() => vi.fn()),
  createDesignVersion: vi.fn(),
  addDesign: vi.fn(),
}));
vi.mock("./project-data", () => data);
vi.mock("./artwork-files", () => ({ uploadArtwork: vi.fn(), discardUnreferencedArtwork: vi.fn() }));
const auth = vi.hoisted(() => ({ database: {}, session: { user: { id: "agency-1" } } }));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));

const upload = vi.hoisted(() => ({ runBulkDrop: vi.fn() }));
vi.mock("./bulk-drop-upload", () => upload);

const square: BulkDropDeliverable = { id: "d-square", name: "Campaign square", width: 1080, height: 1080 };
const story: BulkDropDeliverable = { id: "d-story", name: "Campaign story", width: 1080, height: 1920 };

function image(name: string, width: number, height: number): File {
  const file = new File([new Uint8Array(1024)], name, { type: "image/png" });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  data.usePublishedVersionNumbers.mockReturnValue({ data: [], isSuccess: true });
  upload.runBulkDrop.mockResolvedValue({ resolvedVersionIds: {}, outcomes: {}, permissionDenied: false });
  // jsdom has no createImageBitmap; the dialog's own dimension reader is stubbed per test.
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(
    async (blob: Blob & { __width?: number; __height?: number }) => ({
      width: (blob as never as { name: string }).name.includes("square") ? 1080 : 1080,
      height: (blob as never as { name: string }).name.includes("story") ? 1920 : 1080,
      close: vi.fn(),
    }),
  );
});

describe("BulkDropDialog classification and choices", () => {
  it("shows one block per affected deliverable, each with its own version choice", async () => {
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square, story]}
        versions={[{ id: "v-square-1", deliverableId: "d-square", number: 1 }]}
        files={[image("square-1.png", 1080, 1080), image("story-1.png", 1080, 1920)]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("Campaign square")).toBeInTheDocument());
    expect(screen.getByText("Campaign story")).toBeInTheDocument();
    expect(screen.getByLabelText(/Add to V1/)).toBeChecked();
    // Campaign story has no current version: no question, straight to V1.
    expect(screen.queryByLabelText(/Add to V/i, { selector: `input[name="version-d-story"]` })).toBeNull();
  });

  it("disables confirmation until every unmatched file is assigned or skipped", async () => {
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square]}
        versions={[]}
        files={[image("square-1.png", 1080, 1080), image("odd.png", 400, 300)]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("odd.png")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Add 2 images/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Skip odd.png/i }));
    expect(screen.getByRole("button", { name: /Add 2 images/i })).toBeEnabled();
  });

  it("preselects a new version when the current one is already shared with the client", async () => {
    data.usePublishedVersionNumbers.mockReturnValue({
      data: [{ deliverable_id: "d-square", version_number: 1 }],
      isSuccess: true,
    });
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square]}
        versions={[{ id: "v-square-1", deliverableId: "d-square", number: 1 }]}
        files={[image("square-1.png", 1080, 1080)]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText(/Create V2/)).toBeChecked());
  });

  it("shows only the not-added list, with reasons, when nothing in the drop is usable", async () => {
    const video = new File([new Uint8Array(1024)], "clip.mp4", { type: "video/mp4" });
    const oversized = new File([new Uint8Array(30 * 1024 * 1024)], "huge.png", { type: "image/png" });
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square]}
        versions={[]}
        files={[video, oversized]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("Not added")).toBeInTheDocument());
    expect(screen.getByText(/clip.mp4/)).toBeInTheDocument();
    expect(screen.getByText(/use Add design/i)).toBeInTheDocument();
    expect(screen.getByText(/huge.png/)).toBeInTheDocument();
    expect(screen.getByText(/no larger than/i)).toBeInTheDocument();
    // No deliverable block, no unmatched picker -- nothing was matched, tied or left unmatched.
    expect(screen.queryByText("Campaign square")).toBeNull();
    expect(screen.queryByText("Needs a deliverable")).toBeNull();
    // The confirm control stays disabled rather than silently absent, so the state reads as
    // "nothing to add" instead of a broken dialog.
    expect(screen.getByRole("button", { name: /Add 0 images/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-dialog.test.tsx`
Expected: FAIL — `./bulk-drop-dialog` does not exist yet.

- [ ] **Step 3: Implement `BulkDropDialog` (classification, deliverable blocks, unmatched picker)**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { discardUnreferencedArtwork, uploadArtwork } from "./artwork-files";
import {
  addDesign,
  createDesignVersion,
  usePublishedVersionNumbers,
  useInvalidateProject,
} from "./project-data";
import {
  buildDeliverablePlans,
  buildDesignContent,
  classifyFiles,
  deriveDesignTitle,
  latestVersionPerDeliverable,
  type BulkDropDeliverable,
  type ClassifiedFiles,
  type DeliverablePlan,
  type VersionChoice,
} from "./bulk-drop-model";
import {
  runBulkDrop,
  type BulkDropDependencies,
  type BulkDropResult,
  type DeliverableRun,
  type FileStatus,
  type UploadFileTask,
} from "./bulk-drop-upload";

/** The browser's own way to read an image's pixel size, wrapped to match `DimensionReader`. */
async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return null;
  }
}

type UnmatchedAssignment = { deliverableId: string } | { skipped: true };

export function BulkDropDialog({
  projectId,
  deliverables,
  versions,
  files,
  onClose,
}: {
  projectId: string;
  deliverables: BulkDropDeliverable[];
  versions: { id: string; deliverableId: string; number: number }[];
  files: File[] | null;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const invalidate = useInvalidateProject();
  const open = !!files && files.length > 0;
  const published = usePublishedVersionNumbers(projectId, open);
  const [classified, setClassified] = useState<ClassifiedFiles | null>(null);
  const [assignments, setAssignments] = useState<Record<string, UnmatchedAssignment>>({});
  const [choices, setChoices] = useState<Record<string, VersionChoice>>({});
  const [statuses, setStatuses] = useState<Record<string, FileStatus>>({});
  const [running, setRunning] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [lastResult, setLastResult] = useState<BulkDropResult | null>(null);
  const [taskIds] = useState(() => new Map<File, string>());

  useEffect(() => {
    if (!open) {
      setClassified(null);
      setAssignments({});
      setChoices({});
      setStatuses({});
      setRunning(false);
      setCancelled(false);
      setLastResult(null);
      taskIds.clear();
      return;
    }
    let live = true;
    void classifyFiles(files!, deliverables, readImageDimensions).then((result) => {
      if (live) setClassified(result);
    });
    return () => {
      live = false;
    };
  }, [open, files, deliverables, taskIds]);

  const currentVersions = useMemo(() => latestVersionPerDeliverable(versions), [versions]);
  const isPublished = (deliverableId: string, versionNumber: number) =>
    (published.data ?? []).some(
      (row) => row.deliverable_id === deliverableId && row.version_number === versionNumber,
    );

  const manuallyAssigned = useMemo(() => {
    if (!classified) return [];
    const pending = [...classified.tied, ...classified.unmatched];
    return pending
      .map(({ file }) => {
        const key = fileKey(file);
        const assignment = assignments[key];
        return assignment && "deliverableId" in assignment
          ? { file, deliverableId: assignment.deliverableId }
          : null;
      })
      .filter((entry): entry is { file: File; deliverableId: string } => !!entry);
  }, [classified, assignments]);

  const plans: DeliverablePlan[] = useMemo(() => {
    if (!classified) return [];
    return buildDeliverablePlans(
      [...classified.matched, ...manuallyAssigned],
      deliverables,
      currentVersions,
      isPublished,
    );
  }, [classified, manuallyAssigned, deliverables, currentVersions, published.data]);

  const needsAssignment = classified ? [...classified.tied, ...classified.unmatched] : [];
  const everyNeedsAssignmentResolved = needsAssignment.every((entry) => !!assignments[fileKey(entry.file)]);
  const totalFiles = plans.reduce((count, plan) => count + plan.files.length, 0);
  const canConfirm = !!classified && totalFiles > 0 && everyNeedsAssignmentResolved && !running;

  function choiceFor(plan: DeliverablePlan): VersionChoice {
    return choices[plan.deliverableId] ?? plan.defaultChoice;
  }

  function idFor(file: File): string {
    let id = taskIds.get(file);
    if (!id) {
      id = crypto.randomUUID();
      taskIds.set(file, id);
    }
    return id;
  }

  function dependencies(): BulkDropDependencies {
    return {
      uploadArtwork: (file) => uploadArtwork(database, projectId, file),
      discardUnreferencedArtwork: (path) => discardUnreferencedArtwork(database, path),
      createDesignVersion: (deliverableId) => createDesignVersion(database, { deliverableId, notes: "" }),
      addDesign: (versionId, title, assetPath) =>
        addDesign(database, {
          versionId,
          title,
          content: buildDesignContent(title),
          internalAssetPath: assetPath,
        }),
    };
  }

  function buildRuns(onlyFileIds?: Set<string>): DeliverableRun[] {
    return plans
      .map((plan) => {
        const planFiles: UploadFileTask[] = plan.files
          .map((file) => ({ id: idFor(file), file }))
          .filter((task) => !onlyFileIds || onlyFileIds.has(task.id));
        return {
          deliverableId: plan.deliverableId,
          deliverableName: plan.deliverableName,
          versionChoice: choiceFor(plan),
          currentVersionId: plan.currentVersion?.versionId,
          files: planFiles,
        };
      })
      .filter((run) => run.files.length > 0);
  }

  async function start() {
    setRunning(true);
    setCancelled(false);
    const result = await runBulkDrop(dependencies(), buildRuns(), {
      isCancelled: () => cancelled,
      onFileStatus: (id, status) => setStatuses((current) => ({ ...current, [id]: status })),
    });
    setLastResult(result);
    setRunning(false);
    await invalidate();
  }

  async function retry() {
    const failedIds = new Set(
      Object.entries(statuses)
        .filter(([, status]) => status.state === "failed")
        .map(([id]) => id),
    );
    setRunning(true);
    setCancelled(false);
    const result = await runBulkDrop(dependencies(), buildRuns(failedIds), {
      isCancelled: () => cancelled,
      knownVersionIds: lastResult?.resolvedVersionIds,
      onFileStatus: (id, status) => setStatuses((current) => ({ ...current, [id]: status })),
    });
    setLastResult(result);
    setRunning(false);
    await invalidate();
  }

  const doneCount = Object.values(statuses).filter((status) => status.state === "done").length;
  const failedCount = Object.values(statuses).filter((status) => status.state === "failed").length;
  const finished = lastResult !== null && !running;

  return (
    <Modal
      open={open}
      onClose={() => !running && onClose()}
      title="Add images"
      size="lg"
      closeDisabled={running}
    >
      {!classified ? (
        <p>Reading dropped files…</p>
      ) : (
        <div className="stack-form bulk-drop-dialog">
          {plans.map((plan) => (
            <fieldset className="bulk-drop-deliverable" key={plan.deliverableId}>
              <legend>
                {plan.deliverableName} · {plan.files.length} image{plan.files.length === 1 ? "" : "s"}
              </legend>
              {plan.askChoice && plan.currentVersion ? (
                <div className="form-row" role="radiogroup" aria-label={`Version for ${plan.deliverableName}`}>
                  <label>
                    <input
                      type="radio"
                      name={`version-${plan.deliverableId}`}
                      checked={choiceFor(plan) === "current"}
                      disabled={running}
                      onChange={() =>
                        setChoices((current) => ({ ...current, [plan.deliverableId]: "current" }))
                      }
                    />
                    Add to V{plan.currentVersion.number}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`version-${plan.deliverableId}`}
                      checked={choiceFor(plan) === "new"}
                      disabled={running}
                      onChange={() => setChoices((current) => ({ ...current, [plan.deliverableId]: "new" }))}
                    />
                    Create V{plan.currentVersion.number + 1}
                  </label>
                </div>
              ) : (
                <p className="bulk-drop-new-version-note">Creates V1 — this deliverable has no version yet.</p>
              )}
              <ul className="bulk-drop-file-list">
                {plan.files.map((file) => {
                  const status = statuses[idFor(file)];
                  return (
                    <li key={fileKey(file)}>
                      {file.name}
                      {status && <span className={`bulk-drop-status is-${status.state}`}>{statusLabel(status)}</span>}
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}

          {needsAssignment.length > 0 && (
            <fieldset className="bulk-drop-unmatched">
              <legend>Needs a deliverable</legend>
              <ul className="bulk-drop-file-list">
                {needsAssignment.map(({ file }) => (
                  <li key={fileKey(file)}>
                    {file.name}
                    <select
                      aria-label={`Deliverable for ${file.name}`}
                      value={
                        (assignments[fileKey(file)] && "deliverableId" in assignments[fileKey(file)]
                          ? (assignments[fileKey(file)] as { deliverableId: string }).deliverableId
                          : "") 
                      }
                      disabled={running}
                      onChange={(event) =>
                        setAssignments((current) => ({
                          ...current,
                          [fileKey(file)]: { deliverableId: event.target.value },
                        }))
                      }
                    >
                      <option value="">Choose a deliverable…</option>
                      {deliverables.map((deliverable) => (
                        <option key={deliverable.id} value={deliverable.id}>
                          {deliverable.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button quiet"
                      disabled={running}
                      onClick={() =>
                        setAssignments((current) => ({ ...current, [fileKey(file)]: { skipped: true } }))
                      }
                    >
                      {`Skip ${file.name}`}
                    </button>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {classified.rejected.length > 0 && (
            <fieldset className="bulk-drop-rejected">
              <legend>Not added</legend>
              <ul className="bulk-drop-file-list">
                {classified.rejected.map(({ file, reason }) => (
                  <li key={fileKey(file)}>
                    {file.name} — {reason}
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {finished && (
            <p className="bulk-drop-summary" aria-live="polite">
              {doneCount} added{failedCount > 0 ? ` · ${failedCount} failed` : ""}
              {lastResult?.permissionDenied && " · You no longer have production access to this project."}
              {failedCount > 0 && (
                <button type="button" className="button quiet" onClick={() => void retry()}>
                  Try again
                </button>
              )}
            </p>
          )}

          <div className="form-actions">
            {running ? (
              <button type="button" className="button" onClick={() => setCancelled(true)}>
                Cancel
              </button>
            ) : (
              <button type="button" className="button" onClick={onClose} disabled={running}>
                Close
              </button>
            )}
            {!finished && (
              <button
                type="button"
                className="button primary"
                disabled={!canConfirm}
                onClick={() => void start()}
              >
                {`Add ${totalFiles} image${totalFiles === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function statusLabel(status: FileStatus): string {
  if (status.state === "failed") return status.message;
  return status.state;
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-dialog.test.tsx`
Expected: PASS (4 tests). Adjust the `readImageDimensions` stub or the queried labels/roles above
if the actual rendered text differs slightly from the test's expectations — keep the test's intent
(one block per deliverable, gated confirmation, preselection from published state, the all-rejected
not-added list) rather than loosening what it asserts.

- [ ] **Step 5: Write the failing tests for progress and retry**

```tsx
describe("BulkDropDialog progress and retry", () => {
  it("shows a summary and a retry action limited to failed files after the run finishes", async () => {
    render(
      <BulkDropDialog
        projectId="project-1"
        deliverables={[square]}
        versions={[]}
        files={[image("square-1.png", 1080, 1080), image("square-2.png", 1080, 1080)]}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /Add 2 images/i })).toBeEnabled());

    // Read the real per-file ids the dialog generated (`buildRuns`'s `idFor`) from the first call's
    // own arguments, rather than inventing ids — a fake id the dialog never assigned would never
    // match anything in a real `retry()` call, which would make the assertion below pass no matter
    // what the component actually does.
    upload.runBulkDrop.mockImplementationOnce(async (_deps, runs, options) => {
      const [first, second] = runs[0].files as { id: string }[];
      options.onFileStatus(first.id, { state: "done" });
      options.onFileStatus(second.id, { state: "failed", message: "network error" });
      return {
        resolvedVersionIds: { "d-square": "version-new" },
        outcomes: {},
        permissionDenied: false,
      };
    });
    await userEvent.click(screen.getByRole("button", { name: /Add 2 images/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument());
    expect(screen.getByText(/1 added · 1 failed/)).toBeInTheDocument();

    upload.runBulkDrop.mockClear();
    upload.runBulkDrop.mockResolvedValueOnce({ resolvedVersionIds: {}, outcomes: {}, permissionDenied: false });
    await userEvent.click(screen.getByRole("button", { name: /Try again/i }));
    await waitFor(() => expect(upload.runBulkDrop).toHaveBeenCalledTimes(1));
    const [, retryRuns, retryOptions] = upload.runBulkDrop.mock.calls[0];
    expect(retryRuns).toHaveLength(1);
    expect(retryRuns[0].files).toHaveLength(1);
    expect(retryOptions.knownVersionIds).toEqual({ "d-square": "version-new" });
  });
});
```

- [ ] **Step 6: Run the test and verify it fails**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-dialog.test.tsx -t "retry"`
Expected: FAIL if the summary text, the `Try again` gating, or the retry call's `knownVersionIds`
do not match — inspect the actual rendered output and the mock's captured arguments and fix the
component (Step 3's implementation) rather than the test, unless the test itself is factually wrong
about the spec (it is not: "10 added · 2 failed · Try again" and "retry offered only for failed
files" are both direct spec quotes).

- [ ] **Step 7: Fix gaps and re-run until passing**

Run: `cd apps/web && npx vitest run features/projects/bulk-drop-dialog.test.tsx`
Expected: PASS (5 tests total).

- [ ] **Step 8: Commit**

```bash
git add apps/web/features/projects/bulk-drop-dialog.tsx apps/web/features/projects/bulk-drop-dialog.test.tsx
git commit -m "feat(projects): add the bulk-drop confirmation dialog"
```

---

### Task 5: Canvas drop handler, overlay and Shared-view hint

**Files:**
- Modify: `apps/web/features/projects/project-page.tsx:1-37` (imports), `:82-86` (new state),
  `:377-413` (the `.project-canvas` div), `:460-471` (mount `BulkDropDialog`)
- Modify: `apps/web/features/projects/projects.css` (after `.canvas-empty-hint`, line 366)

**Interfaces:**
- Consumes: `BulkDropDialog` (Task 4); the existing `canProduce` (`project-page.tsx:125`), `channel`
  (`:47-52`), `deliverables` and `versions` (`:145`) already computed in this component.
- Produces: no new exports — this task only wires an existing component into an existing page.

- [ ] **Step 1: Add drop state and import `BulkDropDialog`**

In `apps/web/features/projects/project-page.tsx`, add to the import block (after the
`ProjectActionDialog` import at line 24):

```ts
import { BulkDropDialog } from "./bulk-drop-dialog";
```

After the existing `const [format, setFormat] = useState("");` line (line 82), add:

```ts
  const [bulkDropFiles, setBulkDropFiles] = useState<File[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragCount, setDragCount] = useState(0);
  const [switchHint, setSwitchHint] = useState(false);
  useEffect(() => {
    if (!switchHint) return;
    const timer = setTimeout(() => setSwitchHint(false), 4000);
    return () => clearTimeout(timer);
  }, [switchHint]);
```

- [ ] **Step 2: Wrap the canvas pane with the drop handlers and overlay**

Replace the `.project-canvas` div (lines 377-413):

```tsx
                <div
                  className={`project-canvas${dragOver ? " is-dragging-over" : ""}`}
                  ref={setPane}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes("Files")) return;
                    event.preventDefault();
                    if (canProduce && channel === "internal") {
                      event.dataTransfer.dropEffect = "copy";
                      setDragCount(event.dataTransfer.items.length);
                      setDragOver(true);
                    } else {
                      event.dataTransfer.dropEffect = "none";
                    }
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null))
                      setDragOver(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragOver(false);
                    if (!event.dataTransfer.types.includes("Files")) return;
                    if (canProduce && channel === "internal") {
                      const dropped = Array.from(event.dataTransfer.files);
                      if (dropped.length) setBulkDropFiles(dropped);
                    } else if (canProduce && channel === "client") {
                      setSwitchHint(true);
                    }
                  }}
                >
                  <ReactFlow
                    {...canvasNavigation}
                    key={`${channel}:${format}`}
                    nodes={nodes}
                    edges={[]}
                    nodeTypes={nodeTypes}
                    proOptions={{ hideAttribution: true }}
                    nodesConnectable={false}
                    deleteKeyCode={null}
                    defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                    minZoom={0.2}
                    maxZoom={1.5}
                  >
                    <CanvasOpeningView
                      key="opening-view"
                      content={canvasBounds(frames)}
                      view={view}
                      topInset={chromeHeight}
                    />
                    <CanvasBackground key="background" />
                    <ProjectCanvasControls
                      key="controls"
                      content={canvasBounds(frames)}
                      view={view}
                      topInset={chromeHeight}
                    />
                  </ReactFlow>
                  {dragOver && canProduce && channel === "internal" && (
                    <div className="canvas-drop-overlay">
                      <span>{`Drop ${dragCount} image${dragCount === 1 ? "" : "s"} to add them to this project`}</span>
                    </div>
                  )}
                  {switchHint && (
                    <div className="canvas-drop-hint">Switch to Working files to add designs</div>
                  )}
                  {versions.length === 0 && (
                    <div className="canvas-empty-hint">
                      {canProduce
                        ? "Add a version to start shaping your ideas."
                        : "Your studio will share designs here when they’re ready."}
                    </div>
                  )}
                </div>
```

- [ ] **Step 3: Mount `BulkDropDialog`**

In the same file, after the existing `<ProjectActionDialog ... />` block (before the closing
`</div>` at line 472), add:

```tsx
      <BulkDropDialog
        projectId={projectId}
        deliverables={deliverables}
        versions={versions}
        files={bulkDropFiles}
        onClose={() => setBulkDropFiles(null)}
      />
```

`deliverables` and `versions` here are the full, unfiltered arrays already destructured from
`data.data` at line 145 — not `shownDeliverables` — so a drop always matches against every
deliverable in the project regardless of the current format filter.

- [ ] **Step 4: Add the overlay and hint styles**

In `apps/web/features/projects/projects.css`, insert after the `.canvas-empty-hint` rule (line
366):

```css
.project-canvas.is-dragging-over {
  outline: 2px dashed var(--border-strong);
  outline-offset: -12px;
  border-radius: var(--radius-lg);
}
.canvas-drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 5;
}
.canvas-drop-overlay span {
  background: var(--ink);
  color: var(--surface);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius);
  font-size: var(--text-lg);
  font-weight: 600;
}
.canvas-drop-hint {
  position: absolute;
  inset: auto 30px 35%;
  text-align: center;
  color: var(--surface);
  background: var(--ink);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius);
  font-size: var(--text-base);
  pointer-events: none;
  z-index: 6;
}
```

- [ ] **Step 5: Typecheck and run the existing unit suite**

Run: `cd apps/web && npx tsc --noEmit && npx vitest run features/projects`
Expected: PASS — no existing test in `features/projects` exercises `project-page.tsx` directly
(confirmed during research: no `project-page.test.tsx` exists in this codebase; the page is
integration-tested via Playwright), so this step only guards against a type error or a regression
in a sibling file this change did not intend to touch.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/projects/project-page.tsx apps/web/features/projects/projects.css
git commit -m "feat(projects): wire the bulk-drop overlay and dialog into the project canvas"
```

---

### Task 6: Playwright — the spec's browser verification scenario

**Files:**
- Modify: `apps/web/tests/e2e/project-fixture.ts:11-64` (`createProductionFixture`)
- Create: `apps/web/tests/e2e/bulk-image-drop.spec.ts`

**Interfaces:**
- Consumes: `signIn`, `credentials`, `localAgency`, `localAdmin` (`test-support.ts`);
  `createProductionFixture`, `cleanupTestProject` (`project-fixture.ts`).
- Produces: `createProductionFixture(agency: SupabaseClient<Database>, deliverables?:
  FixtureDeliverable[])` — a new optional second parameter, defaulting to today's single square
  deliverable, so all six existing call sites (`design-audit.spec.ts`, `production-workflow.spec.ts`,
  `project-recovery.spec.ts`, `video-designs.spec.ts`, `workspace-actions.spec.ts`,
  `project-creation-cards.spec.ts`) are unaffected.

- [ ] **Step 1: Extend `createProductionFixture` with an optional deliverables list**

In `apps/web/tests/e2e/project-fixture.ts`, replace lines 11-47:

```ts
export type FixtureDeliverable = {
  name: string;
  format: string;
  width: number | null;
  height: number | null;
  quantity?: number;
  scope?: string;
};

const defaultDeliverables: FixtureDeliverable[] = [
  { name: "Campaign square", format: "square", width: 1080, height: 1080, quantity: 1, scope: "original" },
];

export async function createProductionFixture(
  agency: SupabaseClient<Database>,
  deliverables: FixtureDeliverable[] = defaultDeliverables,
) {
  const client = value(await agency.from("clients").select("id").eq("slug", "sabre").single());
  const campaign = value(
    await agency.from("campaigns").select("id").eq("client_id", client.id).limit(1).single(),
  );
  const designer = value(
    await agency
      .from("profiles")
      .select("id")
      .eq("role", "designer")
      .order("display_name")
      .limit(1)
      .single(),
  );
  const briefingId = value(
    await agency.rpc("save_briefing", {
      p_client_id: client.id,
      p_campaign_id: campaign.id,
      p_title: `Acceptance production ${crypto.randomUUID().slice(0, 8)}`,
      p_service_type: "static-ad",
      p_overview:
        "A browser acceptance project for the complete production and client review workflow.",
      p_goals: "Verify durable feedback, private work, fixed snapshots, and delivery.",
      p_direction: { questions: { content: "I’ll provide the content" } },
      p_deliverables: deliverables,
      p_estimated_credits: 4,
    }),
  );
  for (const result of [
    await agency.rpc("submit_briefing", { p_briefing_id: briefingId }),
    await agency.rpc("confirm_briefing_budget", {
      p_briefing_id: briefingId,
      p_credits: 4,
      p_note: "One deliverable with revision and delivery acceptance.",
    }),
  ])
    if (result.error) throw new Error(result.error.message);
  const projectId = value(await agency.rpc("accept_briefing", { p_briefing_id: briefingId }));
  const assignment = await agency.rpc("assign_designer", {
    p_project_id: projectId,
    p_designer_id: designer.id,
  });
  if (assignment.error) throw new Error(assignment.error.message);
  return { projectId, briefingId, clientId: client.id, designerId: designer.id };
}
```

The rest of the file (`cleanupTestProject`) is unchanged.

- [ ] **Step 2: Run the existing suites that use this fixture, to confirm no regression**

Run: `cd apps/web && npx playwright test tests/e2e/production-workflow.spec.ts tests/e2e/project-creation-cards.spec.ts`
Expected: PASS, unchanged — every existing call site omits the second argument, so
`defaultDeliverables` (the same single square deliverable as before) is used.

- [ ] **Step 3: Write the new Playwright spec**

```ts
import { test, expect, type Page } from "@playwright/test";
import { credentials, localAdmin, localAgency, signIn } from "./test-support";
import { cleanupTestProject, createProductionFixture } from "./project-fixture";

function value<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("Fixture step returned no record.");
  return result.data as NonNullable<T>;
}

async function dropImages(
  page: Page,
  target: string,
  specs: { name: string; width: number; height: number }[],
) {
  const dataTransfer = await page.evaluateHandle(async (files) => {
    const transfer = new DataTransfer();
    for (const { name, width, height } of files) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#4b6bfb";
      context.fillRect(0, 0, width, height);
      const blob: Blob = await new Promise((resolve) =>
        canvas.toBlob((result) => resolve(result!), "image/png"),
      );
      transfer.items.add(new File([blob], name, { type: "image/png" }));
    }
    return transfer;
  }, specs);
  const canvas = page.locator(target);
  await canvas.dispatchEvent("dragover", { dataTransfer });
  await canvas.dispatchEvent("drop", { dataTransfer });
}

test.describe("bulk image drop", () => {
  let projectId: string;

  test.afterEach(async () => {
    if (projectId) await cleanupTestProject(projectId);
  });

  test("matches, groups, orders and registers a mixed drop; a shared version defaults to new", async ({
    page,
  }) => {
    const agency = await localAgency();
    const fixture = await createProductionFixture(agency, [
      { name: "Campaign square", format: "square", width: 1080, height: 1080, quantity: 1, scope: "original" },
      { name: "Campaign story", format: "story", width: 1080, height: 1920, quantity: 1, scope: "original" },
    ]);
    projectId = fixture.projectId;

    const deliverables = value(
      await agency.from("deliverables").select("id,name").eq("project_id", projectId),
    );
    const square = deliverables.find((d) => d.name === "Campaign square")!;
    const story = deliverables.find((d) => d.name === "Campaign story")!;

    // Square: an existing, unpublished current version -- the person will choose "current" for it.
    const squareVersionId = value(
      await agency.rpc("create_design_version", { p_deliverable_id: square.id, p_notes: "" }),
    );
    // Story: an existing version already shared with the client -- bulk drop must default to new.
    const storyVersionId = value(
      await agency.rpc("create_design_version", { p_deliverable_id: story.id, p_notes: "" }),
    );
    await agency.rpc("add_design", { p_version_id: storyVersionId, p_title: "Placeholder", p_content: {} });
    await agency.rpc("publish_version", { p_version_id: storyVersionId, p_release_note: "", p_assets: {} });

    await signIn(page, credentials.agency);
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText("Campaign square")).toBeVisible();

    await dropImages(page, ".project-canvas", [
      { name: "square-1.png", width: 1080, height: 1080 },
      { name: "square-2.png", width: 1080, height: 1080 },
      { name: "square-10.png", width: 1080, height: 1080 },
      { name: "story-1.png", width: 1080, height: 1920 },
      { name: "story-2.png", width: 1080, height: 1920 },
      { name: "unmatched.png", width: 800, height: 600 },
    ]);

    await expect(page.getByText("Campaign square", { exact: false })).toBeVisible();
    await expect(page.getByLabelText(/Add to V1/)).toBeChecked();
    await expect(page.getByLabelText(/Create V2/)).toBeChecked();

    await page.getByLabelText("Deliverable for unmatched.png").selectOption(square.id);
    await page.getByRole("button", { name: /Add 6 images/i }).click();

    await expect(page.getByText(/6 added/)).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(
        async () => {
          const rows = value(
            await agency
              .from("designs")
              .select("title")
              .eq("version_id", squareVersionId)
              .order("sort_order"),
          );
          return rows.map((row) => row.title);
        },
        { timeout: 20_000 },
      )
      .toEqual(["square-1", "square-2", "square-10", "unmatched"]);

    const storyVersionTwoId = value(
      await agency
        .from("design_versions")
        .select("id")
        .eq("deliverable_id", story.id)
        .eq("version_number", 2)
        .single(),
    ).id;
    await expect
      .poll(async () => {
        const rows = value(
          await agency
            .from("designs")
            .select("title")
            .eq("version_id", storyVersionTwoId)
            .order("sort_order"),
        );
        return rows.map((row) => row.title);
      })
      .toEqual(["story-1", "story-2"]);

    // The already-shared version was never touched.
    const storyVersionOneDesigns = value(
      await agency.from("designs").select("title").eq("version_id", storyVersionId),
    );
    expect(storyVersionOneDesigns).toHaveLength(1);
  });

  test("a client session has no drop overlay and a drop is swallowed", async ({ page }) => {
    const agency = await localAgency();
    const fixture = await createProductionFixture(agency);
    projectId = fixture.projectId;
    await agency.rpc("submit_design_version", {
      p_version_id: value(
        await agency.rpc("create_design_version", {
          p_deliverable_id: value(
            await agency.from("deliverables").select("id").eq("project_id", projectId).single(),
          ).id,
          p_notes: "",
        }),
      ),
    });

    await signIn(page, credentials.client);
    await page.goto(`/projects/${projectId}`);
    await expect(page.locator(".project-canvas")).toBeVisible();

    await dropImages(page, ".project-canvas", [{ name: "square-1.png", width: 1080, height: 1080 }]);

    await expect(page.locator(".project-canvas.is-dragging-over")).toHaveCount(0);
    await expect(page.getByText(/Drop \d+ images/)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
  });
});
```

- [ ] **Step 4: Run the new spec**

Run: `cd apps/web && npx playwright test tests/e2e/bulk-image-drop.spec.ts`
Expected: PASS. If a selector or label text does not match what Task 4/5 actually rendered, fix the
selector against the real DOM (check with `npx playwright test --debug
tests/e2e/bulk-image-drop.spec.ts`) rather than changing the spec's assertions about order, version
defaults or the client-session guarantee — those are the spec's own Verification bullets.

- [ ] **Step 5: Run the full projects browser suite as a regression check**

Run: `cd apps/web && npx playwright test tests/e2e/project-feedback.spec.ts tests/e2e/production-workflow.spec.ts tests/e2e/project-creation-cards.spec.ts tests/e2e/video-designs.spec.ts`
Expected: PASS, unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/tests/e2e/project-fixture.ts apps/web/tests/e2e/bulk-image-drop.spec.ts
git commit -m "test(e2e): cover bulk image drop matching, ordering, retry defaults and client isolation"
```

---

### Task 7: Documentation

**Files:**
- Modify: `apps/web/features/projects/README.md`
- Create: `docs/verification/bulk-image-drop-2026-09-23.md`

No change is needed to `docs/architecture/data-access.md`, `CLAUDE.md` or `AGENTS.md`: this feature
adds a plain hook and fixes a return-value bug in `project-data.ts` (both ordinary cases already
covered by the existing contract), and it introduces no new Supabase-direct file, no new hook/write
shape, and no new project-wide workflow rule.

- [ ] **Step 1: Add a "Bulk image drop" section to the projects README**

Insert after the existing "Creation cards" section (after line 108, before the "Deviation from the
data-access contract" heading) in `apps/web/features/projects/README.md`:

```markdown
## Bulk image drop

Dropping a bundle of PNG/JPG/WebP files onto the canvas is available only in **Working files**, to
the agency or the assigned designer — the same `canProduce` gate the Add design tile already uses.
`bulk-drop-model.ts` is pure logic: it classifies each file (exact pixel-size match first, then the
same aspect ratio within 1%, otherwise unmatched or a tie), sorts naturally, and builds one plan per
affected deliverable, including the default current-vs-new-version rule. `bulk-drop-upload.ts`
drives the confirmed plan against injected dependencies, capping uploads at three in flight while
keeping each deliverable's `add_design` calls strictly sequential and in natural order — `add_design`
computes `sort_order` as a plain `count(*)` with no row lock
(`supabase/migrations/202609200002_workflows.sql:121`), so concurrent calls on the same version
could otherwise collide. `bulk-drop-dialog.tsx` renders the per-deliverable choice, the unmatched
picker, progress and retry, and is mounted from `project-page.tsx` alongside
`ProjectActionDialog`. Neither `artwork-files.ts` nor `project-action-dialog.tsx` changed for this
feature — only their existing exports (`uploadArtwork`, `discardUnreferencedArtwork`) are called.

`usePublishedVersionNumbers` (`project-data.ts`) answers whether a deliverable's current version is
already shared with the client, which viewing Working files never otherwise fetches. It is
deliberately absent from `projectQueryKeys`: it is only ever active while the bulk-drop dialog is
open, so a fresh mount already refetches it, the same reasoning that keeps `assignments` and
`asset-url` out of that set. A designer session always gets an empty result from it — `publications_read`
grants `published_versions` only to the agency or a client member
(`supabase/migrations/202609200001_foundation.sql:266`), never to a `designer` role — so a designer's
default choice always resolves to the current version even when it is, in fact, already shared. The
person can still choose **Create new version** by hand; this is an accepted consequence of an
existing permission boundary, not something this feature changes.

`createDesignVersion` now returns the created version's id (previously discarded); bulk drop needs
it synchronously to register several designs into the same freshly created version without waiting
on a query refetch.
```

- [ ] **Step 2: Write the verification record**

```markdown
# Bulk image drop — verification record

Date: 2026-09-23

## What this records

Evidence that the three acceptance criteria in
`docs/superpowers/specs/2026-09-23-bulk-image-drop-design.md` are met:

1. One drop adds every accepted image to the right deliverable and version, with no silent
   misplacement; an unmatched image waits for assignment.
2. The person decides current-vs-new version per affected deliverable before anything uploads.
3. A partial failure keeps what succeeded and offers a retry, without orphaned files or empty
   versions.

## Checks executed

- `npm run check` from the repository root — typecheck, eslint, prettier, and the unit suites,
  including `bulk-drop-model.test.ts` (20 cases: natural sort, concurrency, exact/ratio/tie/none
  matching, rejection reasons, title/content derivation, the default-version rule),
  `bulk-drop-upload.test.ts` (10 cases: bounded concurrency, natural-order registration despite
  out-of-order upload completion, single-file isolation on an upload failure and on an `add_design`
  failure, whole-deliverable failure on `create_design_version` failure without affecting other
  deliverables, permission-denied batch stop, cancel), `bulk-drop-dialog.test.tsx` (5 cases: per-deliverable blocks, confirm gating
  on unmatched/tied files, shared-version preselection, an all-rejected drop showing only the
  not-added list, retry scoped to failed files only), and the extended `project-data.test.ts` / new
  `project-published-versions.test.tsx`.
- `npx playwright test tests/e2e/bulk-image-drop.spec.ts` — drops three square images (natural
  order `1, 2, 10`), two story images and one unmatched image against a fixture with two sized
  deliverables; chooses the current version for the square deliverable and confirms the story
  deliverable (whose current version is already published) preselects a new version; verifies the
  `designs` rows land in the expected versions, in the expected order, and that the already-shared
  version is untouched; separately verifies a client session shows no drop overlay and a drop never
  navigates the tab.
- `npx playwright test tests/e2e/project-feedback.spec.ts tests/e2e/production-workflow.spec.ts tests/e2e/project-creation-cards.spec.ts tests/e2e/video-designs.spec.ts`
  — unchanged, confirming the `createProductionFixture` signature change and the canvas drop
  handlers introduced no regression.

## Known, accepted limitation

An assigned designer's session cannot see `published_versions` (RLS restricts it to the agency or a
client member), so the "already shared → default new version" rule always resolves to "current"
for a designer, even when the version is in fact already shared with the client. Documented in
`apps/web/features/projects/README.md`'s "Bulk image drop" section; not fixed here because doing so
would require a policy change, which is out of this spec's scope.
```

Save as `docs/verification/bulk-image-drop-2026-09-23.md`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/features/projects/README.md docs/verification/bulk-image-drop-2026-09-23.md
git commit -m "docs(projects): document bulk image drop and record its verification"
```
