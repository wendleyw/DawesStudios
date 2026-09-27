import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectCover } from "./project-data";

const auth = vi.hoisted(() => ({
  session: { user: { id: "viewer-a" } },
  database: { storage: { from: vi.fn() }, from: vi.fn() },
}));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));
const clients: QueryClient[] = [];
let sign: ReturnType<typeof vi.fn>;
let coverMaybeSingle: ReturnType<typeof vi.fn>;
let coverEq: ReturnType<typeof vi.fn>;
let coverSelect: ReturnType<typeof vi.fn>;

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
  coverMaybeSingle = vi.fn(async () => ({ data: null, error: null }));
  coverEq = vi.fn().mockReturnValue({ maybeSingle: coverMaybeSingle });
  coverSelect = vi.fn().mockReturnValue({ eq: coverEq });
  auth.database.from.mockReturnValue({ select: coverSelect });
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

describe("project cover activation", () => {
  it("resolves to null without signing when no cover row is readable by this session", async () => {
    const { wrapper } = environment();
    const { result } = renderHook(() => useProjectCover("project-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(coverSelect).toHaveBeenCalledWith("storage_path,client_visible,updated_at");
    expect(coverEq).toHaveBeenCalledWith("project_id", "project-1");
    expect(sign).not.toHaveBeenCalled();
  });

  it("signs the stored path from the project-covers bucket when a row is readable", async () => {
    coverMaybeSingle.mockResolvedValue({
      data: {
        project_id: "project-1",
        storage_path: "project-1/cover.png",
        client_visible: true,
        updated_at: "2026-09-27T00:00:00Z",
      },
      error: null,
    });
    const { wrapper } = environment();
    const { result } = renderHook(() => useProjectCover("project-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      storagePath: "project-1/cover.png",
      clientVisible: true,
      url: "signed-for-viewer-a",
    });
    expect(auth.database.storage.from).toHaveBeenCalledWith("project-covers");
    expect(sign).toHaveBeenCalledWith("project-1/cover.png", 300);
  });
});
