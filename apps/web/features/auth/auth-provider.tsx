"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@database";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createBrowserDatabase, type Profile, type PublicConfiguration } from "@/lib/supabase";
import { useProfile } from "./auth-data";

type AuthContextValue = {
  database: SupabaseClient<Database>;
  mediaUrl: string;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: Error | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function ApplicationProviders({
  configuration,
  children,
}: {
  configuration: PublicConfiguration;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
          // Queries pause while the browser is offline by design (nothing to gain from re-fetching
          // against a dead network). Mutations must not: with the default `networkMode: "online"`,
          // @tanstack/react-query pauses a mutation's `fetchStatus` before `mutationFn` ever runs
          // whenever `onlineManager.isOnline()` is false, so a genuinely offline browser (as opposed
          // to a hung request against a server that is merely unreachable) never dispatches the
          // underlying `fetch` at all -- no error, no message, no bound. `networkMode: "always"`
          // makes every mutation always attempt its `mutationFn`; the resulting fast rejection then
          // reaches the existing `assertResult`/`callAuth` translation exactly as a hung request
          // does. See Defect I-6, docs/verification/acceptance-family-i.md.
          mutations: { retry: false, networkMode: "always" },
        },
      }),
  );
  if (!configuration.supabaseUrl || !configuration.supabaseAnonKey) {
    return (
      <main className="centered-state">
        <h1>Workspace unavailable</h1>
        <p>The workspace connection is not ready. Please try again shortly.</p>
      </main>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider configuration={configuration}>{children}</SessionProvider>
    </QueryClientProvider>
  );
}

function SessionProvider({
  configuration,
  children,
}: {
  configuration: PublicConfiguration;
  children: React.ReactNode;
}) {
  const [database] = useState(() => createBrowserDatabase(configuration));
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState<Error | null>(null);
  const lastUserId = useRef<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    const {
      data: { subscription },
    } = database.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      authEventReceived = true;
      const nextId = nextSession?.user.id ?? null;
      if (lastUserId.current !== nextId) queryClient.clear();
      lastUserId.current = nextId;
      setSession(nextSession);
      setSessionError(null);
      setReady(true);
    });
    database.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return;
      if (error) setSessionError(new Error(error.message));
      setSession(data.session);
      setReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [database, queryClient]);

  const profileQuery = useProfile(database, session);

  return (
    <AuthContext.Provider
      value={{
        database,
        mediaUrl: configuration.mediaUrl,
        session,
        profile: profileQuery.data ?? null,
        loading: !ready || (!!session && profileQuery.isPending),
        error: sessionError ?? profileQuery.error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth requires ApplicationProviders");
  return value;
}
