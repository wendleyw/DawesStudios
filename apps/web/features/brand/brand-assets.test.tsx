import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrandAssets } from "./brand-assets";
import type { BrandAsset, BrandAssetFolder } from "./brand-data";

const fixture = vi.hoisted(() => ({
  assets: [] as BrandAsset[],
  folders: [] as BrandAssetFolder[],
  move: vi.fn(),
  upload: vi.fn(),
  insert: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  role: "agency",
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({ database: {}, profile: { role: fixture.role } }),
}));
vi.mock("./brand-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./brand-data")>()),
  useBrandAssets: () => ({ data: fixture.assets }),
  useBrandAssetFolders: () => ({ data: fixture.folders }),
  useBrandAssetPreviewUrl: () => ({}),
  moveBrandAsset: fixture.move,
  uploadBrandAssetFile: fixture.upload,
  insertBrandAsset: fixture.insert,
  findBrandAssetById: fixture.find,
  updateBrandAssetDetails: fixture.update,
}));
vi.mock("@/features/shared/modal", () => ({
  Modal: ({
    title,
    children,
    footer,
  }: {
    title: string;
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <div role="dialog" aria-label={title}>
      {children}
      {footer}
    </div>
  ),
}));

beforeEach(() => {
  fixture.role = "agency";
  fixture.move.mockReset().mockResolvedValue(undefined);
  fixture.upload.mockReset().mockResolvedValue(undefined);
  fixture.insert.mockReset().mockResolvedValue(undefined);
  fixture.find.mockReset().mockResolvedValue(null);
  fixture.update.mockReset().mockResolvedValue(undefined);
  fixture.folders = [
    { id: "logos", client_id: "client", name: "Logos", created_at: "2026-09-23", parent_id: null },
    {
      id: "campaign",
      client_id: "client",
      name: "Campaign",
      created_at: "2026-09-23",
      parent_id: null,
    },
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
      link_url: null,
    },
  ];
});

function mountAssets(props: Partial<Parameters<typeof BrandAssets>[0]> = {}) {
  const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const tree = () => (
    <QueryClientProvider client={cache}>
      <BrandAssets clientId="client" {...props} />
    </QueryClientProvider>
  );
  const view = render(tree());
  return () => view.rerender(tree());
}

const folderTile = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

describe("Brand asset folder changes", () => {
  it("returns to the top level when a remotely removed folder disappears", async () => {
    const user = userEvent.setup();
    const rerender = mountAssets();
    await user.click(folderTile("Logos"));

    fixture.folders = fixture.folders.filter((folder) => folder.id !== "logos");
    fixture.assets = fixture.assets.map((asset) => ({ ...asset, folder_id: null }));
    rerender();

    expect(screen.queryByRole("navigation", { name: "Folder path" })).not.toBeInTheDocument();
    expect(folderTile("Campaign")).toBeVisible();
    expect(screen.getByRole("button", { name: /Approved mark/ })).toBeVisible();
    expect(screen.queryByText("No matching assets.")).not.toBeInTheDocument();
  });

  it("reflects remote moves without replacing a user's explicitly chosen destination", async () => {
    const user = userEvent.setup();
    const rerender = mountAssets();
    await user.click(folderTile("Logos"));
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
    await user.click(folderTile("Logos"));
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

const product = {
  name: "Everyday Alarm",
  description: "Compact concept",
  specs: "",
  rules: "",
  imageAssetId: "",
  link: "",
};

describe("Brand asset roles and Products", () => {
  it("lets a client create folders and add images, but not manage them", async () => {
    fixture.role = "client";
    const user = userEvent.setup();
    mountAssets();
    expect(screen.getByRole("button", { name: "New folder" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add images" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add link" })).toBeVisible();
    await user.click(folderTile("Logos"));
    expect(screen.queryByRole("button", { name: "Rename folder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete folder" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Approved mark/ }));
    expect(screen.queryByRole("button", { name: "Move asset" })).not.toBeInTheDocument();
  });

  it("keeps a designer to browsing", () => {
    fixture.role = "designer";
    mountAssets();
    expect(screen.queryByRole("button", { name: "New folder" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add (asset|image|link)/ }),
    ).not.toBeInTheDocument();
  });

  it("shows Products only when its folder is opened", async () => {
    const user = userEvent.setup();
    fixture.assets = fixture.assets.map((asset) => ({ ...asset, folder_id: null }));
    mountAssets({ products: { items: [product] } });
    expect(screen.queryByText("Everyday Alarm")).not.toBeInTheDocument();
    await user.click(folderTile("Products"));
    expect(screen.getByRole("heading", { name: "Everyday Alarm" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Approved mark/ })).not.toBeInTheDocument();
  });

  it("hides an empty Products entry from readers", () => {
    fixture.role = "client";
    mountAssets({ products: undefined });
    expect(screen.queryByRole("button", { name: /^Products/ })).not.toBeInTheDocument();
  });

  it("keeps an empty Products entry for the agency, who adds the first product", () => {
    mountAssets({ products: undefined, onEditProducts: () => undefined });
    expect(folderTile("Products")).toHaveTextContent("0 products");
  });
});

describe("Brand asset directory", () => {
  it("opens nested folders and walks back up the path", async () => {
    fixture.folders.push({
      id: "primary",
      client_id: "client",
      name: "Primary",
      created_at: "2026-09-23",
      parent_id: "logos",
    });
    fixture.assets = fixture.assets.map((asset) => ({ ...asset, folder_id: "primary" }));
    const user = userEvent.setup();
    mountAssets();
    // A folder counts what its subfolders hold.
    expect(folderTile("Logos")).toHaveTextContent("1 asset");
    expect(screen.queryByRole("button", { name: /^Primary/ })).not.toBeInTheDocument();
    await user.click(folderTile("Logos"));
    await user.click(folderTile("Primary"));
    expect(screen.getByRole("button", { name: /Approved mark/ })).toBeVisible();
    const path = screen.getByRole("navigation", { name: "Folder path" });
    expect(within(path).getByText("Primary")).toHaveAttribute("aria-current", "page");
    await user.click(within(path).getByRole("button", { name: "Logos" }));
    expect(folderTile("Primary")).toBeVisible();
    await user.click(within(path).getByRole("button", { name: "Assets" }));
    expect(folderTile("Logos")).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Folder path" })).not.toBeInTheDocument();
  });

  it("searches every folder at once", async () => {
    const user = userEvent.setup();
    mountAssets();
    expect(screen.queryByRole("button", { name: /Approved mark/ })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Search brand assets"), "approved");
    expect(screen.getByRole("button", { name: /Approved mark/ })).toBeVisible();
    expect(screen.getByText("Search results")).toBeVisible();
  });

  it("opens a link asset instead of downloading it", async () => {
    fixture.assets.push({
      ...fixture.assets[0],
      id: "portal",
      name: "Brand portal",
      category: "Link",
      folder_id: null,
      link_url: "https://example.com/portal",
    });
    const user = userEvent.setup();
    mountAssets();
    await user.click(screen.getByRole("button", { name: /Brand portal/ }));
    const dialog = within(screen.getByRole("dialog", { name: "Brand portal" }));
    expect(dialog.getByRole("link", { name: "Open link" })).toHaveAttribute(
      "href",
      "https://example.com/portal",
    );
    expect(dialog.queryByRole("button", { name: "Download file" })).not.toBeInTheDocument();
  });
});

describe("Brand asset bulk upload and details", () => {
  const image = (name: string) => new File(["pixels"], name, { type: "image/png" });

  it("adds every dropped file to the open folder, named after the file", async () => {
    const user = userEvent.setup();
    mountAssets();
    await user.click(folderTile("Campaign"));
    const zone = document.querySelector(".brand-drop-zone")!;
    const files = [image("summer_hero-01.png"), image("summer-detail.png")];
    fireEvent.drop(zone, { dataTransfer: { files, types: ["Files"] } });
    await waitFor(() => expect(fixture.insert).toHaveBeenCalledTimes(2));
    expect(fixture.upload).toHaveBeenCalledTimes(2);
    expect(fixture.insert.mock.calls.map(([, input]) => input)).toEqual([
      expect.objectContaining({
        name: "summer hero 01",
        category: "Photography",
        folderId: "campaign",
        description: "",
        tags: [],
      }),
      expect.objectContaining({ name: "summer detail", folderId: "campaign" }),
    ]);
    expect(await screen.findByText("2 files added.")).toBeInTheDocument();
  });

  it("lists a file that could not be added and keeps the others", async () => {
    mountAssets();
    const zone = document.querySelector(".brand-drop-zone")!;
    const files = [new File(["x"], "notes.txt", { type: "text/plain" }), image("mark.png")];
    fireEvent.drop(zone, { dataTransfer: { files, types: ["Files"] } });
    expect(await screen.findByText(/1 of 2 added\. 1 could not be added\./)).toBeInTheDocument();
    expect(screen.getByText(/notes\.txt:/)).toBeInTheDocument();
    expect(fixture.insert).toHaveBeenCalledTimes(1);
  });

  it("lets the agency edit an asset's details from its dialog", async () => {
    const user = userEvent.setup();
    mountAssets();
    await user.click(folderTile("Logos"));
    await user.click(screen.getByRole("button", { name: /Approved mark/ }));
    await user.click(screen.getByRole("button", { name: "Edit details" }));
    const name = screen.getByRole("textbox", { name: "Asset name" });
    await user.clear(name);
    await user.type(name, "Primary mark");
    await user.type(screen.getByRole("textbox", { name: /^Tags/ }), "print, approved");
    await user.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() =>
      expect(fixture.update).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          id: "logo",
          name: "Primary mark",
          category: "Logo",
          tags: ["print", "approved"],
        }),
      ),
    );
  });

  it("offers no detail editing to a client", async () => {
    fixture.role = "client";
    const user = userEvent.setup();
    mountAssets();
    await user.click(folderTile("Logos"));
    await user.click(screen.getByRole("button", { name: /Approved mark/ }));
    expect(screen.queryByRole("button", { name: "Edit details" })).not.toBeInTheDocument();
  });
});
