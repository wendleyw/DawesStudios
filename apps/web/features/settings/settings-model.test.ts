import { describe, expect, it } from "vitest";
import {
  clientSlug,
  invitationRequestSchema,
  validWebsite,
  validatePassword,
} from "./settings-model";

describe("invitation scope validation", () => {
  it("normalizes an email and requires a client workspace for client invites", () => {
    const result = invitationRequestSchema.parse({
      email: "  PERSON@EXAMPLE.TEST  ",
      role: "client",
      clientId: "10000000-0000-4000-8000-000000000001",
    });
    expect(result.email).toBe("person@example.test");
    expect(
      invitationRequestSchema.safeParse({ email: "person@example.test", role: "client" }).success,
    ).toBe(false);
  });
  it("rejects attaching a client to an agency or designer invitation", () => {
    for (const role of ["agency", "designer"])
      expect(
        invitationRequestSchema.safeParse({
          email: "person@example.test",
          role,
          clientId: "10000000-0000-4000-8000-000000000001",
        }).success,
      ).toBe(false);
  });
  it("rejects unsupported roles and invalid email addresses", () => {
    expect(
      invitationRequestSchema.safeParse({ email: "person@example.test", role: "superuser" })
        .success,
    ).toBe(false);
    expect(
      invitationRequestSchema.safeParse({ email: "not-an-email", role: "designer" }).success,
    ).toBe(false);
  });
  it("trims a supplied name and omits whitespace-only names", () => {
    const input = { email: "person@example.test", role: "designer" };
    expect(
      invitationRequestSchema.parse({ ...input, displayName: "  Ana Lima  " }).displayName,
    ).toBe("Ana Lima");
    expect(
      invitationRequestSchema.parse({ ...input, displayName: "  " }).displayName,
    ).toBeUndefined();
    expect(invitationRequestSchema.parse(input).displayName).toBeUndefined();
  });
  it("accepts the profile name limit and rejects a longer supplied name", () => {
    const input = { email: "person@example.test", role: "designer" };
    expect(
      invitationRequestSchema.safeParse({ ...input, displayName: "A".repeat(120) }).success,
    ).toBe(true);
    expect(
      invitationRequestSchema.safeParse({ ...input, displayName: "A".repeat(121) }).success,
    ).toBe(false);
  });
});

describe("account password validation", () => {
  it("requires the backend's twelve-character minimum", () => {
    expect(validatePassword("short", "short")).toContain("12 characters");
    expect(validatePassword("twelve-chars", "twelve-chars")).toBeNull();
  });
  it("requires a matching confirmation before a password mutation", () => {
    expect(validatePassword("a-good-long-password", "a-different-password")).toBe(
      "The passwords do not match.",
    );
  });
});

describe("client settings validation", () => {
  it("creates stable safe slugs from spaces, accents and punctuation", () => {
    expect(clientSlug("  Harbor & Pine  ")).toBe("harbor-pine");
    expect(clientSlug("Café North")).toBe("cafe-north");
    expect(clientSlug("---")).toBe("");
  });
  it("allows empty or web addresses but rejects executable schemes", () => {
    expect(validWebsite("")).toBe(true);
    expect(validWebsite("https://example.test/brand")).toBe(true);
    expect(validWebsite("javascript:alert(1)")).toBe(false);
    expect(validWebsite("example.test")).toBe(false);
  });
});
