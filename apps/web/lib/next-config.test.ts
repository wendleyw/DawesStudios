import { describe, expect, it, vi } from "vitest";
import nextConfig, { buildContentSecurityPolicy, buildSecurityHeaders } from "../next.config";

// `vitest.config.ts` only discovers `features/**` and `lib/**`, so this test lives here rather
// than beside `next.config.ts` at the project root.

const configured = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55421",
  NEXT_PUBLIC_MEDIA_URL: "http://127.0.0.1:55430",
} as NodeJS.ProcessEnv;

describe("buildContentSecurityPolicy", () => {
  it("scopes every remote directive to the configured Supabase and media origins", () => {
    const csp = buildContentSecurityPolicy(configured);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(
      "img-src 'self' data: blob: http://127.0.0.1:55421 http://127.0.0.1:55430",
    );
    expect(csp).toContain("media-src 'self' blob: http://127.0.0.1:55421 http://127.0.0.1:55430");
    // The Supabase origin appears twice in connect-src: once for REST/Auth/Storage fetch (TUS
    // resumable uploads included) and once as its ws: equivalent for the Realtime channel.
    expect(csp).toContain(
      "connect-src 'self' http://127.0.0.1:55421 ws://127.0.0.1:55421 http://127.0.0.1:55430",
    );
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain(
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    );
  });

  it("keeps 'unsafe-eval' out of script-src for a production build", () => {
    const csp = buildContentSecurityPolicy(configured);
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("adds 'unsafe-eval' to script-src only in development", () => {
    const csp = buildContentSecurityPolicy({ ...configured, NODE_ENV: "development" });
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });

  it("falls back to 'self' only, and warns, when an origin is not configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const csp = buildContentSecurityPolicy({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).not.toMatch(/connect-src 'self' \S/);
    expect(csp).not.toContain("undefined");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("NEXT_PUBLIC_SUPABASE_URL"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("NEXT_PUBLIC_MEDIA_URL"));
  });

  it("falls back the same way, and warns, for a value that is not a valid URL", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const csp = buildContentSecurityPolicy({
      ...configured,
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
    });
    expect(csp).not.toContain("undefined");
    expect(csp).not.toContain("not-a-url");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not-a-url"));
  });
});

describe("buildSecurityHeaders", () => {
  it("adds Strict-Transport-Security only for a production build", () => {
    const prodKeys = buildSecurityHeaders(configured).map((header) => header.key);
    expect(prodKeys).toContain("Strict-Transport-Security");
    const devKeys = buildSecurityHeaders({ ...configured, NODE_ENV: "development" }).map(
      (header) => header.key,
    );
    expect(devKeys).not.toContain("Strict-Transport-Security");
  });

  it("keeps every pre-existing header alongside the new ones", () => {
    const keys = buildSecurityHeaders(configured).map((header) => header.key);
    expect(keys).toEqual([
      "X-Content-Type-Options",
      "Referrer-Policy",
      "X-Frame-Options",
      "Content-Security-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]);
  });
});

describe("next.config wiring", () => {
  it("disables the X-Powered-By header", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("serves buildSecurityHeaders()'s output to every route", async () => {
    const result = await nextConfig.headers!();
    expect(result).toEqual([{ source: "/(.*)", headers: buildSecurityHeaders() }]);
  });
});
