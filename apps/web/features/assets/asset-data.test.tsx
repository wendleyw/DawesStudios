import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initialUploadProject,
  useAssetPreviews,
  useProjectAssets,
  type ProjectAsset,
} from "./asset-data";

const storage = vi.hoisted(() => ({
  createSignedUrls: vi.fn(),
  from: vi.fn(),
  table: vi.fn(),
  role: "agency",
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    database: { from: storage.table, storage: { from: storage.from } },
    session: { user: { id: "viewer" } },
    profile: { role: storage.role },
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
    category: "Delivery",
  };
}

describe("Files grid previews", () => {
  it("does not sign another batch after the query is cancelled", async () => {
    let completeFirstBatch!: () => void;
    storage.createSignedUrls.mockReset().mockImplementation(
      () =>
        new Promise((resolve) => {
          completeFirstBatch = () => resolve({ data: [], error: null });
        }),
    );
    storage.from.mockImplementation(() => ({ createSignedUrls: storage.createSignedUrls }));
    const files = Array.from({ length: 205 }, (_, index) =>
      asset(`image-${index}`, "delivery-files", "image/png"),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { unmount } = renderHook(() => useAssetPreviews(files), { wrapper });
    await waitFor(() => expect(storage.createSignedUrls).toHaveBeenCalledTimes(1));
    await queryClient.cancelQueries({ queryKey: ["asset-previews"] });
    completeFirstBatch();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);
    unmount();
    queryClient.clear();
    storage.createSignedUrls.mockReset();
    storage.from.mockClear();
  });

  it("signs raster images only, in one request, for ten minutes", async () => {
    storage.createSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
      error: null,
    }));
    storage.from.mockImplementation(() => ({ createSignedUrls: storage.createSignedUrls }));
    const files = [
      asset("final.png", "delivery-files", "image/png"),
      asset("delivery.jpg", "delivery-files", "image/jpeg"),
      asset("guide.pdf", "delivery-files", "application/pdf"),
      asset("cut.mp4", "delivery-files", "video/mp4"),
      asset("mark.svg", "delivery-files", "image/svg+xml"),
    ];
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAssetPreviews(files), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      "delivery-files:final.png": "https://signed/project-1/final.png",
      "delivery-files:delivery.jpg": "https://signed/project-1/delivery.jpg",
    });
    expect(storage.from.mock.calls.map(([bucket]) => bucket)).toEqual(["delivery-files"]);
    expect(storage.createSignedUrls).toHaveBeenCalledWith(
      ["project-1/final.png", "project-1/delivery.jpg"],
      600,
    );
  });

  it("signs a large image list in bounded requests", async () => {
    storage.createSignedUrls.mockReset().mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
      error: null,
    }));
    storage.from.mockImplementation(() => ({ createSignedUrls: storage.createSignedUrls }));
    const files = Array.from({ length: 205 }, (_, index) =>
      asset(`image-${index}`, "delivery-files", "image/png"),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useAssetPreviews(files), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(Object.keys(result.current.data ?? {})).toHaveLength(205);
    expect(storage.createSignedUrls.mock.calls.map(([paths]) => paths.length)).toEqual([
      100, 100, 5,
    ]);
  });
});

describe("useProjectAssets", () => {
  beforeEach(() => {
    storage.role = "agency";
    storage.table.mockReset();
  });

  it("lists deliveries only: no working files and no design copy", async () => {
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
        order: () => typeof chain;
        range: () => typeof chain;
        abortSignal: () => typeof chain;
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
        order: () => chain,
        range: () => chain,
        abortSignal: () => chain,
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
    ).toEqual([["final", "Delivery", "delivery-files"]]);
    expect(storage.table.mock.calls.map(([table]) => table).toSorted()).toEqual([
      "delivery_files",
      "project_drive_links",
      "projects",
    ]);
    expect(result.current.data?.projects[0].driveUrl).toBe(
      "https://drive.google.com/drive/folders/1",
    );
  });

  it("loads more than 1,000 client deliveries across bounded project-ID filters", async () => {
    storage.role = "client";
    const projects = Array.from({ length: 101 }, (_, index) => ({
      id: `project-${String(index).padStart(3, "0")}`,
      title: `Project ${index}`,
      status: "approved",
      campaign_id: null,
      campaigns: null,
      client_id: "client-1",
    }));
    const files = Array.from({ length: 1_101 }, (_, index) => ({
      id: `file-${String(index).padStart(4, "0")}`,
      name: `File ${index}`,
      project_id: projects[index % projects.length].id,
      storage_path: `file-${index}`,
      mime_type: "application/pdf",
      file_size: 1,
      created_at: "2026-09-27T00:00:00Z",
    }));
    const filters: {
      table: string;
      ids?: string[];
      range?: [number, number];
      equals: [string, string][];
    }[] = [];
    storage.table.mockImplementation((table: string) => {
      const call: {
        table: string;
        ids?: string[];
        range?: [number, number];
        equals: [string, string][];
      } = { table, equals: [] };
      filters.push(call);
      let rows: Record<string, unknown>[] =
        table === "projects" ? projects : table === "delivery_files" ? files : [];
      const chain = {
        select: () => chain,
        eq: (column: string, value: string) => {
          call.equals.push([column, value]);
          rows = rows.filter((row) => row[column] === value);
          return chain;
        },
        in: (_column: string, ids: string[]) => {
          call.ids = ids;
          rows = rows.filter((row) => ids.includes(row.project_id as string));
          return chain;
        },
        order: () => chain,
        range: (from: number, to: number) => {
          call.range = [from, to];
          return chain;
        },
        abortSignal: () => chain,
        then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
          Promise.resolve({
            data: rows.slice(call.range?.[0] ?? 0, (call.range?.[1] ?? 0) + 1),
            error: null,
          }).then(resolve),
      };
      return chain;
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useProjectAssets("client-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.projects).toHaveLength(101);
    expect(result.current.data?.assets).toHaveLength(1_101);
    expect(storage.table.mock.calls.map(([table]) => table)).not.toContain("project_assets");
    expect(
      filters.filter((call) => call.table === "delivery_files").map((call) => call.ids?.length),
    ).toEqual([100, 100, 100, 1]);
    expect(filters.filter((call) => call.table === "projects").map((call) => call.range)).toEqual([
      [0, 499],
    ]);
    expect(
      filters
        .filter((call) => call.table === "projects")
        .every((call) =>
          call.equals.some(([column, value]) => column === "client_id" && value === "client-1"),
        ),
    ).toBe(true);
    expect(
      filters
        .filter((call) => call.table === "project_drive_links")
        .every((call) =>
          call.equals.some(([column, value]) => column === "channel" && value === "client"),
        ),
    ).toBe(true);
  });
});
