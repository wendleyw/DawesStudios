import { describe, expect, it } from "vitest";
import {
  addCreditMonths,
  brandDefaults,
  byOpenedDate,
  briefingPayload,
  catalogWithPresets,
  creditMonthLabel,
  creditMonthOf,
  decodeBriefing,
  defaultAcceptanceMonth,
  formats,
  initialDraft,
  initialRequester,
  newDeliverable,
  nextVariation,
  openCreditMonths,
  requesterErrors,
  serviceEstimate,
  services,
  validateBriefing,
  type BriefingDraft,
  type ServiceDefinition,
} from "./briefing-model";
import type { Database } from "@database";

function completeDraft(service: ServiceDefinition): BriefingDraft {
  return {
    serviceId: service.id,
    campaignId: "selected-campaign",
    title: "A considered launch",
    overview: "Introduce the collection with one clear next step.",
    goals: "Build awareness",
    direction: {
      questions: Object.fromEntries(
        service.questions.map((question) => [
          question.id,
          question.options?.[0] ?? (question.id === "pages" ? "8" : "A clear creative direction"),
        ]),
      ),
    },
    deliverables: service.formats.map((id) => newDeliverable(id)),
    dueDate: "2026-10-15",
  };
}

describe("briefing catalog and validation", () => {
  it("retains 20 unique services and 25 unique formats with no dangling associations", () => {
    expect(services).toHaveLength(20);
    expect(formats).toHaveLength(25);
    expect(new Set(services.map((item) => item.id)).size).toBe(20);
    expect(new Set(formats.map((item) => item.id)).size).toBe(25);
    expect(
      services
        .flatMap((item) => item.formats)
        .every((id) => formats.some((format) => format.id === id)),
    ).toBe(true);
  });

  it.each(services)("accepts all declared formats and complete answers for $name", (service) => {
    expect(validateBriefing(completeDraft(service))).toEqual([]);
  });

  it("requires an explicit campaign instead of deriving one from other draft state", () => {
    const draft = completeDraft(services[0]);
    draft.campaignId = "";
    expect(validateBriefing(draft)).toContain("Choose or create a campaign.");
    expect(initialDraft(undefined, { source: "brand_hub" }).campaignId).toBe("");
  });

  it.each(formats)(
    "enforces the $name size contract for missing and invalid dimensions",
    (format) => {
      const service = services.find((item) => item.formats.includes(format.id))!;
      const draft = completeDraft(service);
      draft.deliverables = [newDeliverable(format.id)];
      expect(validateBriefing(draft)).toEqual([]);
      if (format.layout === "none") {
        expect(draft.deliverables[0].width).toBeUndefined();
        expect(draft.deliverables[0].height).toBeUndefined();
        return;
      }
      for (const invalid of [undefined, 0, -1, 0.5]) {
        draft.deliverables = [{ ...newDeliverable(format.id), width: invalid }];
        expect(validateBriefing(draft)).toContain(
          "Deliverable 1 needs a positive whole-number width.",
        );
        if (format.layout === "fixed") {
          draft.deliverables = [{ ...newDeliverable(format.id), height: invalid }];
          expect(validateBriefing(draft)).toContain(
            "Deliverable 1 needs a positive whole-number height.",
          );
        }
      }
    },
  );

  it("rejects a format belonging to a different service", () => {
    const service = services.find((item) => item.id === "email-hero")!;
    const draft = completeDraft(service);
    draft.deliverables = [newDeliverable("a4")];
    expect(validateBriefing(draft)).toContain(
      "Deliverable 1 needs a format supported by this service.",
    );
  });

  it.each([0, -1, 1.5, 101, Number.NaN])("rejects invalid deliverable quantity %s", (quantity) => {
    const draft = completeDraft(services[0]);
    draft.deliverables[0].quantity = quantity;
    expect(validateBriefing(draft)).toContain("Deliverable 1 needs a quantity from 1 to 100.");
  });

  it("allows non-dimensional and fluid formats without inventing a fixed height", () => {
    const document = newDeliverable("research");
    const email = newDeliverable("email");
    expect(document.width).toBeUndefined();
    expect(document.height).toBeUndefined();
    expect(email.width).toBe(600);
    expect(email.height).toBeUndefined();
  });

  it("rejects a missing fixed-format height and fractional width", () => {
    const draft = completeDraft(services.find((item) => item.id === "social")!);
    draft.deliverables[0].height = undefined;
    draft.deliverables[0].width = 0.5;
    expect(validateBriefing(draft)).toEqual(
      expect.arrayContaining([
        "Deliverable 1 needs a positive whole-number width.",
        "Deliverable 1 needs a positive whole-number height.",
      ]),
    );
  });

  it("requires service answers and rejects options outside the catalog", () => {
    const draft = completeDraft(services.find((item) => item.id === "reel")!);
    draft.direction.questions = { duration: "45 years" };
    expect(validateBriefing(draft)).toEqual(
      expect.arrayContaining([
        "Choose an available option for “Video duration”.",
        "Complete “Footage & production”.",
      ]),
    );
  });

  it("requires a positive whole number for page counts", () => {
    const draft = completeDraft(services.find((item) => item.id === "deck")!);
    draft.direction.questions!.pages = "1.5";
    expect(validateBriefing(draft)).toContain("“Number of slides” needs a positive whole number.");
  });

  it("rejects dates that overflow a calendar month", () => {
    const draft = completeDraft(services[0]);
    draft.dueDate = "2026-02-31";
    expect(validateBriefing(draft)).toContain("Choose a valid due date.");
  });

  it("keeps one service estimate when deliverables or quantities grow", () => {
    const service = services.find((item) => item.id === "reel")!;
    const draft = completeDraft(service);
    draft.deliverables[0].quantity = 10;
    draft.deliverables.push(newDeliverable("story", 2));
    expect(briefingPayload("client", draft, null).p_estimated_credits).toBe(
      serviceEstimate(service),
    );
  });

  it("applies new preset estimates without changing source definitions or inventing a custom-service price", () => {
    const original = services.find((item) => item.id === "social")!;
    const revised = catalogWithPresets([
      { service_type: "social", min_credits: 4, max_credits: 8, due_days: 6, revision: 2 },
      { service_type: "other", min_credits: 3, max_credits: 6, due_days: 7, revision: 1 },
    ]);
    const social = revised.find((item) => item.id === "social")!;
    expect(social.min).toBe(4);
    expect(social.days).toBe(6);
    expect(original.min).toBe(1);
    expect(revised.find((item) => item.id === "other")?.min).toBeUndefined();
    expect(
      briefingPayload("client", completeDraft(social), null, serviceEstimate(social))
        .p_estimated_credits,
    ).toBe(6);
  });

  it("omits empty nullable RPC fields so SQL defaults clear optional values, without inventing IDs", () => {
    const draft = initialDraft(undefined, {});
    draft.serviceId = "other";
    const payload = briefingPayload("client", draft, null);
    expect(payload).not.toHaveProperty("p_campaign_id");
    expect(payload).not.toHaveProperty("p_due_date");
    expect(payload).not.toHaveProperty("p_briefing_id");
  });

  it("copies brand defaults without sharing or mutating the canonical section objects", () => {
    const sections = [
      { section: "overview", content: { audience: "Outdoor explorers" } },
      { section: "visual-style", content: { photography: "Natural light" } },
    ];
    const direction = brandDefaults(sections);
    direction.audience = "A project-specific audience";
    expect(sections[0].content.audience).toBe("Outdoor explorers");
    expect(direction.style).toBe("Natural light");
  });

  it("validates JSON records at the database boundary", () => {
    const row: Database["public"]["Tables"]["briefings"]["Row"] = {
      id: "brief",
      client_id: "client",
      campaign_id: null,
      title: "Draft",
      service_type: "other",
      status: "draft",
      overview: "",
      goals: "",
      direction: { questions: { scope: 42 } },
      requested_deliverables: [],
      due_date: null,
      estimated_credits: 1,
      confirmed_credits: null,
      budget_note: null,
      created_by: "person",
      requested_by: null,
      created_at: "2026-09-20T00:00:00Z",
      updated_at: "2026-09-20T00:00:00Z",
    };
    expect(() => decodeBriefing(row)).toThrow();
    expect(
      decodeBriefing({
        ...row,
        direction: { questions: { scope: "Define our creative strategy" } },
      }).direction.questions?.scope,
    ).toBe("Define our creative strategy");
  });
});

describe("variation numbering", () => {
  it("never reuses a name after a deliverable is removed", () => {
    // Counting survivors would hand the third card "Variation 2" again, colliding with the second.
    let list = [newDeliverable("reel", nextVariation([], "reel"))];
    list = [...list, newDeliverable("reel", nextVariation(list, "reel"))];
    list = list.slice(1);
    list = [...list, newDeliverable("reel", nextVariation(list, "reel"))];
    const names = list.map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(["Instagram Reels / Variation 2", "Instagram Reels / Variation 3"]);
  });

  it("starts at one and marks only later variations as adaptations", () => {
    const first = newDeliverable("reel", nextVariation([], "reel"));
    expect(first.scope).toBe("original");
    const second = newDeliverable("reel", nextVariation([first], "reel"));
    expect(second.scope).toBe("adaptation");
  });

  it("keeps counting when the client has renamed earlier pieces", () => {
    // The intake journey renames every deliverable, so a name-derived number would send the next
    // piece back to Variation 1 instead of continuing the sequence.
    const first = { ...newDeliverable("reel", 1), name: "Collection launch reel" };
    const second = { ...newDeliverable("reel", 2), name: "Second audience variation" };
    expect(nextVariation([first, second], "reel")).toBe(3);
  });

  it("numbers each format independently", () => {
    const reel = newDeliverable("reel", nextVariation([], "reel"));
    expect(nextVariation([reel], "gif")).toBe(1);
  });
});

describe("the requester the studio names", () => {
  const people = [{ user_id: "ana" }, { user_id: "ben" }];

  it("opens on the briefing's own requester while they are still at the client", () => {
    expect(initialRequester("ben", people)).toBe("ben");
  });

  it("opens on the only person, and on nobody while the choice is open", () => {
    expect(initialRequester(null, [{ user_id: "ana" }])).toBe("ana");
    expect(initialRequester(undefined, people)).toBe("");
  });

  it("never reopens on someone who has left", () => {
    expect(initialRequester("zed", people)).toBe("");
    expect(initialRequester("zed", [{ user_id: "ana" }])).toBe("ana");
  });

  it("requires a choice among the client's people, and none when there are none", () => {
    expect(requesterErrors("", people)).toEqual(["Choose who requested this briefing."]);
    expect(requesterErrors("zed", people)).toEqual(["Choose who requested this briefing."]);
    expect(requesterErrors("ana", people)).toEqual([]);
    expect(requesterErrors("", [])).toEqual([]);
    expect(requesterErrors("", undefined)).toEqual([]);
  });

  it("sends the requester only when one is chosen", () => {
    const draft = initialDraft(undefined, {});
    expect(briefingPayload("client", draft, null, 3, "ana").p_requested_by).toBe("ana");
    expect(briefingPayload("client", draft, null, 3, "")).not.toHaveProperty("p_requested_by");
    expect(briefingPayload("client", draft, null)).not.toHaveProperty("p_requested_by");
  });
});

describe("byOpenedDate", () => {
  it("lists the most recently opened briefing first, whatever its due date, keeping ties in order", () => {
    const list = [
      { id: "may", created_at: "2026-05-01T10:00:00Z" },
      { id: "sep-a", created_at: "2026-09-20T09:00:00Z" },
      { id: "sep-b", created_at: "2026-09-20T09:00:00Z" },
      { id: "today", created_at: "2026-09-26T22:08:17.415533+00:00" },
    ];
    expect(byOpenedDate(list).map((item) => item.id)).toEqual(["today", "sep-a", "sep-b", "may"]);
  });
});

describe("credit months", () => {
  // 23:30 on Sep 30 in São Paulo is already October in UTC, the database's clock.
  const now = new Date("2026-10-01T02:30:00Z");

  it("takes the first day of a month in UTC, from a date or a day string", () => {
    expect(creditMonthOf(now)).toBe("2026-10-01");
    expect(creditMonthOf(new Date("2026-09-30T23:59:59Z"))).toBe("2026-09-01");
    expect(creditMonthOf("2026-12-24")).toBe("2026-12-01");
  });

  it("adds months across a year", () => {
    expect(addCreditMonths("2026-11-01", 3)).toBe("2027-02-01");
    expect(addCreditMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("opens the current month and the next eleven", () => {
    const months = openCreditMonths(now);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-10-01");
    expect(months[11]).toBe("2027-09-01");
  });

  it("defaults acceptance to the due month, clamped to the open window like accept_briefing", () => {
    expect(defaultAcceptanceMonth(null, now)).toBe("2026-10-01");
    expect(defaultAcceptanceMonth("2026-12-12", now)).toBe("2026-12-01");
    expect(defaultAcceptanceMonth("2026-08-02", now)).toBe("2026-10-01");
    expect(defaultAcceptanceMonth("2028-03-01", now)).toBe("2027-09-01");
  });

  it("labels a month by name and year", () => {
    expect(creditMonthLabel("2026-10-01")).toBe("October 2026");
  });
});
