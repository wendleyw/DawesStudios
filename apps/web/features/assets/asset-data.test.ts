import { describe, expect, it } from "vitest";
import { initialUploadProject } from "./asset-data";

/*
 * The assets page filters to one project; the delivery dialog narrows the choices to the approved
 * ones. Opening on the first approved project in the workspace rather than on the one being viewed
 * attached three final files to a seeded project the viewer had never opened, and the completion
 * notice went to that project's client.
 */
const approved = [{ id: "email-banner" }, { id: "acceptance-run" }];

describe("the project a delivery dialog opens on", () => {
  it("opens on the project the page is filtered to", () => {
    expect(initialUploadProject(approved, "acceptance-run")).toBe("acceptance-run");
  });

  it("falls back to the first candidate when nothing is filtered", () => {
    expect(initialUploadProject(approved, "")).toBe("email-banner");
  });

  it("falls back when the filtered project cannot take a delivery", () => {
    // Filtering to a project that is not approved leaves the dialog on one that is, rather than on
    // an id the service would refuse.
    expect(initialUploadProject(approved, "social-launch")).toBe("email-banner");
  });

  it("chooses nothing when there is nothing to choose", () => {
    expect(initialUploadProject([], "acceptance-run")).toBe("");
  });
});
