/**
 * Copying an album image for pasting into Miro. The clipboard item is created inside the click
 * with a promise for its PNG, which keeps the user activation that Safari and Chromium require
 * while the download is still running.
 */
export type ClipboardEnvironment = {
  write?: (items: ClipboardItem[]) => Promise<void>;
  createItem?: (data: Record<string, Promise<Blob>>) => ClipboardItem;
  convert?: (blob: Blob) => Promise<Blob>;
};

export async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (png) => (png ? resolve(png) : reject(new Error("The image could not be converted."))),
      "image/png",
    ),
  );
}

function browserEnvironment(): ClipboardEnvironment {
  return {
    write:
      typeof navigator !== "undefined" && navigator.clipboard?.write
        ? (items) => navigator.clipboard.write(items)
        : undefined,
    createItem:
      typeof ClipboardItem !== "undefined" ? (data) => new ClipboardItem(data) : undefined,
    convert: toPng,
  };
}

export function copyImageToClipboard(
  download: () => Promise<Blob>,
  environment: ClipboardEnvironment = browserEnvironment(),
): Promise<void> {
  const { write, createItem, convert = toPng } = environment;
  if (!write || !createItem)
    return Promise.reject(new Error("Image copying is not supported in this browser."));
  const png = download().then(convert);
  return write([createItem({ "image/png": png })]);
}
