import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrandPage } from "./brand-page";

const fixture = vi.hoisted(() => ({ role: "agency" }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ profile: { role: fixture.role } }),
}));
vi.mock("@/features/workspace/workspace-data", () => ({
  useClients: () => ({ isPending: false, data: [{ id: "client", name: "SABRE" }] }),
}));
vi.mock("./brand-data", () => ({
  useBrandSections: () => ({ isPending: false, data: [] }),
}));
vi.mock("./brand-sections", () => ({ BrandSectionContent: () => null }));
vi.mock("@/features/assets/assets-page", () => ({
  AssetsPage: () => <p>Deliverables content</p>,
}));

beforeEach(() => {
  fixture.role = "agency";
});

describe("Brand Hub sections by role", () => {
  it("offers Deliverables to the studio and the client", () => {
    for (const role of ["agency", "client"]) {
      fixture.role = role;
      const { unmount } = render(<BrandPage clientId="client" section="files" />);
      expect(screen.getByRole("link", { name: "Deliverables" })).toBeInTheDocument();
      expect(screen.getByText("Deliverables content")).toBeInTheDocument();
      unmount();
    }
  });

  it("keeps Deliverables away from a designer, by tab and by address", () => {
    fixture.role = "designer";
    const { unmount } = render(<BrandPage clientId="client" section="overview" />);
    expect(screen.getByRole("link", { name: "Assets" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Deliverables" })).toBeNull();
    unmount();
    render(<BrandPage clientId="client" section="files" />);
    expect(screen.getByRole("heading", { name: "Brand Hub unavailable." })).toBeInTheDocument();
    expect(screen.queryByText("Deliverables content")).toBeNull();
  });
});
