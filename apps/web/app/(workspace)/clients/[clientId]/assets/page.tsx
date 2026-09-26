import { redirect } from "next/navigation";

/** Files moved into the Brand Hub; old links keep their `?project=` or `?campaign=` filter. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ clientId }, search] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search))
    for (const item of [value].flat()) if (item !== undefined) query.append(key, item);
  const suffix = query.size ? `?${query}` : "";
  redirect(`/clients/${clientId}/brand/files${suffix}`);
}
