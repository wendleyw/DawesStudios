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
          mutations: { retry: false },
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
