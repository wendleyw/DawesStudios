import { describe, expect, it } from "vitest";
import {
  personName,
  requesterLabel,
  reviewDecisionLabel,
  type ClientPeople,
} from "./client-people";

const ana = { user_id: "ana", display_name: "Ana Lima", email: "ana@sabre.test" };
const studioView: ClientPeople = { team: [ana], names: { ana: "Ana Lima", ben: "Ben Cole" } };
const clientView: ClientPeople = { team: [ana], names: {} };

describe("the name a viewer sees for a client person", () => {
  it("names an active person to the studio and to the client", () => {
    expect(personName("ana", studioView, "agency")).toBe("Ana Lima");
    expect(personName("ana", clientView, "client")).toBe("Ana Lima");
  });

  it("marks someone who left for the studio and never names them to the client", () => {
    expect(personName("ben", studioView, "agency")).toBe("Ben Cole (left)");
    expect(personName("ben", clientView, "client")).toBe("Former member");
  });

  it("shows nothing without a person, before the people load, or for an id the studio cannot name", () => {
    expect(personName(null, studioView, "agency")).toBeNull();
    expect(personName("ana", undefined, "client")).toBeNull();
    expect(personName("zed", studioView, "agency")).toBeNull();
  });

  it("never names anyone to a designer", () => {
    expect(personName("ana", studioView, "designer")).toBeNull();
    expect(personName("ben", studioView, "designer")).toBeNull();
  });
});

describe("the requester and review decision labels", () => {
  it("reads Requested by, or nothing", () => {
    expect(requesterLabel("Ana Lima")).toBe("Requested by Ana Lima");
    expect(requesterLabel(null)).toBeNull();
  });

  it("names who decided and when", () => {
    expect(reviewDecisionLabel("approved", "Ana Lima", "Sep 24")).toBe(
      "Approved by Ana Lima · Sep 24",
    );
    expect(reviewDecisionLabel("changes_requested", "Former member", "Sep 23")).toBe(
      "Changes requested by Former member · Sep 23",
    );
  });

  it("leaves undecided versions and unrecorded reviewers to today's wording", () => {
    expect(reviewDecisionLabel("pending", "Ana Lima", "Sep 24")).toBeNull();
    expect(reviewDecisionLabel("approved", null, "Sep 24")).toBeNull();
  });
});
