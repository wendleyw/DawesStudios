import { describe, expect, it, vi } from "vitest";
import { copyImageToClipboard } from "./album-clipboard";

describe("copyImageToClipboard", () => {
  const png = new Blob(["png"], { type: "image/png" });

  it("writes one PNG item whose data comes from the download", async () => {
    let captured: Record<string, Promise<Blob>> | undefined;
    const write = vi.fn(async () => {
      await captured?.["image/png"];
    });
    await copyImageToClipboard(async () => png, {
      write,
      createItem: (data) => {
        captured = data;
        return data as unknown as ClipboardItem;
      },
      convert: async (blob) => blob,
    });
    expect(write).toHaveBeenCalledTimes(1);
    await expect(captured?.["image/png"]).resolves.toBe(png);
  });

  it("converts non-PNG images", async () => {
    const convert = vi.fn(async () => png);
    let captured: Record<string, Promise<Blob>> | undefined;
    await copyImageToClipboard(async () => new Blob(["jpg"], { type: "image/jpeg" }), {
      write: async () => {
        await captured?.["image/png"];
      },
      createItem: (data) => ((captured = data), data as unknown as ClipboardItem),
      convert,
    });
    expect(convert).toHaveBeenCalledTimes(1);
  });

  it("rejects when the browser cannot write images", async () => {
    await expect(
      copyImageToClipboard(async () => png, { write: undefined, createItem: undefined }),
    ).rejects.toThrow("Image copying is not supported in this browser.");
  });

  it("rejects when the download fails", async () => {
    let captured: Record<string, Promise<Blob>> | undefined;
    await expect(
      copyImageToClipboard(
        async () => {
          throw new Error("offline");
        },
        {
          write: async () => {
            await captured?.["image/png"];
          },
          createItem: (data) => ((captured = data), data as unknown as ClipboardItem),
          convert: async (blob) => blob,
        },
      ),
    ).rejects.toThrow("offline");
  });
});
