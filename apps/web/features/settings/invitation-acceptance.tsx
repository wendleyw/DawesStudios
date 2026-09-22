"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { callAuth, describeSupabaseError } from "@/lib/supabase";
import { validatePassword } from "./settings-model";
import { acceptInvitation } from "./settings-data";
import "./settings.css";
import { FormError } from "@/features/shared/form-error";

export function InvitationAcceptance() {
  const { database, session, loading } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = params.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const signIn = useMutation({
    mutationFn: async () => {
      const result = await callAuth(
        database.auth.signInWithPassword({ email: email.trim(), password }),
      );
      if (result.error) throw new Error(describeSupabaseError(result.error));
    },
    onSuccess: () => {
      setPassword("");
      setConfirmation("");
    },
  });
  const accept = useMutation({
    mutationFn: async () => {
      const error = validatePassword(password, confirmation);
      if (error) throw new Error(error);
      const result = await callAuth(database.auth.updateUser({ password }));
      if (result.error) throw new Error(describeSupabaseError(result.error));
      await acceptInvitation(database, { token });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.replace("/home");
    },
  });
  return (
    <main className="account-flow">
      <Link href="/login" className="account-flow-brand">
        <Image
          src="/brand/logo.webp"
          alt="Brianna Dawes Studios"
          width={2409}
          height={619}
          sizes="220px"
        />
      </Link>
      <div className="account-flow-card">
        {loading ? (
          <p role="status">Checking your invitation…</p>
        ) : !/^[a-f0-9]{64}$/i.test(token) ? (
          <>
            <h1>Invitation unavailable.</h1>
            <p>
              Open the full link in your invitation email, or ask the studio for a new invitation.
            </p>
            <Link href="/login" className="button">
              Back to sign in
            </Link>
          </>
        ) : !session ? (
          <>
            <h1>Good work starts here.</h1>
            <p>
              Open your invitation email to confirm your address. If you already have an account,
              sign in with the invited email.
            </p>
            <form
              className="settings-form"
              onSubmit={(event) => {
                event.preventDefault();
                signIn.mutate();
              }}
            >
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {signIn.error && <FormError>{signIn.error.message}</FormError>}
              <button className="button primary" disabled={signIn.isPending}>
                {signIn.isPending ? "Signing in…" : "Sign in to accept"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1>Welcome to the studio.</h1>
            <p>Joining as {session.user.email}. Set your password to complete your invitation.</p>
            <form
              className="settings-form"
              onSubmit={(event) => {
                event.preventDefault();
                accept.mutate();
              }}
            >
              <label>
                Password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              {accept.error && <FormError>{accept.error.message}</FormError>}
              <button className="button primary" disabled={accept.isPending}>
                {accept.isPending ? "Joining…" : "Accept invitation"}
              </button>
            </form>
            <button className="button quiet" onClick={() => void database.auth.signOut()}>
              Use a different account
            </button>
          </>
        )}
      </div>
    </main>
  );
}
