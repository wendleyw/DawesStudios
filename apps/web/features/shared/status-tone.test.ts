import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Constants } from "@database";
import { briefingStatusLabels, briefingStatusTones } from "@/features/briefings/briefing-model";
import {
  creditRequestStatusLabels,
  creditRequestStatusTones,
} from "@/features/credits/credit-model";
import { projectStatusTones, statusLabels } from "@/features/workspace/workspace-data";
import { statusToneClass, type StatusTone } from "./status-tone";

// `.status-badge` used to key its variant styling off four project enum values by name, which left
// briefing statuses, credit-request statuses and the bare role badge with no variant at all. The
// badge now styles four meanings and each domain maps its own enum onto them. That mapping is only
// worth having if it is total: a status with no tone would silently fall back to the resting
// appearance and reintroduce exactly the flattening this replaced. These tests check totality
// against the database enums rather than against a list copied into the test.

const tones: StatusTone[] = ["neutral", "active", "attention", "complete"];

// A credit request's status is not a database enum — the table stores it as text and
// `credit-model.ts` narrows it — so its values are named here, next to the two that are read from
// `Constants`.
const creditRequestStatuses = ["pending", "fulfilled", "rejected"] as const;

describe("status tones", () => {
  it("names a tone for every project status the database can hold", () => {
    expect(Object.keys(projectStatusTones).toSorted()).toEqual(
      [...Constants.public.Enums.project_status].toSorted(),
    );
    for (const status of Constants.public.Enums.project_status) {
      expect(tones, `project status "${status}"`).toContain(projectStatusTones[status]);
    }
  });

  it("names a tone for every briefing status the database can hold", () => {
    expect(Object.keys(briefingStatusTones).toSorted()).toEqual(
      [...Constants.public.Enums.briefing_status].toSorted(),
    );
    for (const status of Constants.public.Enums.briefing_status) {
      expect(tones, `briefing status "${status}"`).toContain(briefingStatusTones[status]);
    }
  });

  it("names a tone for every credit-request status", () => {
    expect(Object.keys(creditRequestStatusTones).toSorted()).toEqual(
      [...creditRequestStatuses].toSorted(),
    );
    for (const status of creditRequestStatuses) {
      expect(tones, `credit request status "${status}"`).toContain(
        creditRequestStatusTones[status],
      );
    }
  });

  it("keeps every tone map on exactly the keys its label map carries", () => {
    expect(Object.keys(projectStatusTones).toSorted()).toEqual(
      Object.keys(statusLabels).toSorted(),
    );
    expect(Object.keys(briefingStatusTones).toSorted()).toEqual(
      Object.keys(briefingStatusLabels).toSorted(),
    );
    expect(Object.keys(creditRequestStatusTones).toSorted()).toEqual(
      Object.keys(creditRequestStatusLabels).toSorted(),
    );
  });

  it("agrees across domains on what a state means", () => {
    // An accepted briefing produced its project; an approved project produced its work. Both are
    // complete, and both must read the same on screen.
    expect(briefingStatusTones.accepted).toBe(projectStatusTones.approved);
    // A briefing waiting on the studio and a project sent back for changes are both waiting on a
    // person.
    expect(briefingStatusTones.awaiting_review).toBe(projectStatusTones.changes_requested);
    expect(creditRequestStatusTones.pending).toBe(projectStatusTones.internal_review);
  });
});

describe("statusToneClass", () => {
  it("renders the resting tone as the bare badge, so a badge with no status needs no tone", () => {
    expect(statusToneClass("neutral")).toBe("status-badge");
    expect(statusToneClass()).toBe("status-badge");
  });

  it("renders every other tone as one modifier class", () => {
    expect(statusToneClass("active")).toBe("status-badge tone-active");
    expect(statusToneClass("attention")).toBe("status-badge tone-attention");
    expect(statusToneClass("complete")).toBe("status-badge tone-complete");
  });

  it("emits a class that app/globals.css actually defines", () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "globals.css"),
      "utf8",
    );
    for (const tone of tones) {
      const modifier = statusToneClass(tone).split(" ")[1];
      if (!modifier) continue;
      expect(css, `app/globals.css defines .status-badge.${modifier}`).toContain(
        `.status-badge.${modifier}`,
      );
    }
    // No database enum value may appear as a badge selector again.
    for (const status of [
      ...Constants.public.Enums.project_status,
      ...Constants.public.Enums.briefing_status,
    ]) {
      expect(css).not.toContain(`.status-badge.${status}`);
    }
  });
});
