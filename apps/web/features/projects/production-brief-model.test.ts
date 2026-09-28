import { describe, expect, it } from "vitest";
import {
  copyClientBrief,
  emptyProductionBrief,
  productionBriefSchema,
} from "./production-brief-model";
import type { Briefing } from "@/features/briefings/briefing-model";

describe("production brief content", () => {
  it("copies editable content without billing, requester, source metadata or original dates", () => {
    const original = {
      title: "Client request",
      service_type: "social",
      campaign_id: "campaign",
      overview: "Original overview",
      goals: "Original goals",
      due_date: "2026-10-05",
      direction: {
        audience: "Audience",
        source: "client",
        preset_revision: 2,
        questions: { content: "Supplied" },
      },
      requested_deliverables: [
        { id: "client-output", name: "Final", format: "feed", quantity: 1, scope: "original" },
      ],
      confirmed_credits: 5,
      requested_by: "client-person",
    } as unknown as Briefing;
    const result = copyClientBrief(original, "2026-10-01");
    expect(result.dueDate).toBe("2026-10-01");
    expect(result.direction.questions).toEqual({ content: "Supplied" });
    expect(result.deliverables[0]).not.toHaveProperty("id");
    expect(JSON.stringify(result)).not.toMatch(
      /"(?:confirmed_credits|requested_by|preset_revision|source|campaignId)":/,
    );
    result.deliverables[0].quantity = 3;
    expect(original.requested_deliverables[0].quantity).toBe(1);
  });
  it.each(["javascript:alert(1)", "http://example.com", "https://user:password@example.com"])(
    "rejects unsafe reference %s",
    (url) => {
      const content = emptyProductionBrief("Production", "social", null);
      content.references = [{ name: "Reference", url }];
      expect(productionBriefSchema.safeParse(content).success).toBe(false);
    },
  );
  it("rejects fractional or negative output quantities", () => {
    const content = emptyProductionBrief("Production", "social", null);
    for (const quantity of [-1, 0, 1.5, 101]) {
      content.deliverables = [{ name: "Concepts", format: "feed", quantity, scope: "original" }];
      expect(productionBriefSchema.safeParse(content).success).toBe(false);
    }
  });
});
