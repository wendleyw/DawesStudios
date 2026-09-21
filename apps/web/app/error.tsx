"use client";

import Link from "next/link";

export default function PageError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="centered-state">
      <h1>We couldn’t load this page.</h1>
      <p>Please try again. Your saved work is still available.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
      <Link className="button quiet" href="/home">
        Back to your work
      </Link>
    </main>
  );
}
