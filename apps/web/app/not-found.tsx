import Link from "next/link";

export default function NotFound() {
  return (
    <main className="centered-state">
      <h1>This page is unavailable.</h1>
      <p>The link may have changed. Go back to your work to find it.</p>
      <Link className="button primary" href="/home">
        Back to your work
      </Link>
    </main>
  );
}
