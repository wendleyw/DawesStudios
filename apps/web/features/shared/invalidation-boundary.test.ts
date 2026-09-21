import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative as relativeTo } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assetQueryKeys } from "@/features/assets/asset-data";
import { brandQueryKeys } from "@/features/brand/brand-data";
import { briefingQueryKeys } from "@/features/briefings/briefing-data";
import { workspaceQueryKeys, notificationsQueryKeys } from "@/features/workspace/workspace-data";

// Structural-refactor context: the refactor put every Supabase *read* behind a feature data module,
// but left the *writes* addressing the cache by hand — every mutation's `onSuccess` spelled its
// query keys out as string literals. Knowing where a query lives matters less than knowing what a
// write dirties, so the keys a write invalidates are now declared once, in the owning feature's
// data module, and composed at the call site.
//
// The property that makes that worth having is that no invalidation set may silently widen: a
// mutation that refetches two caches today must refetch exactly those two tomorrow. A widened set
// is invisible to every other check in this repo — types, lint and the unit tests all stay green
// while the UI quietly refetches more than it used to. These tests check the structural half of
// that guarantee: that key strings are not re-hardcoded at call sites, that the one blunt
// whole-cache clear stays the only one, that the realtime fan-out set is pinned, and that the key
// constants themselves still name the keys their call sites were measured against.

const featuresDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function listFeatureSources(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(path);
    }
  };
  walk(featuresDir);
  return files.sort();
}

function relative(path: string): string {
  return relativeTo(featuresDir, path);
}

/** Comments carry key names as prose; only executable text is evidence of what a call invalidates. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\n"'`]*\/\/[^\n]*/gm, "");
}

const callSites = listFeatureSources().filter((path) => !path.endsWith("-data.ts"));

describe("invalidation authority", () => {
  /*
   * The deliberate exceptions, each one a case where composing from the owner's exported set would
   * change what gets refetched:
   *
   * - `briefings/briefing-detail.tsx` — accepting a briefing invalidates `credit-account` and
   *   `credit-ledger`. `credits/credit-data.ts` exports those keys only as part of `creditQueryKeys`,
   *   which also covers `credit-requests` and `notifications`. Routing through `useInvalidateCredits()`
   *   would widen this call site, so the two keys stay explicit. The reasoning is recorded at both the
   *   call site and above `creditQueryKeys`.
   */
  const allowedLiteralKeys = new Map<string, string[]>([
    ["briefings/briefing-detail.tsx", ["credit-account", "credit-ledger"]],
  ]);

  it("composes every call-site query key from an exported constant", () => {
    const offenders: string[] = [];
    for (const path of callSites) {
      const source = stripComments(readFileSync(path, "utf8"));
      const pattern = /invalidateQueries\(\{\s*queryKey:\s*\[([^\]]*)\]/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source))) {
        const token = match[1].trim();
        const literal = /^["'](.+)["']$/.exec(token);
        if (!literal) continue;
        if (allowedLiteralKeys.get(relative(path))?.includes(literal[1])) continue;
        offenders.push(`${relative(path)} invalidates the literal key ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps every allowed literal key still present at the call site that claims it", () => {
    // The allowlist above is a statement about today's code, not a licence. If one of these call
    // sites is later routed through a constant, the entry must go with it rather than linger and
    // quietly re-permit a hardcoded key.
    for (const [file, keys] of allowedLiteralKeys) {
      const source = stripComments(readFileSync(join(featuresDir, file), "utf8"));
      for (const key of keys) expect(source).toContain(`queryKey: ["${key}"]`);
    }
  });

  it("keeps the whole-cache clear confined to invitation acceptance", () => {
    // `settings/invitation-acceptance.tsx` invalidates the entire cache with no key at all, because
    // accepting an invitation changes who the viewer is and every cached answer was computed for
    // the previous identity. It is blunt and it is pre-existing; scoping it would change what gets
    // refetched. This pins it as the only one, so a second keyless clear cannot appear unnoticed.
    const clearing = callSites.filter((path) =>
      /invalidateQueries\(\s*\)/.test(stripComments(readFileSync(path, "utf8"))),
    );
    expect(clearing.map(relative)).toEqual(["settings/invitation-acceptance.tsx"]);
  });

  it("pins the realtime fan-out in project-events.ts", () => {
    // This is the one invalidation in the codebase that is neither a feature's own set nor a subset
    // composed from one: a realtime notice refreshes five keys owned by four different features
    // (`projects` is workspace's, `assets` is assets', `reviews` is reviews', and `project-detail`
    // and `comments` are projects'). It matches no exported set — `projectQueryKeys` covers
    // `notifications` that this does not, and omits `reviews` and `assets` that it does — so there
    // is no non-widening constant to route it through today. It is pinned here instead, so a change
    // to what a realtime notice refreshes has to be made deliberately.
    const source = readFileSync(join(featuresDir, "projects", "project-events.ts"), "utf8");
    const keys = /for \(const key of \[([^\]]*)\]\)/.exec(source);
    expect(keys?.[1].match(/"[^"]+"/g)).toEqual([
      '"project-detail"',
      '"projects"',
      '"comments"',
      '"reviews"',
      '"assets"',
    ]);
  });
});

describe("query key ownership", () => {
  /*
   * These are the key strings every call site in `brand`, `briefings` and `assets` was measured
   * against before the writes were put on the contract. They are asserted by value rather than
   * merely referenced, because renaming one is how a call site silently starts invalidating a cache
   * entry nothing reads — or stops invalidating one something does.
   */
  it("names brand's four write-dirtied keys", () => {
    expect(brandQueryKeys).toEqual({
      sections: "brand-sections",
      assets: "brand-assets",
      templateDrafts: "template-drafts",
      templateDraft: "template-draft",
    });
  });

  it("names briefings' three write-dirtied keys, including the one brand invalidates", () => {
    // `briefing-brand` belongs to this record, not brand's, because `useBriefingBrand` is the only
    // hook that reads it. `brand/section-editor.tsx` composes from here for that reason.
    expect(briefingQueryKeys).toEqual({
      briefings: "briefings",
      attachments: "briefing-attachments",
      brand: "briefing-brand",
    });
  });

  it("keeps assets a single key, which is what makes its aggregate helper non-widening", () => {
    // `useInvalidateAssets()` exists only because this set has one member and both of its call
    // sites already invalidated exactly that one. A second key here would widen both of them.
    expect(assetQueryKeys).toEqual(["assets"]);
  });

  it("pins workspace's keys, so a widened set does not widen every call site", () => {
    // `useInvalidateWorkspace()` routes through a single constant. If someone adds a key here,
    // every call site that uses that helper silently invalidates more than it did before, without
    // test coverage. This pins the set so a change is caught and each affected call site
    // (`board/board-page.tsx`) can be checked for intent.
    expect(workspaceQueryKeys).toEqual(["projects"]);
  });

  it("pins notifications' keys, so a widened set does not widen every call site", () => {
    // `useInvalidateNotifications()` routes through a single constant. If someone adds a key here,
    // every call site that uses that helper silently invalidates more than it did before, without
    // test coverage. This pins the set so a change is caught and each affected call site
    // (`briefings/briefing-editor-form.tsx`) can be checked for intent.
    expect(notificationsQueryKeys).toEqual(["notifications"]);
  });
});
