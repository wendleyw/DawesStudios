"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { safeReturnPath } from "./return-path";
import { FormError } from "@/features/shared/form-error";
import "./auth.css";

export function LoginPage() {
  const { database, session, loading } = useAuth();
  const router = useRouter();
  const parameters = useSearchParams();
  const destination = safeReturnPath(parameters.get("returnTo"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (session && !loading) router.replace(destination);
  }, [session, loading, router, destination]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const result = await database.auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    setPending(false);
    if (result.error) setError(result.error.message);
    else router.replace(destination);
  }

  return (
    <main className="login-layout">
      <section className="login-story">
        <Image
          src="/brand/logo.webp"
          alt="Brianna Dawes Studios"
          className="brand-logo"
          width={2409}
          height={619}
          sizes="280px"
          priority
        />
        <div>
          <span className="eyebrow">A little structure. More room to create.</span>
          <h1>
            Good work,
            <br />
            in good company.
          </h1>
          <p>
            Your projects, feedback, and brand.
            <br />
            One considered space to move things forward.
          </p>
        </div>
        <span className="login-caption">CREATIVE CANVAS · BRIANNA DAWES STUDIOS</span>
      </section>
      <section className="login-form-panel">
        <form onSubmit={signIn} className="login-form">
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h2>Welcome back.</h2>
          <p>Sign in to pick up where you left off.</p>
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="username"
              placeholder="you@company.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              minLength={8}
            />
          </label>
          {error && <FormError>{error}</FormError>}
          <button className="button primary" type="submit" disabled={pending || loading}>
            {pending ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <>
                Sign in <ArrowRight size={16} />
              </>
            )}
          </button>
          <Link className="button quiet" href="/auth/recovery">
            Forgot password?
          </Link>
          <p className="form-help">Need access? Ask your studio contact for an invitation.</p>
        </form>
      </section>
    </main>
  );
}
