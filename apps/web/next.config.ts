import type { NextConfig } from "next";
import path from "node:path";

/**
 * One configured origin's CSP source, or none.
 *
 * Build-time config, not a request handler: there is no caller to answer with a 503 the way the
 * invitation and team-removal routes do when their own env vars are absent (see
 * `app/api/invitations/route.ts`). Falling back to no extra origin — the directive still carries
 * `'self'` — keeps an unconfigured build usable instead of failing it outright, the same choice
 * `ApplicationProviders` makes at runtime (`features/auth/auth-provider.tsx`) when it renders
 * "Workspace unavailable" rather than crashing. A `console.warn` keeps the gap from being silent.
 * An invalid URL is treated the same way, and never reaches the header as the literal text
 * "undefined".
 */
function originFor(name: string, value: string | undefined): string | undefined {
  if (!value) {
    console.warn(
      `[next.config] ${name} is not set; its origin is left out of the Content-Security-Policy.`,
    );
    return undefined;
  }
  try {
    return new URL(value).origin;
  } catch {
    console.warn(
      `[next.config] ${name}="${value}" is not a valid URL; its origin is left out of the Content-Security-Policy.`,
    );
    return undefined;
  }
}

/** Supabase Realtime connects over WebSocket at the same origin: http(s) -> ws(s), nothing else changes. */
function websocketOrigin(origin: string): string {
  return origin.replace(/^http/, "ws");
}

/**
 * Builds the Content-Security-Policy value from the build-time Supabase and media origins.
 *
 * Verified against the app's actual runtime endpoints (`rg` across `apps/web/app` and
 * `apps/web/features`), not just the two known services:
 * - `connect-src` needs the Supabase origin for PostgREST/Auth/Storage `fetch` calls (e.g.
 *   `features/projects/artwork-files.ts`'s TUS resumable endpoint at
 *   `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`) and its `ws:`/`wss:` equivalent for
 *   `features/projects/project-events.ts`'s Realtime channel, plus the media origin for
 *   `features/projects/media-client.ts`'s direct `fetch` calls to `NEXT_PUBLIC_MEDIA_URL`.
 * - `img-src`/`media-src` need both origins: `<img>`/`<video>` sources throughout
 *   `features/brand`, `features/workspace` and `features/projects` are short-lived Supabase Storage
 *   `createSignedUrl` results (see `brand-data.ts`, `workspace-data.ts`, `project-data.ts`).
 * - `font-src 'self' data:` is enough: `next/font/google` (`app/layout.tsx`) self-hosts Geist at
 *   build time, so nothing fetches fonts.googleapis.com/fonts.gstatic.com at runtime.
 * - No other external origin appears anywhere in `apps/web` (no analytics, no other CDN).
 */
export function buildContentSecurityPolicy(env: NodeJS.ProcessEnv = process.env): string {
  const supabaseOrigin = originFor("NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL);
  const mediaOrigin = originFor("NEXT_PUBLIC_MEDIA_URL", env.NEXT_PUBLIC_MEDIA_URL);
  const supabaseWs = supabaseOrigin ? websocketOrigin(supabaseOrigin) : undefined;
  const isDevelopment = env.NODE_ENV === "development";
  const directives: [string, (string | undefined)[]][] = [
    ["default-src", ["'self'"]],
    // The App Router's inline hydration bootstrap (`self.__next_f.push(...)`) runs on every page
    // this build prerenders statically. 'unsafe-inline' is only removable once every page carries
    // a per-request nonce threaded through middleware/`headers()`, which a statically prerendered
    // build cannot do.
    ["script-src", ["'self'", "'unsafe-inline'", isDevelopment ? "'unsafe-eval'" : undefined]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", supabaseOrigin, mediaOrigin]],
    ["media-src", ["'self'", "blob:", supabaseOrigin, mediaOrigin]],
    ["connect-src", ["'self'", supabaseOrigin, supabaseWs, mediaOrigin]],
    ["font-src", ["'self'", "data:"]],
    ["worker-src", ["'self'", "blob:"]],
    ["frame-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
  return directives
    .map(
      ([directive, sources]) =>
        `${directive} ${sources.filter((source): source is string => !!source).join(" ")}`,
    )
    .join("; ");
}

/** The response headers every route gets. HSTS is added only for a production build/start. */
export function buildSecurityHeaders(
  env: NodeJS.ProcessEnv = process.env,
): { key: string; value: string }[] {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(env) },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
  if (env.NODE_ENV === "production")
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  return headers;
}

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep the development overlay from covering the mobile board toolbar.
  devIndicators: false,
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders(),
      },
    ];
  },
  // Project instructions are maintained in the repository-root AGENTS.md and CLAUDE.md.
  agentRules: false,
};

export default nextConfig;
