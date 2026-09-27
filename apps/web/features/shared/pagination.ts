/** Keep each PostgREST response below the configured 1,000-row ceiling. */
export const PAGE_SIZE = 500;

/** Keep `in.(...)` filters and Storage signing requests small as a workspace grows. */
export const ID_CHUNK_SIZE = 100;

/** Collect ordered pages, stopping only after a short page (including an empty final page). */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    signal?.throwIfAborted();
    const page = await fetchPage(from, from + PAGE_SIZE - 1);
    signal?.throwIfAborted();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export function chunkItems<T>(items: T[], size = ID_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
}
