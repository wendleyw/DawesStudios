import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const globals = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../app/globals.css"),
  "utf8",
);

// A two-finger sideways swipe over a canvas's floating cards, toolbar or zoom pill is not consumed
// by xyflow, so the browser used to read it as Back and leave the board mid-pan.
describe("canvas trackpad navigation", () => {
  it("turns off swipe-back only on pages that contain a canvas", () => {
    expect(globals).toMatch(
      /html:has\(\.react-flow\),\s*html:has\(\.react-flow\) body\s*\{\s*overscroll-behavior-x: none;/,
    );
    expect(globals).not.toMatch(/(^|\n)(html|body)\s*\{[^}]*overscroll-behavior-x: none/);
  });
});
