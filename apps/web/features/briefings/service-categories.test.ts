import { describe, expect, it } from "vitest";
import { services as serviceCatalog } from "./briefing-model";
import { categoryExamples, searchServices, serviceCategories } from "./service-categories";

describe("serviceCategories", () => {
  it("groups the catalog into its six categories with Other last", () => {
    expect(serviceCategories(serviceCatalog).map((category) => category.name)).toEqual([
      "Social & ads",
      "Video",
      "Web & email",
      "Documents",
      "Brand & print",
      "Other",
    ]);
  });

  it("keeps every service in exactly one category", () => {
    const grouped = serviceCategories(serviceCatalog).flatMap((category) => category.services);
    expect(grouped.map((service) => service.id).toSorted()).toEqual(
      serviceCatalog.map((service) => service.id).toSorted(),
    );
  });

  it("places a category it does not know before Other", () => {
    const base = serviceCatalog[0];
    const names = serviceCategories([
      { ...base, id: "a", category: "Other" },
      { ...base, id: "b", category: "Motion" },
      { ...base, id: "c", category: "Video" },
    ]).map((category) => category.name);
    expect(names).toEqual(["Video", "Motion", "Other"]);
  });
});

describe("categoryExamples", () => {
  it("names the first three services and marks that there are more", () => {
    const video = serviceCategories(serviceCatalog).find((category) => category.name === "Video")!;
    const names = video.services.map((service) => service.name);
    expect(categoryExamples(video)).toBe(`${names.slice(0, 3).join(", ")}…`);
  });
});

describe("searchServices", () => {
  it("matches name, description or category across every category, ignoring case", () => {
    expect(searchServices(serviceCatalog, "rEeL").map((service) => service.id)).toContain("reel");
    expect(searchServices(serviceCatalog, "  ").length).toBe(serviceCatalog.length);
    expect(searchServices(serviceCatalog, "no such thing")).toEqual([]);
  });
});
