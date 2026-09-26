import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrandSectionContent } from "./brand-sections";
import type { BrandAsset } from "./brand-data";

const fixture = vi.hoisted(() => ({ assets: [] as BrandAsset[] }));
vi.mock("./brand-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./brand-data")>()),
  useBrandAssets: () => ({ data: fixture.assets }),
  useBrandAssetPreviewUrl: () => ({}),
}));

function asset(id: string, name: string, category: string, mime: string): BrandAsset {
  return {
    id,
    client_id: "client",
    name,
    folder_id: null,
    category,
    created_at: "2026-09-23",
    description: "",
    tags: [],
    storage_path: `client/${id}`,
    mime_type: mime,
    link_url: null,
  };
}

beforeEach(() => {
  fixture.assets = [
    asset("mark", "Primary mark", "Logo", "image/png"),
    asset("vector", "Primary mark (SVG)", "Logo", "image/svg+xml"),
    asset("sheet", "Logo sheet", "Logo", "application/pdf"),
    asset("photo", "Campaign photography", "Photography", "image/jpeg"),
  ];
});

function renderLogos() {
  render(
    <BrandSectionContent
      clientId="client"
      clientName="SABRE"
      section="logos"
      content={{ guidance: "Keep clear space.", variants: ["Forest on ivory"] }}
      sections={[]}
    />,
  );
}

describe("Brand Hub logos", () => {
  it("shows the client's logo files on the Logos page itself, and only those", () => {
    renderLogos();
    const files = screen.getByRole("list", { name: "Logo files" });
    expect(
      within(files)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("Primary mark"),
      expect.stringContaining("Primary mark (SVG)"),
      expect.stringContaining("Logo sheet"),
    ]);
    expect(files).not.toHaveTextContent("Campaign photography");
    expect(screen.getByRole("link", { name: /Find logo files/ })).toHaveAttribute(
      "href",
      "/clients/client/brand/assets?category=Logo",
    );
  });

  it("keeps the page to its guidance when there are no logo files", () => {
    fixture.assets = [asset("photo", "Campaign photography", "Photography", "image/jpeg")];
    renderLogos();
    expect(screen.queryByRole("list", { name: "Logo files" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Find logo files/ })).not.toBeInTheDocument();
    expect(screen.getByText("Keep clear space.")).toBeInTheDocument();
  });
});
