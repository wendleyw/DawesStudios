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
      const not = vi.fn().mockResolvedValue({ data: rows, error: null });
      const select = vi.fn().mockReturnValue({ in: vi.fn().mockReturnValue({ not }) });
      const createSignedUrls = vi.fn().mockResolvedValue({
        data: [{ path: "project-1/asset.png", signedUrl: "https://private.test/image" }],
        error: null,
      });
      const bucket = vi.fn().mockReturnValue({ createSignedUrls });
      auth.database = { from: vi.fn().mockReturnValue({ select }), storage: { from: bucket } };
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      const { result, unmount } = renderHook(() => useProjectArtwork(["project-0", "project-1"]), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(createSignedUrls).toHaveBeenCalledWith(["project-1/asset.png"], 600);
      expect(bucket).toHaveBeenCalledWith(client ? "published-assets" : "internal-assets");
      expect(result.current.data?.["project-0"]).toMatchObject({
        url: null,
        version: 2,
        isVideo: true,
      });
      expect(result.current.data?.["project-1"]).toMatchObject({
        url: "https://private.test/image",
        version: 2,
      });
      unmount();
      queryClient.clear();
    });
});
