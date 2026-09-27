import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  initialUploadProject,
  useAssetPreviews,
  useProjectAssets,
  type ProjectAsset,
} from "./asset-data";

const storage = vi.hoisted(() => ({ createSignedUrls: vi.fn(), from: vi.fn(), table: vi.fn() }));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    database: { from: storage.table, storage: { from: storage.from } },
    session: { user: { id: "viewer" } },
    profile: { role: "agency" },
  }),
}));

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

function asset(id: string, bucket: ProjectAsset["bucket"], mime: string): ProjectAsset {
  return {
    id,
    name: id,
    projectId: "project-1",
    path: `project-1/${id}`,
    bucket,
    mime,
    size: 1,
    date: "2026-09-23T12:00:00Z",
    category: bucket === "delivery-files" ? "Delivery" : "Working file",
    approved: false,
  };
}

describe("Files grid previews", () => {
  it("signs raster images only, one request per bucket, for ten minutes", async () => {
    storage.createSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
      error: null,
    }));
    storage.from.mockImplementation(() => ({ createSignedUrls: storage.createSignedUrls }));
    const files = [
      asset("working.png", "internal-assets", "image/png"),
      asset("delivery.jpg", "delivery-files", "image/jpeg"),
      asset("guide.pdf", "delivery-files", "application/pdf"),
      asset("cut.mp4", "internal-assets", "video/mp4"),
      asset("mark.svg", "internal-assets", "image/svg+xml"),
    ];
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAssetPreviews(files), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      "internal-assets:working.png": "https://signed/project-1/working.png",
      "delivery-files:delivery.jpg": "https://signed/project-1/delivery.jpg",
    });
    expect(storage.from.mock.calls.map(([bucket]) => bucket).sort()).toEqual([
      "delivery-files",
      "internal-assets",
    ]);
    expect(storage.createSignedUrls).toHaveBeenCalledWith(["project-1/working.png"], 600);
  });
});

describe("useProjectAssets", () => {
  it("lists working files and deliveries only, never a design copy", async () => {
    const file = (id: string) => ({
      id,
      name: id,
      project_id: "project-1",
      storage_path: `project-1/${id}.pdf`,
      mime_type: "application/pdf",
      file_size: 3,
      created_at: id === "final" ? "2026-09-24T00:00:00Z" : "2026-09-23T00:00:00Z",
    });
    const rows: Record<string, unknown[]> = {
      projects: [
        {
          id: "project-1",
          title: "Launch",
          status: "approved",
          campaign_id: null,
          campaigns: null,
        },
      ],
      delivery_files: [file("final")],
      project_assets: [file("working")],
      project_drive_links: [
        {
          project_id: "project-1",
          channel: "internal",
          url: "https://drive.google.com/drive/folders/internal",
        },
        {
          project_id: "project-1",
          channel: "client",
          url: "https://drive.google.com/drive/folders/1",
        },
      ],
    };
    storage.table.mockImplementation((table: string) => {
      let matchingRows = rows[table];
      const chain: {
        select: () => typeof chain;
        eq: (column: string, value: string) => typeof chain;
        in: () => typeof chain;
        then: Promise<{ data: unknown[]; error: null }>["then"];
      } = {
        select: () => chain,
        eq: (column, value) => {
          if (table === "project_drive_links") {
            matchingRows = matchingRows.filter(
              (row) => (row as Record<string, unknown>)[column] === value,
            );
          }
          return chain;
        },
        in: () => chain,
        then: (...args) => Promise.resolve({ data: matchingRows, error: null }).then(...args),
      };
      return chain;
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useProjectAssets("client-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(
      result.current.data?.assets.map((item) => [item.id, item.category, item.bucket]),
    ).toEqual([
      ["final", "Delivery", "delivery-files"],
      ["working", "Working file", "internal-assets"],
    ]);
    expect(storage.table.mock.calls.map(([table]) => table).toSorted()).toEqual([
      "delivery_files",
      "project_assets",
      "project_drive_links",
      "projects",
    ]);
    expect(result.current.data?.projects[0].driveUrl).toBe(
      "https://drive.google.com/drive/folders/1",
    );
  });
});
