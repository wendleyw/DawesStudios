import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrandAssets } from "./brand-assets";
import type { BrandAsset, BrandAssetFolder } from "./brand-data";

const fixture = vi.hoisted(() => ({
  assets: [] as BrandAsset[],
  folders: [] as BrandAssetFolder[],
  move: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {}, profile: { role: "agency" } }),
}));
vi.mock("./brand-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./brand-data")>()),
  useBrandAssets: () => ({ data: fixture.assets }),
  useBrandAssetFolders: () => ({ data: fixture.folders }),
  useBrandAssetPreviewUrl: () => ({}),
  moveBrandAsset: fixture.move,
}));
vi.mock("@/features/shared/modal", () => ({
  Modal: ({ title, children }: { title: string; children: ReactNode }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}));

beforeEach(() => {
  fixture.move.mockReset().mockResolvedValue(undefined);
  fixture.folders = [
    { id: "logos", client_id: "client", name: "Logos", created_at: "2026-09-23" },
    { id: "campaign", client_id: "client", name: "Campaign", created_at: "2026-09-23" },
  ];
  fixture.assets = [
    {
      id: "logo",
      client_id: "client",
      name: "Approved mark",
      folder_id: "logos",
      category: "Logo",
      created_at: "2026-09-23",
      description: "Primary mark",
      tags: [],
      storage_path: null,
      mime_type: null,
    },
  ];
});

function mountAssets() {
  const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={cache}>
      <BrandAssets clientId="client" />
    </QueryClientProvider>
  );
  const view = render(tree());
  return () => view.rerender(tree());
}

describe("Brand asset folder changes", () => {
  it("returns to All assets when a remotely removed folder disappears", async () => {
    const user = userEvent.setup();
    const rerender = mountAssets();
    await user.click(screen.getByRole("button", { name: "Logos 1" }));

    fixture.folders = fixture.folders.filter((folder) => folder.id !== "logos");
    fixture.assets = fixture.assets.map((asset) => ({ ...asset, folder_id: null }));
    rerender();

    expect(screen.getByRole("button", { name: "All assets 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Approved mark/ })).toBeVisible();
    expect(screen.queryByText("No matching assets.")).not.toBeInTheDocument();
  });

  it("reflects remote moves without replacing a user's explicitly chosen destination", async () => {
    const user = userEvent.setup();
    const rerender = mountAssets();
    await user.click(screen.getByRole("button", { name: /Approved mark/ }));
    const dialog = within(screen.getByRole("dialog", { name: "Approved mark" }));
    const picker = dialog.getByRole("combobox", { name: "Folder" });

    fixture.assets = fixture.assets.map((asset) => ({ ...asset, folder_id: "campaign" }));
    rerender();
    expect(picker).toHaveValue("campaign");
    expect(dialog.getByRole("button", { name: "Move asset" })).toBeDisabled();

    await user.selectOptions(picker, "logos");
    fixture.assets = fixture.assets.map((asset) => ({ ...asset, folder_id: null }));
    rerender();
    expect(picker).toHaveValue("logos");
    expect(dialog.getByRole("button", { name: "Move asset" })).toBeEnabled();
  });

  it("does not submit a removed destination", async () => {
    const user = userEvent.setup();
    const rerender = mountAssets();
    await user.click(screen.getByRole("button", { name: /Approved mark/ }));
    const picker = screen.getByRole("combobox", { name: "Folder" });
    await user.selectOptions(picker, "campaign");

    fixture.folders = fixture.folders.filter((folder) => folder.id !== "campaign");
    rerender();
    expect(picker).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Move asset" }));
    expect(fixture.move).toHaveBeenCalledWith(
      {},
      { id: "logo", clientId: "client", folderId: null },
    );
  });
});
