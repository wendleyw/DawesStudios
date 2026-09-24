import { describe, expect, it } from "vitest";
import {
  adLibraryCountries,
  adsArchiveUrl,
  createResultCache,
  metaErrorMessage,
  parseAdsArchive,
} from "./meta-ad-library";

describe("adLibraryCountries", () => {
  it("reads country codes and falls back to every country", () => {
    expect(adLibraryCountries(undefined)).toEqual(["ALL"]);
    expect(adLibraryCountries("")).toEqual(["ALL"]);
    expect(adLibraryCountries(" br, us ")).toEqual(["BR", "US"]);
    expect(adLibraryCountries("xx1, ,DE")).toEqual(["DE"]);
  });
});

describe("adsArchiveUrl", () => {
  it("asks for a page's active ads with a fixed field list and never the snapshot URL", () => {
    const url = adsArchiveUrl({
      token: "secret",
      pageId: "123456789",
      name: "Rival Co",
      countries: ["ALL"],
    });
    expect(url.origin).toBe("https://graph.facebook.com");
    expect(url.pathname).toBe("/v26.0/ads_archive");
    expect(url.searchParams.get("search_page_ids")).toBe("[123456789]");
    expect(url.searchParams.has("search_terms")).toBe(false);
    expect(url.searchParams.get("ad_reached_countries")).toBe('["ALL"]');
    expect(url.searchParams.get("ad_active_status")).toBe("ACTIVE");
    expect(url.searchParams.get("ad_type")).toBe("ALL");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("access_token")).toBe("secret");
    expect(url.searchParams.get("fields")).not.toContain("ad_snapshot_url");
  });

  it("searches by name when the competitor has no page ID", () => {
    const url = adsArchiveUrl({
      token: "secret",
      pageId: null,
      name: "Café & Co",
      countries: ["BR", "US"],
    });
    expect(url.searchParams.get("search_terms")).toBe("Café & Co");
    expect(url.searchParams.has("search_page_ids")).toBe(false);
    expect(url.searchParams.get("ad_reached_countries")).toBe('["BR","US"]');
  });
});

describe("parseAdsArchive", () => {
  it("maps each ad to what the screen shows, with a public Ad Library link", () => {
    expect(
      parseAdsArchive({
        data: [
          {
            id: "111",
            page_name: "Rival Co",
            publisher_platforms: ["facebook", "INSTAGRAM"],
            ad_creative_bodies: ["  ", "Autumn sale"],
            ad_creative_link_titles: ["Shop now"],
            ad_creative_link_descriptions: ["Free delivery"],
            ad_creative_link_captions: ["rival.example"],
            ad_delivery_start_time: "2026-09-03T07:00:00+0000",
            ad_snapshot_url:
              "https://www.facebook.com/ads/archive/render_ad/?id=111&access_token=secret",
          },
        ],
        paging: { cursors: { after: "x" } },
      }),
    ).toEqual([
      {
        id: "111",
        pageName: "Rival Co",
        platforms: ["Facebook", "Instagram"],
        body: "Autumn sale",
        title: "Shop now",
        description: "Free delivery",
        caption: "rival.example",
        startedOn: "2026-09-03",
        libraryUrl: "https://www.facebook.com/ads/library/?id=111",
      },
    ]);
  });

  it("keeps an ad with missing fields, with nulls instead of guesses", () => {
    expect(parseAdsArchive({ data: [{ id: "222", ad_delivery_start_time: "soon" }] })).toEqual([
      {
        id: "222",
        pageName: "",
        platforms: [],
        body: null,
        title: null,
        description: null,
        caption: null,
        startedOn: null,
        libraryUrl: "https://www.facebook.com/ads/library/?id=222",
      },
    ]);
  });

  it("refuses an answer it cannot read", () => {
    expect(parseAdsArchive({ unexpected: true })).toBeNull();
    expect(parseAdsArchive({ data: [{ id: "../evil" }] })).toBeNull();
    expect(parseAdsArchive(null)).toBeNull();
  });
});

describe("metaErrorMessage", () => {
  it.each([
    [
      { error: { code: 190 } },
      "The Meta Ad Library token has expired or was revoked. Renew it on the server.",
    ],
    [{ error: { code: 4 } }, "Meta is limiting requests right now. Try again in a few minutes."],
    [{ error: { code: 17 } }, "Meta is limiting requests right now. Try again in a few minutes."],
    [{ error: { code: 613 } }, "Meta is limiting requests right now. Try again in a few minutes."],
    [
      { error: { code: 80004 } },
      "Meta is limiting requests right now. Try again in a few minutes.",
    ],
    [{ error: { code: 10 } }, "Meta has not approved this token for the Ad Library API."],
    [{ error: { code: 200 } }, "Meta has not approved this token for the Ad Library API."],
    [
      { error: { code: 1, error_subcode: 2332002 } },
      "Meta has not approved this token for the Ad Library API.",
    ],
    [
      { error: { code: 100 } },
      "Meta refused the search. Check the server's Ad Library countries setting.",
    ],
    [{ error: { code: 1 } }, "Meta could not return ads right now. Try again."],
    [null, "Meta could not return ads right now. Try again."],
  ])("words %o for the person", (json, message) => {
    expect(metaErrorMessage(json)).toBe(message);
  });
});

describe("createResultCache", () => {
  it("returns an entry until it expires", () => {
    let now = 0;
    const cache = createResultCache<string>({ ttlMs: 1000, max: 10, now: () => now });
    cache.set("a", "one");
    now = 999;
    expect(cache.get("a")).toBe("one");
    now = 1000;
    expect(cache.get("a")).toBeUndefined();
  });

  it("drops the oldest entry beyond its size", () => {
    const cache = createResultCache<number>({ ttlMs: 1000, max: 2, now: () => 0 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });
});
