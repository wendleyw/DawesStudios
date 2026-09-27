import { describe, expect, it, vi } from "vitest";
import { chunkItems, fetchAllPages, PAGE_SIZE } from "./pagination";

describe("fetchAllPages", () => {
  it("collects more than 1,000 rows in their source order", async () => {
    const source = Array.from({ length: 1_201 }, (_, index) => index);
    const fetchPage = vi.fn(async (from: number, to: number) => source.slice(from, to + 1));

    expect(await fetchAllPages(fetchPage)).toEqual(source);
    expect(fetchPage.mock.calls).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
  });

  it("checks an empty page after an exact multiple of the page size", async () => {
    const source = Array.from({ length: PAGE_SIZE * 2 }, (_, index) => index);
    const fetchPage = vi.fn(async (from: number, to: number) => source.slice(from, to + 1));

    expect(await fetchAllPages(fetchPage)).toHaveLength(PAGE_SIZE * 2);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("propagates a later page error without returning partial rows", async () => {
    const fetchPage = vi.fn(async (from: number) => {
      if (from) throw new Error("second page failed");
      return Array.from({ length: PAGE_SIZE }, (_, index) => index);
    });

    await expect(fetchAllPages(fetchPage)).rejects.toThrow("second page failed");
  });

  it("stops before the next page when the query is aborted", async () => {
    const controller = new AbortController();
    const fetchPage = vi.fn(async () => {
      controller.abort();
      return Array.from({ length: PAGE_SIZE }, (_, index) => index);
    });

    await expect(fetchAllPages(fetchPage, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("rejects cancellation while the final short page resolves", async () => {
    const controller = new AbortController();
    await expect(
      fetchAllPages(async () => {
        controller.abort();
        return [1];
      }, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("chunkItems", () => {
  it("keeps each ID filter within the chunk size, preserving order", () => {
    const ids = Array.from({ length: 205 }, (_, index) => `project-${index}`);
    const chunks = chunkItems(ids);

    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 5]);
    expect(chunks.flat()).toEqual(ids);
  });
});
