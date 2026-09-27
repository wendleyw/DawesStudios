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

/** A `.select().in()` chain resolving to the given rows. */
function table(rows: unknown[]) {
  const inFn = vi.fn().mockResolvedValue({ data: rows, error: null });
  const select = vi.fn().mockReturnValue({ in: inFn });
  return { select };
}

function stubDatabase(
  deliverableRows: unknown[],
  coverRows: { project_id: string; storage_path: string }[],
  signedPaths?: string[],
) {
  const tables = { deliverables: table(deliverableRows), project_covers: table(coverRows) };
  const from = vi.fn((name: keyof typeof tables) => tables[name]);
  const createSignedUrls = vi.fn().mockImplementation((paths: string[]) =>
    Promise.resolve({
      data: paths
        .filter((path) => !signedPaths || signedPaths.includes(path))
        .map((path) => ({ path, signedUrl: `https://private.test/${path}` })),
      error: null,
    }),
  );
  const bucket = vi.fn().mockReturnValue({ createSignedUrls });
  auth.database = { from, storage: { from: bucket } };
  return { from, tables, bucket, createSignedUrls };
}

function renderArtwork(ids: string[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useProjectArtwork(ids), { wrapper });
  return { ...rendered, queryClient };
}

const deliverables = ["project-1", "project-2"].map((projectId) => ({
  id: `deliverable-${projectId}`,
  project_id: projectId,
  format: "square",
  sort_order: 0,
}));

describe("board cover artwork", () => {
  for (const role of ["agency", "designer", "client"])
    it(`shows the readable cover, otherwise the placeholder, for ${role}`, async () => {
      auth.profile.role = role;
      const { tables, bucket, createSignedUrls } = stubDatabase(deliverables, [
        { project_id: "project-1", storage_path: "project-1/cover.png" },
      ]);
      const { result, unmount, queryClient } = renderArtwork(["project-1", "project-2"]);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual({
        "project-1": { url: "https://private.test/project-1/cover.png", typeLabel: "Square" },
        "project-2": { url: null, typeLabel: "Square" },
      });
      // Only the covers bucket is ever signed, and the deliverable read names scope columns only.
      expect(bucket).toHaveBeenCalledTimes(1);
      expect(bucket).toHaveBeenCalledWith("project-covers");
      expect(createSignedUrls).toHaveBeenCalledWith(["project-1/cover.png"], 600);
      expect(tables.deliverables.select).toHaveBeenCalledWith("id, project_id, format, sort_order");
      expect(tables.project_covers.select).toHaveBeenCalledWith("project_id, storage_path");
      unmount();
      queryClient.clear();
    });

  it("falls back to the placeholder when the cover's signature is missing", async () => {
    auth.profile.role = "agency";
    stubDatabase(
      deliverables,
      [{ project_id: "project-1", storage_path: "project-1/cover.png" }],
      [],
    );
    const { result, unmount, queryClient } = renderArtwork(["project-1"]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.["project-1"]).toEqual({ url: null, typeLabel: "Square" });
    unmount();
    queryClient.clear();
  });

  it("signs nothing when no project has a cover", async () => {
    auth.profile.role = "client";
    const { bucket } = stubDatabase(deliverables, []);
    const { result, unmount, queryClient } = renderArtwork(["project-1", "project-2"]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(bucket).not.toHaveBeenCalled();
    expect(result.current.data?.["project-2"]).toEqual({ url: null, typeLabel: "Square" });
    unmount();
    queryClient.clear();
  });
});
