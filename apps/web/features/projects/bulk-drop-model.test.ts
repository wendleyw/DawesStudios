import { describe, expect, it, vi } from "vitest";
import {
  buildDeliverablePlans,
  buildDesignContent,
  classifyFiles,
  deriveDesignTitle,
  latestVersionPerDeliverable,
  mapWithConcurrency,
  matchDeliverable,
  naturalCompare,
  type BulkDropDeliverable,
} from "./bulk-drop-model";

const ARTWORK_MAX_BYTES_FOR_TEST = 1024 * 1024;

function file(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

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
    // A real, short timeout rather than manually released gates: with five items and a limit of
    // three, a fixed delay measures the same peak deterministically without gate bookkeeping.
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
    const results = await mapWithConcurrency(
      delays,
      3,
      (ms, index) => new Promise<number>((resolve) => setTimeout(() => resolve(index), ms)),
    );
    expect(results).toEqual([0, 1, 2]);
  });
});

const square: BulkDropDeliverable = {
  id: "d-square",
  name: "Campaign square",
  width: 1080,
  height: 1080,
};
const story: BulkDropDeliverable = {
  id: "d-story",
  name: "Campaign story",
  width: 1080,
  height: 1920,
};
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
    // 1090x1090 keeps a 1:1 ratio at a different pixel size.
    expect(matchDeliverable({ width: 1090, height: 1090 }, deliverables)).toEqual({
      kind: "ratio",
      deliverableId: "d-square",
    });
  });

  it("accepts a ratio just inside 1% and refuses one just outside it", () => {
    // 1080x1929 is 0.47% off the story's 0.5625 ratio; 1080x1950 is 1.5% off.
    expect(matchDeliverable({ width: 1080, height: 1929 }, deliverables)).toEqual({
      kind: "ratio",
      deliverableId: "d-story",
    });
    expect(matchDeliverable({ width: 1080, height: 1950 }, deliverables)).toEqual({ kind: "none" });
  });

  it("reports a tie when two deliverables match equally", () => {
    const twin: BulkDropDeliverable = {
      id: "d-twin",
      name: "Also square",
      width: 1080,
      height: 1080,
    };
    const result = matchDeliverable({ width: 1080, height: 1080 }, [square, twin]);
    expect(result.kind).toBe("tie");
    if (result.kind === "tie")
      expect(result.candidateDeliverableIds.sort()).toEqual(["d-square", "d-twin"]);
  });

  it("prefers the exact size over a same-ratio deliverable of another size", () => {
    const large: BulkDropDeliverable = { id: "d-large", name: "Large", width: 2160, height: 2160 };
    expect(matchDeliverable({ width: 2160, height: 2160 }, [square, large])).toEqual({
      kind: "exact",
      deliverableId: "d-large",
    });
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
    const result = await classifyFiles(
      files,
      deliverables,
      readDimensions,
      ARTWORK_MAX_BYTES_FOR_TEST,
    );
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

  it("never reads the pixels of a file it already rejected", async () => {
    const reader = vi.fn(async () => ({ width: 1080, height: 1080 }));
    await classifyFiles(
      [
        file("clip.mp4", "video/mp4"),
        file("huge.png", "image/png", ARTWORK_MAX_BYTES_FOR_TEST + 1),
      ],
      deliverables,
      reader,
      ARTWORK_MAX_BYTES_FOR_TEST,
    );
    expect(reader).not.toHaveBeenCalled();
  });
});

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
      { id: "v2", deliverableId: "d-square", number: 2 },
      { id: "v1", deliverableId: "d-square", number: 1 },
      { id: "v3", deliverableId: "d-story", number: 1 },
    ];
    expect(latestVersionPerDeliverable(versions)).toEqual([
      { deliverableId: "d-square", versionId: "v2", number: 2 },
      { deliverableId: "d-story", versionId: "v3", number: 1 },
    ]);
  });
});

describe("buildDeliverablePlans", () => {
  const f = (name: string) => new File([], name, { type: "image/png" });

  it("defaults to the current version when it is not shared with the client", () => {
    const currentVersions = [{ deliverableId: "d-square", versionId: "v1", number: 1 }];
    const plans = buildDeliverablePlans(
      [
        { file: f("square-10.png"), deliverableId: "d-square" },
        { file: f("square-2.png"), deliverableId: "d-square" },
        { file: f("square-1.png"), deliverableId: "d-square" },
      ],
      deliverables,
      currentVersions,
      () => false,
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].defaultChoice).toBe("current");
    expect(plans[0].askChoice).toBe(true);
    expect(plans[0].currentVersion).toEqual(currentVersions[0]);
    expect(plans[0].files.map((file) => file.name)).toEqual([
      "square-1.png",
      "square-2.png",
      "square-10.png",
    ]);
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
