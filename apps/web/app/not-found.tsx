import Link from "next/link";

export default function NotFound() {
  return (
    <main className="centered-state">
      <h1>This page is unavailable.</h1>
      <p>The link may have changed. Return to your workspace to find your work.</p>
      <Link className="button primary" href="/home">
        Open workspace
      </Link>
    </main>
  );
}
