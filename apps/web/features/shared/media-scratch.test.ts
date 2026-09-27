import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// PDF rasterization needs disk-backed scratch space even though video processing was retired.
// This checks the mount contract; host capacity is verified separately during deployment.

const composePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "compose.yaml",
);

function mediaServiceBlock(): string {
  const compose = readFileSync(composePath, "utf8");
  // The media service block runs from its own `  media:` heading to the next top-level
  // (2-space-indented) service or section heading.
  const match = compose.match(/\n {2}media:\n([\s\S]*?)(?=\n {2}\S|\n\S|$)/);
  if (!match) throw new Error("compose.yaml has no `media` service to check");
  return match[1];
}

describe("the media service's scratch space is disk, not RAM", () => {
  it("mounts a named volume rather than sizing /tmp for video-sized writes", () => {
    const block = mediaServiceBlock();
    // Incidental /tmp writes stay within a small, explicit RAM budget.
    const tmpfsSize = block.match(/\/tmp:[^\n]*size=(\d+)([mMgG])/);
    expect(tmpfsSize, "media service should still declare a small /tmp tmpfs").not.toBeNull();
    const [, amount, unit] = tmpfsSize!;
    const tmpfsBytes = Number(amount) * (unit.toLowerCase() === "g" ? 1024 ** 3 : 1024 ** 2);
    expect(tmpfsBytes).toBeLessThanOrEqual(16 * 1024 * 1024);

    // The real scratch space is a `volumes:` mount, i.e. disk on the Docker host — never another
    // `tmpfs:` entry, which would just be the same RAM-backed mistake at a different size.
    expect(block).toMatch(/volumes:\s*\n\s*-\s*media-scratch:(\S+)/);
    const target = block.match(/volumes:\s*\n\s*-\s*media-scratch:(\S+)/)?.[1];
    expect(target).toBeTruthy();

    // `TMPDIR` is what actually redirects `os.tmpdir()` (Node checks it before falling back to
    // `/tmp`), so every `mkdtemp(tmpdir())` call in `apps/media/src` lands on the volume above,
    // not on the small tmpfs declared for anything else that still hardcodes `/tmp`.
    const tmpdirVar = block.match(/TMPDIR:\s*(\S+)/)?.[1];
    expect(tmpdirVar).toBe(target);
  });

  it("keeps read_only hardening on the media service alongside the new mount", () => {
    // The scratch fix must not have loosened the container hardening it was layered onto: a
    // writable scratch volume is the one exception, not a reason to drop `read_only`.
    const block = mediaServiceBlock();
    expect(block).toMatch(/read_only:\s*true/);
    expect(block).toMatch(/cap_drop:\s*\[ALL\]/);
  });
});
