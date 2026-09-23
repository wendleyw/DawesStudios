import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDesignAssetUrl } from "./project-data";

const auth = vi.hoisted(() => ({
  session: { user: { id: "viewer-a" } },
  database: { storage: { from: vi.fn() } },
}));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));
const clients: QueryClient[] = [];
let sign: ReturnType<typeof vi.fn>;

function environment() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.session = { user: { id: "viewer-a" } };
  sign = vi.fn(async () => ({
    data: { signedUrl: `signed-for-${auth.session.user.id}` },
    error: null,
  }));
  auth.database.storage.from.mockReturnValue({ createSignedUrl: sign });
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

describe("design asset URL activation", () => {
  it("does not sign a disabled video thumbnail, including query invalidation", async () => {
    const { client, wrapper } = environment();
    const { result, rerender } = renderHook(
      ({ enabled }) => useDesignAssetUrl("project/video.mp4", "internal", enabled),
      { initialProps: { enabled: false }, wrapper },
    );
    expect(result.current.fetchStatus).toBe("idle");
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["asset-url"] });
    });
    expect(sign).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledWith("project/video.mp4", 3600);
    expect(auth.database.storage.from).toHaveBeenCalledWith("internal-assets");
  });

  it("keeps default activation and client-channel image signing unchanged", async () => {
    const { wrapper } = environment();
    const { result } = renderHook(() => useDesignAssetUrl("project/image.png", "client"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sign).toHaveBeenCalledWith("project/image.png", 300);
    expect(auth.database.storage.from).toHaveBeenCalledWith("published-assets");
  });

  it("keeps signed URL cache entries scoped to the current user", async () => {
    const { wrapper } = environment();
    const { result, rerender } = renderHook(
      () => useDesignAssetUrl("project/video.mp4", "client"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBe("signed-for-viewer-a"));
    auth.session = { user: { id: "viewer-b" } };
    rerender();
    expect(result.current.data).not.toBe("signed-for-viewer-a");
    await waitFor(() => expect(result.current.data).toBe("signed-for-viewer-b"));
    expect(sign).toHaveBeenCalledTimes(2);
  });
});
