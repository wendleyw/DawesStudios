/**
 * Runs `run` over `items`, never more than `limit` at once, resolving to results in the same order
 * as `items` regardless of which one finishes first. Playground drop uploads and album-copy
 * downloads share this worker loop.
 *
 * A rejection from `run` propagates immediately through the returned promise, exactly as
 * `Promise.all` would for a hand-rolled loop of this same shape: the other in-flight workers keep
 * running, but the caller sees only the first rejection. A caller that must isolate one item's
 * failure from the rest (see `copyAlbumFilesToBoard` in `playground/playground-albums.ts`) catches
 * inside its own `run` and resolves instead of rejecting.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
