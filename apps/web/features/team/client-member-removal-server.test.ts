import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/clients/[clientId]/members/[profileId]/remove/route";

const clientId = "11111111-2222-4333-8444-555555555555";
const personId = "01234567-89ab-cdef-0123-456789abcdef";
let role: "agency" | "client";
let deactivates: boolean;
let failBan: boolean;
let failCompletion: boolean;
let removed: boolean;
let banned: boolean;
let completed: boolean;
let calls: string[];

beforeEach(() => {
  role = "agency";
  deactivates = true;
  failBan = false;
  failCompletion = false;
  removed = false;
  banned = false;
  completed = false;
  calls = [];
  vi.stubEnv("APP_ORIGIN", "https://studio.example.test");
  vi.stubEnv("SUPABASE_INTERNAL_URL", "https://database.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  // Exercise the real SDK and the route, replacing only their HTTP boundary.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      calls.push(`${request.method} ${url.pathname}`);
      if (url.pathname === "/auth/v1/user")
        return Response.json({ id: "caller", email: "caller@example.test" });
      if (url.pathname === "/rest/v1/profiles" && request.method === "GET") {
        expect(url.searchParams.get("removed_at")).toBe("is.null");
        return Response.json({ role });
      }
      if (url.pathname === "/rest/v1/rpc/remove_client_member") {
        expect(request.headers.get("authorization")).toBe("Bearer caller-token");
        expect(await request.json()).toEqual({ p_client_id: clientId, p_profile_id: personId });
        removed = true;
        return Response.json(deactivates);
      }
      if (url.pathname === `/auth/v1/admin/users/${personId}`) {
        expect(removed).toBe(true);
        expect(request.headers.get("authorization")).toBe("Bearer service-key");
        if (failBan) return Response.json({ msg: "Account service unavailable" }, { status: 400 });
        banned = true;
        return Response.json({ id: personId });
      }
      if (url.pathname === "/rest/v1/profiles" && request.method === "PATCH") {
        expect(banned).toBe(true);
        expect(url.searchParams.get("id")).toBe(`eq.${personId}`);
        expect(url.searchParams.get("removed_at")).toBe("not.is.null");
        if (failCompletion)
          return Response.json({ message: "Completion write unavailable" }, { status: 500 });
        completed = true;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function remove(
  headers: Record<string, string> = {},
  ids: { clientId: string; profileId: string } = { clientId, profileId: personId },
) {
  return POST(
    new Request(
      `https://studio.example.test/api/clients/${ids.clientId}/members/${ids.profileId}/remove`,
      { method: "POST", headers: { authorization: "Bearer caller-token", ...headers } },
    ),
    { params: Promise.resolve(ids) },
  );
}

describe("client removal server", () => {
  it("blocks sign-in only after removing the person's last client", async () => {
    const response = await remove();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: true, deactivated: true });
    expect({ removed, banned, completed }).toEqual({
      removed: true,
      banned: true,
      completed: true,
    });
  });

  it("leaves the account alone when the person still belongs to another client", async () => {
    deactivates = false;
    const response = await remove();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: true, deactivated: false });
    expect(banned).toBe(false);
    expect(calls.some((call) => call.includes("/admin/"))).toBe(false);
  });

  it("leaves a durable pending removal when the sign-in block fails and can retry", async () => {
    failBan = true;
    const failed = await remove();
    expect(failed.status).toBe(502);
    expect((await failed.json()).error).toContain("Try again");
    expect({ removed, banned, completed }).toEqual({
      removed: true,
      banned: false,
      completed: false,
    });
    failBan = false;
    expect((await remove()).status).toBe(200);
    expect(completed).toBe(true);
  });

  it("does not report success until the completion marker is persisted", async () => {
    failCompletion = true;
    expect((await remove()).status).toBe(502);
    expect({ removed, banned, completed }).toEqual({
      removed: true,
      banned: true,
      completed: false,
    });
    failCompletion = false;
    expect((await remove()).status).toBe(200);
    expect(completed).toBe(true);
  });

  it("refuses anyone but the studio before any privileged operation", async () => {
    role = "client";
    expect((await remove()).status).toBe(403);
    expect(removed).toBe(false);
    expect(calls.some((call) => call.includes("/admin/") || call.includes("/rpc/"))).toBe(false);
  });

  it.each([
    [
      "foreign origin",
      { origin: "https://unrelated.example.test" },
      { clientId, profileId: personId },
      403,
    ],
    ["missing session", { authorization: "" }, { clientId, profileId: personId }, 401],
    ["invalid client", {}, { clientId: "not-an-id", profileId: personId }, 400],
    ["invalid person", {}, { clientId, profileId: "not-an-id" }, 400],
  ] as const)("rejects %s before contacting the backend", async (_case, headers, ids, status) => {
    expect((await remove(headers, ids)).status).toBe(status);
    expect(calls).toEqual([]);
  });
});
