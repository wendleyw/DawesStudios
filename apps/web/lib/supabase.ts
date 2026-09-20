import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@database";

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

export function assertResult<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
