"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { validatePassword } from "./settings-model";
import "./settings.css";

export function AccountRecovery() {
  const { database, session, loading } = useAuth();
  const params = useSearchParams();
  const updating = params.get("mode") === "update";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const send = useMutation({
    mutationFn: async () => {
      const result = await database.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/recovery?mode=update`,
      });
      if (result.error) throw result.error;
    },
  });
  const reset = useMutation({
    mutationFn: async () => {
      const error = validatePassword(password, confirmation);
      if (error) throw new Error(error);
      const result = await database.auth.updateUser({ password });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      setPassword("");
      setConfirmation("");
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
          <p role="status">Checking your session…</p>
        ) : updating && !session ? (
          <>
            <h1>This reset link is unavailable.</h1>
            <p>It may have expired or already been used. Request a fresh link to continue.</p>
            <Link className="button primary" href="/auth/recovery">
              Request a new link
            </Link>
          </>
        ) : updating ? (
          <>
            <span className="eyebrow">YOUR ACCOUNT</span>
            <h1>A fresh start.</h1>
            <p>Choose a unique password with at least 12 characters.</p>
            {reset.isSuccess ? (
              <>
                <p role="status" className="settings-success">
                  Your password has been updated.
                </p>
                <Link href="/home" className="button primary">
                  Open your workspace
                </Link>
              </>
            ) : (
              <form
                className="settings-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  reset.mutate();
                }}
              >
                <label>
                  New password
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
                  Confirm new password
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
                {reset.error && (
                  <p role="alert" className="form-error">
                    {reset.error.message}
                  </p>
                )}
                <button className="button primary" disabled={reset.isPending}>
                  {reset.isPending ? "Updating…" : "Set new password"}
                </button>
              </form>
            )}
          </>
        ) : (
          <>
            <span className="eyebrow">YOUR ACCOUNT</span>
            <h1>Forgot your password?</h1>
            <p>We will email you a link to set a new one.</p>
            {send.isSuccess ? (
              <p className="settings-success" role="status">
                If an account uses this email, a reset link is on its way. Check your inbox.
              </p>
            ) : (
              <form
                className="settings-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  send.mutate();
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
                {send.error && (
                  <p className="form-error" role="alert">
                    {send.error.message}
                  </p>
                )}
                <button className="button primary" disabled={send.isPending}>
                  {send.isPending ? "Sending…" : "Send reset link"}
                </button>
              </form>
            )}
            <Link href="/login" className="button quiet">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
