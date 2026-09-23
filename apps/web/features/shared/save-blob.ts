/**
 * Handing a blob to the viewer's disk.
 *
 * Four features had their own copy of the same five steps — create an object URL, build an
 * anchor, set `href` and `download`, click it, revoke the URL on a timer. Two of them also
 * sanitised the filename with the same character class but substituted different replacement
 * characters, and a third omitted the rule entirely on a name that came straight from a
 * user-supplied upload. Nothing in any of them explained the difference, so there is one rule
 * here and the callers no longer choose.
 */

/**
 * The characters a filename may not carry: the Windows reserved set plus the C0 controls, which
 * between them cover every platform the app is downloaded on. `/` is in the set, so a name can
 * never escape the folder the browser saves into.
 */
const unsafeFilenameCharacters = /[<>:"/\\|?*\u0000-\u001f]/g;

/** A filename the browser and the filesystem will both accept. */
function safeFilename(name: string): string {
  return name.replace(unsafeFilenameCharacters, "_");
}

export function saveBlob(
  blob: Blob,
  filename: string,
  /**
   * How long to keep the object URL alive after the click. One second is enough for every
   * browser to have started the download, and is what three of the four call sites used. The
   * brand asset list asks for thirty, which nothing in its history explains — it is preserved as
   * an argument rather than folded away, so shortening it stays a decision someone makes on
   * purpose.
   */
  { revokeAfterMs = 1000 }: { revokeAfterMs?: number } = {},
): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename(filename);
  // Attached to the document before the click: some browsers ignore a click on a detached anchor.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
}
