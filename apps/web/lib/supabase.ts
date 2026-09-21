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

export function assertResult<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error)
    throw new Error(
      isTransportFailure(result.error.message) ? TRANSPORT_FAILURE_MESSAGE : result.error.message,
    );
  return result.data as T;
}
