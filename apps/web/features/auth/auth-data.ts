"use client";

import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { assertResult, type Profile, type SupabaseDatabase } from "@/lib/supabase";

/**
 * The signed-in user's own profile row.
 *
 * Takes `database` and `session` as explicit parameters instead of calling `useAuth()` the way
 * every other feature's read hooks do (see `useCreditAccount` in `credits/credit-data.ts` for that
 * shape). This hook is called from inside `auth-provider.tsx`'s `SessionProvider` — the component
 * that defines and provides `useAuth()` — so calling `useAuth()` here would need a context this
 * component has not produced yet. Relocating only the query itself (same query key, same `enabled`
 * gate, same `select` and `single()`) leaves `SessionProvider`'s `onAuthStateChange` / `getSession`
 * effect, hook call order and `useAuth()` contract unchanged; see `README.md` for the full reasoning
 * behind keeping this one hook paired with the provider rather than moving beside the other
 * features' data modules.
 */
export function useProfile(database: SupabaseDatabase, session: Session | null) {
  return useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      assertResult(
        await database
          .from("profiles")
          .select("id, display_name, role, avatar_url")
          .eq("id", session!.user.id)
          .single(),
      ) as Profile,
  });
}
