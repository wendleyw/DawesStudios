import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@database";

export type SupabaseDatabase = SupabaseClient<Database>;

export type PublicConfiguration = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  mediaUrl: string;
};
export type Role = "agency" | "client" | "designer";
export type Profile = { id: string; display_name: string; role: Role; avatar_url: string | null };

let browserClient: { url: string; key: string; client: SupabaseClient<Database> } | undefined;

export function createBrowserDatabase(configuration: PublicConfiguration) {
  if (
    typeof window !== "undefined" &&
    browserClient?.url === configuration.supabaseUrl &&
    browserClient.key === configuration.supabaseAnonKey
  )
    return browserClient.client;
  const client = createClient<Database>(configuration.supabaseUrl, configuration.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  // Reuse one browser auth client across React remounts; never share server sessions.
  if (typeof window !== "undefined")
    browserClient = { url: configuration.supabaseUrl, key: configuration.supabaseAnonKey, client };
  return client;
}

/**
 * A request that never reached the server. Both Chromium/Firefox (`TypeError: Failed to fetch`)
 * and Safari (`TypeError: Load failed`) throw this at the `fetch` call itself, before anything
 * resembling a Supabase or Postgres error exists; supabase-js catches that rejection and carries
 * the raw exception text — name and all — into `result.error.message` unchanged. Left alone, that
 * is what a person reads when their connection drops mid-save.
 */
function isTransportFailure(message: string): boolean {
  return /(?:^|:\s)(failed to fetch|load failed)$/i.test(message.trim());
}

const TRANSPORT_FAILURE_MESSAGE =
  "The connection failed and your changes were not saved — try again.";

/**
 * The sentence to show a person for a failed Supabase call.
 *
 * `assertResult` covers every read and write that goes through a `features/*-data.ts` module, but
 * the Auth calls do not: `signInWithPassword`, `updateUser` and `resetPasswordForEmail` are awaited
 * directly in their components, which then render `result.error.message`. Offline, that put a bare
 * `Failed to fetch` in front of someone whose connection had dropped — the browser's words for a
 * request that never left the machine, in a place reserved for telling them what to do next.
 *
 * Exported so those call sites share this decision rather than each re-deriving it, and so there is
 * one place to add a case when a new class of unreadable error turns up.
 */
export function describeSupabaseError(error: { message: string }): string {
  return isTransportFailure(error.message) ? TRANSPORT_FAILURE_MESSAGE : error.message;
}

/**
 * How long an Auth call may sit before it is reported as a transport failure.
 *
 * `signInWithPassword` rejects promptly when the network is down, but `updateUser` does not: it
 * refreshes the session first, and that refresh retries internally, so offline it never settles.
 * Measured against a live build with the network cut: the password form sat on "Updating…" with its
 * button disabled for more than 25 seconds, showing nothing — a failed write with no failure, which
 * is worse than a blunt message because there is nothing to act on and no way to tell it from a
 * slow connection.
 *
 * Twenty seconds is chosen to be longer than any healthy round trip on a poor connection and short
 * enough that a person is told rather than left. It bounds the wait; it does not cancel the request,
 * because an Auth write that did reach the server must not be reported as never having happened.
 */
const AUTH_CALL_TIMEOUT_MS = 20_000;

export async function callAuth<T extends { error: { message: string } | null }>(
  call: Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      call,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(TRANSPORT_FAILURE_MESSAGE)),
          AUTH_CALL_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function assertResult<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(describeSupabaseError(result.error));
  return result.data as T;
}
