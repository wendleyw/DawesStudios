import { expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

it("keeps authorized-app deep-link context without accepting external redirects", () => {
  expect(safeReturnPath("/projects/example?channel=client")).toBe(
    "/projects/example?channel=client",
  );
  for (const path of [
    null,
    "https://example.org",
    "//example.org",
    "/\\example.org",
    "/settings\nLocation: https://example.org",
    "/api/invitations",
    "/homework",
  ])
    expect(safeReturnPath(path)).toBe("/home");
});
