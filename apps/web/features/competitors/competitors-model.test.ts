import { describe, expect, it } from "vitest";
import {
  competitorWriteMessage,
  libraryLinks,
  matchedSources,
  parseCompetitorForm,
  websiteHost,
} from "./competitors-model";

const blank = {
  name: "",
  website: "",
  metaPageId: "",
  googleAdvertiserId: "",
  tiktokAdvertiser: "",
};

describe("parseCompetitorForm", () => {
  it("trims every field and stores an empty optional field as null", () => {
    expect(
      parseCompetitorForm({
        ...blank,
        name: "  Rival Co  ",
        website: " https://rival.example ",
        metaPageId: " 123456789 ",
      }),
    ).toEqual({
      input: {
        name: "Rival Co",
        website: "https://rival.example",
        metaPageId: "123456789",
        googleAdvertiserId: null,
        tiktokAdvertiser: null,
      },
    });
  });

  it.each([
    [{ ...blank }, "Add the competitor's name."],
    [{ ...blank, name: "x".repeat(81) }, "Keep the name to 80 characters."],
    [
      { ...blank, name: "Rival", website: "rival.example" },
      "Enter a website that starts with http:// or https://.",
    ],
    [
      { ...blank, name: "Rival", website: "javascript:alert(1)" },
      "Enter a website that starts with http:// or https://.",
    ],
    [{ ...blank, name: "Rival", metaPageId: "12ab" }, "A Facebook Page ID is only digits."],
    [
      { ...blank, name: "Rival", googleAdvertiserId: "CR123" },
      "A Google advertiser ID starts with AR, followed by digits.",
    ],
    [
      { ...blank, name: "Rival", tiktokAdvertiser: "y".repeat(81) },
      "Keep the TikTok name to 80 characters.",
    ],
  ])("refuses %o with a message the form can show", (form, message) => {
    expect(parseCompetitorForm(form)).toEqual({ error: message });
  });
});

const cafe = {
  name: "Café & Co #1",
  website: "https://www.rival.example/shop",
  meta_page_id: null,
  google_advertiser_id: null,
  tiktok_advertiser: null,
};

describe("libraryLinks", () => {
  it("searches each library by name, encoded, when the competitor has no platform ids", () => {
    expect(libraryLinks(cafe)).toEqual({
      meta: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=keyword_unordered&q=Caf%C3%A9+%26+Co+%231",
      tiktok: "https://library.tiktok.com/ads?region=all&adv_name=Caf%C3%A9+%26+Co+%231",
      google: "https://adstransparency.google.com/?region=anywhere&domain=rival.example",
    });
  });

  it("opens the exact page and advertiser when the competitor has their ids", () => {
    expect(
      libraryLinks({
        ...cafe,
        meta_page_id: "123456789",
        google_advertiser_id: "AR01234567890123456789",
        tiktok_advertiser: "Rival Official",
      }),
    ).toEqual({
      meta: "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all&search_type=page&view_all_page_id=123456789",
      tiktok: "https://library.tiktok.com/ads?region=all&adv_name=Rival+Official",
      google:
        "https://adstransparency.google.com/advertiser/AR01234567890123456789?region=anywhere",
    });
  });

  it("opens the Transparency Center's search when Google has neither an id nor a website", () => {
    expect(libraryLinks({ ...cafe, website: null }).google).toBe(
      "https://adstransparency.google.com/?region=anywhere",
    );
  });
});

describe("websiteHost and matchedSources", () => {
  it("shows a website as its host, without www", () => {
    expect(websiteHost("https://www.rival.example/shop")).toBe("rival.example");
    expect(websiteHost(null)).toBeNull();
    expect(websiteHost("not a url")).toBeNull();
  });

  it("marks only the sources with a direct match; TikTok always searches by name", () => {
    expect(matchedSources({ ...cafe, website: null })).toEqual(["TikTok"]);
    expect(matchedSources(cafe)).toEqual(["TikTok", "Google"]);
    expect(
      matchedSources({
        ...cafe,
        meta_page_id: "1",
        website: null,
        google_advertiser_id: "AR0123456789",
      }),
    ).toEqual(["Meta", "TikTok", "Google"]);
  });
});

describe("competitorWriteMessage", () => {
  it("names a duplicate in the person's words and passes other messages through", () => {
    expect(
      competitorWriteMessage(
        new Error('duplicate key value violates unique constraint "competitors_client_name_key"'),
        "Rival Co",
      ),
    ).toBe("This client already follows Rival Co.");
    expect(
      competitorWriteMessage(new Error("A client can follow up to 12 competitors."), "Rival Co"),
    ).toBe("A client can follow up to 12 competitors.");
  });
});
