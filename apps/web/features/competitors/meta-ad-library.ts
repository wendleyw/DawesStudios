import { z } from "@/lib/zod";

/**
 * Meta's official Ad Library API (`ads_archive`), used only on the server by the competitor ads
 * route. The token travels only in the request this module builds; nothing it returns carries it,
 * and `ad_snapshot_url` — which needs the token to load — is never requested.
 */
export const META_GRAPH_VERSION = "v26.0";

const FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_creative_link_descriptions",
  "ad_creative_link_captions",
  "ad_delivery_start_time",
  "publisher_platforms",
].join(",");

export type CompetitorAd = {
  id: string;
  pageName: string;
  platforms: string[];
  body: string | null;
  title: string | null;
  description: string | null;
  caption: string | null;
  startedOn: string | null;
  libraryUrl: string;
};

export type CompetitorAdsResult =
  { status: "ready"; ads: CompetitorAd[]; fetchedAt: string } | { status: "not_configured" };

/** `META_AD_LIBRARY_COUNTRIES` as ISO codes; every country (`ALL`) when unset or unreadable. */
export function adLibraryCountries(value: string | undefined): string[] {
  const codes = (value ?? "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^(ALL|[A-Z]{2})$/.test(code));
  return codes.length ? codes : ["ALL"];
}

export function adsArchiveUrl(input: {
  token: string;
  pageId: string | null;
  name: string;
  countries: string[];
}): URL {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/ads_archive`);
  // The page ID is digits (checked by the database), so it is safe inside the array literal.
  if (input.pageId) url.searchParams.set("search_page_ids", `[${input.pageId}]`);
  else url.searchParams.set("search_terms", input.name);
  url.searchParams.set("ad_reached_countries", JSON.stringify(input.countries));
  url.searchParams.set("ad_active_status", "ACTIVE");
  url.searchParams.set("ad_type", "ALL");
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("limit", "25");
  url.searchParams.set("access_token", input.token);
  return url;
}

const archiveSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().regex(/^\d{1,30}$/),
      page_name: z.string().optional(),
      publisher_platforms: z.array(z.string()).optional(),
      ad_creative_bodies: z.array(z.string()).optional(),
      ad_creative_link_titles: z.array(z.string()).optional(),
      ad_creative_link_descriptions: z.array(z.string()).optional(),
      ad_creative_link_captions: z.array(z.string()).optional(),
      ad_delivery_start_time: z.string().optional(),
    }),
  ),
});

const platformNames: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  threads: "Threads",
};

const firstText = (values: string[] | undefined) =>
  values?.map((value) => value.trim()).find(Boolean) ?? null;

/** The ads the screen shows, or null when Meta's answer is not the documented shape. */
export function parseAdsArchive(json: unknown): CompetitorAd[] | null {
  const parsed = archiveSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data.data.map((ad) => ({
    id: ad.id,
    pageName: ad.page_name?.trim() ?? "",
    platforms: (ad.publisher_platforms ?? []).map(
      (platform) => platformNames[platform.toLowerCase()] ?? platform,
    ),
    body: firstText(ad.ad_creative_bodies),
    title: firstText(ad.ad_creative_link_titles),
    description: firstText(ad.ad_creative_link_descriptions),
    caption: firstText(ad.ad_creative_link_captions),
    startedOn: /^\d{4}-\d{2}-\d{2}/.test(ad.ad_delivery_start_time ?? "")
      ? ad.ad_delivery_start_time!.slice(0, 10)
      : null,
    libraryUrl: `https://www.facebook.com/ads/library/?id=${ad.id}`,
  }));
}

const errorSchema = z.object({
  error: z.object({ code: z.number().optional(), error_subcode: z.number().optional() }),
});

/** Meta's refusal in the person's words. Meta's own message is never passed on. */
export function metaErrorMessage(json: unknown): string {
  const parsed = errorSchema.safeParse(json);
  const code = parsed.success ? parsed.data.error.code : undefined;
  const subcode = parsed.success ? parsed.data.error.error_subcode : undefined;
  if (code === 190)
    return "The Meta Ad Library token has expired or was revoked. Renew it on the server.";
  if (code === 4 || code === 17 || code === 613 || code === 80004)
    return "Meta is limiting requests right now. Try again in a few minutes.";
  if (
    code === 10 ||
    subcode === 2332002 ||
    code === 2332002 ||
    (code !== undefined && code >= 200 && code < 300)
  )
    return "Meta has not approved this token for the Ad Library API.";
  if (code === 100)
    return "Meta refused the search. Check the server's Ad Library countries setting.";
  return "Meta could not return ads right now. Try again.";
}

export type ResultCache<T> = { get(key: string): T | undefined; set(key: string, value: T): void };

/** A small per-process cache, so repeated opens of one competitor do not spend the token's limit. */
export function createResultCache<T>(options: {
  ttlMs: number;
  max: number;
  now?: () => number;
}): ResultCache<T> {
  const entries = new Map<string, { expires: number; value: T }>();
  const now = options.now ?? Date.now;
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { expires: now() + options.ttlMs, value });
      while (entries.size > options.max) entries.delete(entries.keys().next().value!);
    },
  };
}
