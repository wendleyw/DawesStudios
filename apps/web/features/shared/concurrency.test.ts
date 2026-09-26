import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

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

  it("never starts more workers than there are items", async () => {
    let concurrent = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2], 5, async (item) => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 5));
      concurrent--;
      return item;
    });
    expect(peak).toBe(2);
  });

  it("propagates a run failure through the returned promise, exactly like a hand-rolled Promise.all worker loop", async () => {
    const seen: number[] = [];
    await expect(
      mapWithConcurrency([1, 2, 3], 3, async (item) => {
        seen.push(item);
        if (item === 2) throw new Error("item 2 failed");
        return item;
      }),
    ).rejects.toThrow("item 2 failed");
    expect(seen).toContain(2);
  });
});
