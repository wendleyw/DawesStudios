import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useProjectArtwork } from "./board-data";

const auth = vi.hoisted(() => ({
  database: {},
  session: { user: { id: "viewer" } },
  profile: { role: "agency" },
}));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));

/** A `.select().in().not()` chain resolving to the given deliverable rows. */
function deliverablesTable(rows: unknown[]) {
  const not = vi.fn().mockResolvedValue({ data: rows, error: null });
  const inFn = vi.fn().mockReturnValue({ not });
  return { select: vi.fn().mockReturnValue({ in: inFn }) };
}

/** A `.select().in()` chain resolving to the given `project_covers` rows: no `.not()`, since the
 * covers query filters nothing but the project id list — row-level security already did the rest. */
function coversTable(rows: { project_id: string; storage_path: string }[]) {
  const inFn = vi.fn().mockResolvedValue({ data: rows, error: null });
  return { select: vi.fn().mockReturnValue({ in: inFn }) };
}

function stubDatabase(
  deliverableRows: unknown[],
  coverRows: { project_id: string; storage_path: string }[],
) {
  const from = vi.fn((table: string) =>
    table === "project_covers" ? coversTable(coverRows) : deliverablesTable(deliverableRows),
  );
  const createSignedUrls = vi.fn().mockImplementation((paths: string[]) =>
    Promise.resolve({
      data: paths.map((path) => ({ path, signedUrl: `https://private.test/${path}` })),
      error: null,
    }),
  );
  const bucket = vi.fn().mockReturnValue({ createSignedUrls });
  auth.database = { from, storage: { from: bucket } };
  return { from, bucket, createSignedUrls };
}

function renderArtwork(ids: string[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useProjectArtwork(ids), { wrapper });
  return { ...rendered, queryClient };
}

describe("board video artwork", () => {
  for (const role of ["agency", "designer", "client"])
    it(`keeps ${role} video versions without signing movies as images`, async () => {
      auth.profile.role = role;
      const client = role === "client";
      const rows = ["mp4", "png"].map((extension, index) => ({
        id: `deliverable-${index}`,
        project_id: `project-${index}`,
        format: "square",
        sort_order: 0,
        [client ? "published_versions" : "design_versions"]: [
          {
            version_number: 2,
            [client ? "published_designs" : "designs"]: [
              {
                id: `design-${index}`,
                sort_order: 0,
                [client ? "asset_path" : "internal_asset_path"]:
                  `project-${index}/asset.${extension}`,
              },
            ],
          },
        ],
      }));
      const { bucket, createSignedUrls } = stubDatabase(rows, []);
      const { result, unmount, queryClient } = renderArtwork(["project-0", "project-1"]);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(createSignedUrls).toHaveBeenCalledWith(["project-1/asset.png"], 600);
      expect(bucket).toHaveBeenCalledWith(client ? "published-assets" : "internal-assets");
      expect(result.current.data?.["project-0"]).toMatchObject({
        url: null,
        version: 2,
        isVideo: true,
      });
      expect(result.current.data?.["project-1"]).toMatchObject({
        url: "https://private.test/project-1/asset.png",
        version: 2,
      });
      unmount();
      queryClient.clear();
    });
});

describe("board cover artwork", () => {
  function deliverableRow(projectId: string, assetPath: string) {
    return {
      id: `deliverable-${projectId}`,
      project_id: projectId,
      format: "square",
      sort_order: 0,
      design_versions: [
        {
          version_number: 3,
          designs: [{ id: `design-${projectId}`, sort_order: 0, internal_asset_path: assetPath }],
        },
      ],
    };
  }

  for (const role of ["agency", "designer", "client"])
    it(`prefers a readable cover over the legacy design for ${role}, and drops the version label`, async () => {
      auth.profile.role = role;
      const rows = [
        deliverableRow("project-1", "project-1/design.png"),
        deliverableRow("project-2", "project-2/design.png"),
      ].map((row) =>
        role === "client"
          ? {
              ...row,
              published_versions: row.design_versions.map((version) => ({
                version_number: version.version_number,
                published_designs: version.designs.map((design) => ({
                  id: design.id,
                  sort_order: design.sort_order,
                  asset_path: design.internal_asset_path,
                })),
              })),
              design_versions: undefined,
            }
          : row,
      );
      const coverRows = [
        { project_id: "project-1", storage_path: "project-covers/project-1/cover.png" },
      ];
      const { createSignedUrls } = stubDatabase(rows, coverRows);
      const { result, unmount, queryClient } = renderArtwork(["project-1", "project-2"]);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // The cover wins for project-1: its image comes from the covers bucket and carries no
      // version, even though project-1 also has a legacy design.
      expect(result.current.data?.["project-1"]).toMatchObject({
        url: "https://private.test/project-covers/project-1/cover.png",
        version: null,
      });
      expect(createSignedUrls).toHaveBeenCalledWith(["project-covers/project-1/cover.png"], 600);
      // project-2 has no cover, so today's rule still applies.
      expect(result.current.data?.["project-2"]).toMatchObject({
        url: "https://private.test/project-2/design.png",
        version: 3,
      });
      expect(createSignedUrls).toHaveBeenCalledWith(["project-2/design.png"], 600);
      unmount();
      queryClient.clear();
    });

  it("reads project_covers with the same query for every role, unlike the split deliverable reads", async () => {
    auth.profile.role = "client";
    const rows = [deliverableRow("project-1", "project-1/design.png")].map((row) => ({
      ...row,
      published_versions: [],
      design_versions: undefined,
    }));
    const { from } = stubDatabase(rows, []);
    const { result, unmount, queryClient } = renderArtwork(["project-1"]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(from).toHaveBeenCalledWith("project_covers");
    // A client never gets internal art: with no cover and no published design, the card has none.
    expect(result.current.data?.["project-1"]).toMatchObject({ url: null, version: null });
    unmount();
    queryClient.clear();
  });
});
