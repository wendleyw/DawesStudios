import { z } from "@/lib/zod";

/** The database refuses a thirteenth competitor with the same number. */
export const MAX_COMPETITORS = 12;

export type Competitor = {
  id: string;
  client_id: string;
  name: string;
  website: string | null;
  meta_page_id: string | null;
  google_advertiser_id: string | null;
  tiktok_advertiser: string | null;
};

export type CompetitorInput = {
  name: string;
  website: string | null;
  metaPageId: string | null;
  googleAdvertiserId: string | null;
  tiktokAdvertiser: string | null;
};

export type CompetitorForm = {
  name: string;
  website: string;
  metaPageId: string;
  googleAdvertiserId: string;
  tiktokAdvertiser: string;
};

type CompetitorLinkFields = Pick<
  Competitor,
  "name" | "website" | "meta_page_id" | "google_advertiser_id" | "tiktok_advertiser"
>;

const blankToNull = (value: string) => (value === "" ? null : value);

function isWebsite(value: string) {
  if (/\s/.test(value)) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// Mirrors the database's check constraints, so the form explains a refusal before the write.
const competitorFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Add the competitor's name.")
    .max(80, "Keep the name to 80 characters."),
  website: z
    .string()
    .trim()
    .max(200, "Keep the website to 200 characters.")
    .refine(
      (value) => value === "" || isWebsite(value),
      "Enter a website that starts with http:// or https://.",
    )
    .transform(blankToNull),
  metaPageId: z
    .string()
    .trim()
    .regex(/^(\d{1,20})?$/, "A Facebook Page ID is only digits.")
    .transform(blankToNull),
  googleAdvertiserId: z
    .string()
    .trim()
    .regex(/^(AR\d{10,30})?$/, "A Google advertiser ID starts with AR, followed by digits.")
    .transform(blankToNull),
  tiktokAdvertiser: z
    .string()
    .trim()
    .max(80, "Keep the TikTok name to 80 characters.")
    .transform(blankToNull),
});

/** The first problem, worded for the form, or the input the data layer writes. */
export function parseCompetitorForm(
  form: CompetitorForm,
): { input: CompetitorInput } | { error: string } {
  const result = competitorFormSchema.safeParse(form);
  if (!result.success)
    return { error: result.error.issues[0]?.message ?? "Check the competitor's details." };
  return { input: result.data };
}

export type LibraryLinks = { meta: string; tiktok: string; google: string };

/** One link per official library, already filtered to the competitor. */
export function libraryLinks(competitor: CompetitorLinkFields): LibraryLinks {
  const meta = new URL("https://www.facebook.com/ads/library/");
  meta.search = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: "ALL",
    media_type: "all",
    ...(competitor.meta_page_id
      ? { search_type: "page", view_all_page_id: competitor.meta_page_id }
      : { search_type: "keyword_unordered", q: competitor.name }),
  }).toString();
  const tiktok = new URL("https://library.tiktok.com/ads");
  tiktok.search = new URLSearchParams({
    region: "all",
    adv_name: competitor.tiktok_advertiser ?? competitor.name,
  }).toString();
  const host = websiteHost(competitor.website);
  const google = new URL(
    competitor.google_advertiser_id
      ? `https://adstransparency.google.com/advertiser/${competitor.google_advertiser_id}`
      : "https://adstransparency.google.com/",
  );
  google.search = new URLSearchParams({
    region: "anywhere",
    ...(!competitor.google_advertiser_id && host ? { domain: host } : {}),
  }).toString();
  return { meta: meta.toString(), tiktok: tiktok.toString(), google: google.toString() };
}

export function websiteHost(website: string | null): string | null {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The sources whose link lands on this competitor exactly; TikTok's library searches by name. */
export function matchedSources(competitor: CompetitorLinkFields): ("Meta" | "TikTok" | "Google")[] {
  return [
    ...(competitor.meta_page_id ? (["Meta"] as const) : []),
    "TikTok",
    ...(competitor.google_advertiser_id || websiteHost(competitor.website)
      ? (["Google"] as const)
      : []),
  ];
}

/** The database's refusal, in the person's words where it has a better name for it. */
export function competitorWriteMessage(error: Error, name: string): string {
  if (error.message.includes("competitors_client_name_key"))
    return `This client already follows ${name}.`;
  return error.message;
}
