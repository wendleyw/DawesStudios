import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Structural-refactor context: `app/globals.css` was split into one stylesheet per feature
// (`apps/web/features/<feature>/<feature>.css`), and every one of those is loaded globally by
// `app/layout.tsx` alongside `globals.css` rather than scoped to its own route. A reviewer pointed
// out that this trades a single deterministic cascade for an import-order one, and that the fix
// the refactor shipped — measuring today's conflict set is empty — is a snapshot, not a property.
// The actual invariant the boundary rule is supposed to guarantee is that no two feature
// stylesheets ever define the same selector, which makes their relative load order irrelevant
// (nothing can conflict if nothing overlaps). This file checks that invariant directly instead of
// trusting that it happens to hold.

const featuresDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const globalsPath = join(featuresDir, "..", "app", "globals.css");

/**
 * A small, deliberately non-general CSS selector-head extractor. It does not need to understand
 * CSS fully — only enough to answer "which selectors does this stylesheet declare":
 *   - strip `/* ... *\/` comments
 *   - take the text immediately before every `{`
 *   - drop anything that starts with `@` (at-rules: `@media`, `@keyframes`, `@theme`, ...) or `--`
 *     (custom-property declarations, which are never selectors)
 *   - split comma-separated selector groups (`.a, .b { ... }`) into their individual heads
 */
function extractSelectorHeads(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const heads: string[] = [];
  const headPattern = /([^{}]+)\{/g;
  let match: RegExpExecArray | null;
  while ((match = headPattern.exec(withoutComments))) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith("@") || raw.startsWith("--")) continue;
    for (const part of raw.split(",")) {
      const selector = part.trim();
      // Keyframe offsets describe animation steps, not competing element selectors.
      if (selector && !/^(from|to|\d+(?:\.\d+)?%)$/.test(selector)) heads.push(selector);
    }
  }
  return heads;
}

function listFeatureStylesheets(): string[] {
  const files: string[] = [];
  for (const feature of readdirSync(featuresDir, { withFileTypes: true })) {
    if (!feature.isDirectory()) continue;
    const featurePath = join(featuresDir, feature.name);
    for (const entry of readdirSync(featurePath, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".css")) {
        files.push(join(featurePath, entry.name));
      }
    }
  }
  return files;
}

function relative(path: string): string {
  return path.replace(`${featuresDir}/`, "");
}

function selectorsByFile(files: string[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const file of files) {
    map.set(file, new Set(extractSelectorHeads(readFileSync(file, "utf8"))));
  }
  return map;
}

/**
 * The only selector `board/board.css` is allowed to share with `app/globals.css`.
 *
 * `board.css` styles a bare `h3` element inside the board's identity header. That is an inherited
 * override of the base heading rule `globals.css` sets for every `h3` in the app (part of the
 * reset/base-element styles that intentionally live in `globals.css`), not a designed shared
 * contract between the two files. It survives only because `board.css` loads after `globals.css`
 * and wins on source order at equal specificity. New entries in this allowlist need the same kind
 * of justification recorded here, not to be appended without one.
 */
const BOARD_GLOBALS_ALLOWLIST = new Set(["h3"]);

/**
 * The only selector `shared/forms.css` is allowed to share with `app/globals.css`.
 *
 * `app/layout.tsx` imports `"./globals.css"` and then `"@/features/shared/forms.css"`, in that
 * order, so wherever the two files define the same selector, `forms.css` wins at equal
 * specificity. `.form-actions` is that one case: both files declare it, and this was an unexamined
 * consequence of splitting `globals.css` rather than a decision anyone made on purpose. It is
 * pinned here rather than left to import order so a change to either file's declaration is a
 * visible, reviewed edit to this allowlist instead of a silent cascade shift.
 */
const FORMS_GLOBALS_ALLOWLIST = new Set([".form-actions"]);

const featureFiles = listFeatureStylesheets();
const globalsCss = readFileSync(globalsPath, "utf8");
const globalSelectors = new Set(extractSelectorHeads(globalsCss));
const featureSelectors = selectorsByFile(featureFiles);

describe("the parser finds a plausible number of selectors", () => {
  it("sees every feature stylesheet and a realistic selector count", () => {
    // 13 feature stylesheets exist at the time this test was written (board and workspace each
    // contribute two files). A count far outside this range would mean the walk or the parser is
    // broken, not that the boundary holds.
    expect(featureFiles.length).toBeGreaterThanOrEqual(10);
    expect(featureFiles.length).toBeLessThanOrEqual(20);

    let distinctAcrossAll = 0;
    for (const [file, selectors] of featureSelectors) {
      expect(
        selectors.size,
        `${relative(file)} should declare at least one selector`,
      ).toBeGreaterThan(0);
      distinctAcrossAll += selectors.size;
    }
    // Measured at 736 across the 13 feature stylesheets when this test was written; allow room to
    // move without allowing the parser to have quietly stopped matching anything.
    expect(distinctAcrossAll).toBeGreaterThan(400);
    expect(distinctAcrossAll).toBeLessThan(1500);

    expect(globalSelectors.size).toBeGreaterThan(50);
  });
});

describe("animation selector extraction", () => {
  it("ignores keyframe offsets while retaining adjacent feature selectors", () => {
    expect(
      extractSelectorHeads(
        "@keyframes slide { from { transform: none; } 50%, to { transform: none; } } .board { display: flex; }",
      ),
    ).toEqual([".board"]);
  });
});

describe("feature stylesheet boundary", () => {
  it("declares no selector in two different feature stylesheets", () => {
    // The refactor's boundary rule is: a namespace with consumers in two or more features stays in
    // globals.css, and everything else moves into exactly one feature stylesheet. If that rule is
    // respected, no selector can appear in more than one feature file. This checks that directly
    // rather than trusting import order to keep two colliding rules from fighting silently.
    const owner = new Map<string, string>();
    const violations: string[] = [];
    for (const [file, selectors] of featureSelectors) {
      for (const selector of selectors) {
        const existing = owner.get(selector);
        if (existing && existing !== file) {
          violations.push(
            `"${selector}" is declared in both ${relative(existing)} and ${relative(file)} — ` +
              `feature stylesheets must not share selectors; move the shared rule into ` +
              `app/globals.css or split it so each file declares a distinct selector.`,
          );
        } else {
          owner.set(selector, file);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("shares only the documented `h3` override between board.css and globals.css", () => {
    const boardFile = featureFiles.find((file) => relative(file) === "board/board.css");
    if (!boardFile) throw new Error("expected features/board/board.css to exist");
    const boardSelectors = featureSelectors.get(boardFile)!;

    const overlap = [...boardSelectors].filter((selector) => globalSelectors.has(selector));
    const unexpected = overlap.filter((selector) => !BOARD_GLOBALS_ALLOWLIST.has(selector));

    expect(
      unexpected,
      unexpected.length
        ? `board/board.css shares undocumented selector(s) with app/globals.css: ${unexpected.join(", ")}. ` +
            `Either remove the duplicate rule or add it to BOARD_GLOBALS_ALLOWLIST with a justification.`
        : undefined,
    ).toEqual([]);
    expect(new Set(overlap)).toEqual(BOARD_GLOBALS_ALLOWLIST);
  });

  it("shares only the documented `.form-actions` rule between shared/forms.css and globals.css", () => {
    const formsFile = featureFiles.find((file) => relative(file) === "shared/forms.css");
    if (!formsFile) throw new Error("expected features/shared/forms.css to exist");
    const formsSelectors = featureSelectors.get(formsFile)!;

    const overlap = [...formsSelectors].filter((selector) => globalSelectors.has(selector));
    const unexpected = overlap.filter((selector) => !FORMS_GLOBALS_ALLOWLIST.has(selector));

    expect(
      unexpected,
      unexpected.length
        ? `shared/forms.css shares undocumented selector(s) with app/globals.css: ${unexpected.join(", ")}. ` +
            `Either remove the duplicate rule or add it to FORMS_GLOBALS_ALLOWLIST with a justification.`
        : undefined,
    ).toEqual([]);
    expect(new Set(overlap)).toEqual(FORMS_GLOBALS_ALLOWLIST);
  });

  it("has no other feature stylesheet sharing any selector with globals.css", () => {
    const exempt = new Set(["board/board.css", "shared/forms.css"]);
    const violations: string[] = [];
    for (const [file, selectors] of featureSelectors) {
      if (exempt.has(relative(file))) continue;
      for (const selector of selectors) {
        if (globalSelectors.has(selector)) {
          violations.push(
            `"${selector}" in ${relative(file)} is also declared in app/globals.css — this ` +
              `selector needs a documented allowlist entry (see BOARD_GLOBALS_ALLOWLIST / ` +
              `FORMS_GLOBALS_ALLOWLIST) or must be removed from one of the two files.`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

/**
 * The checks above compare selectors *across* stylesheets, which is the boundary the design system
 * documents. They are blind to the same selector declared twice inside one file, and that blindness
 * had let six accumulate: `.board-card-meta` and three neighbours in `board.css`,
 * `.brand-color-card code`, and `.briefing-form`.
 *
 * Five were harmless — byte-identical, or disjoint declarations that happened to be written apart.
 * `.board-card-meta` was not: one block set `gap: 12px; margin-bottom: 15px; font-size: xs` and the
 * other `gap: 7px; margin: 0; font-size: sm`, so what the browser applied was a per-property mix of
 * the two that neither author wrote, with a `justify-content` surviving from a card design that no
 * longer exists. Nothing said so, and nothing could have.
 *
 * A duplicate at the same nesting level is always a silent last-wins override. A rule repeated
 * inside `@media` is the opposite — a deliberate responsive override — so only top-level blocks are
 * compared here. Measured before this test existed: 178 selectors looked duplicated, 34 of those
 * were legitimate media-query overrides and the rest were an artefact of not tracking nesting. The
 * real number was six.
 */
function topLevelSelectorCounts(css: string): Map<string, number> {
  const counts = new Map<string, number>();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  let atDepth: number | null = null;
  let head = "";
  for (const character of withoutComments) {
    if (character === "{") {
      const raw = head.trim();
      head = "";
      if (raw.startsWith("@")) {
        if (atDepth === null) atDepth = depth;
      } else if (depth === 0) {
        // Order-insensitive: `a, b` and `b, a` select the same elements and collide the same way.
        const key = raw
          .split(",")
          .map((part) => part.trim().replace(/\s+/g, " "))
          .sort()
          .join(", ");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      head = "";
      if (atDepth !== null && depth <= atDepth) atDepth = null;
    } else {
      head += character;
    }
  }
  return counts;
}

describe("no stylesheet declares the same selector twice at the top level", () => {
  it.each([...featureFiles, globalsPath].map((file) => [relative(file), file]))(
    "%s declares each selector once",
    (_name, file) => {
      const duplicates = [...topLevelSelectorCounts(readFileSync(file, "utf8"))]
        .filter(([, count]) => count > 1)
        .map(([selector, count]) => `${selector} (${count}x)`);
      expect(duplicates, `a later block silently overrides an earlier one`).toEqual([]);
    },
  );
});
