import Link from "next/link";

/**
 * The page a designer reaches by URL for an area only the studio and the client use: it says who
 * manages the area and offers the way back, in the shared empty-state treatment.
 */
export function StudioManagedNotice({ area }: { area: string }) {
  return (
    <div className="page-content">
      <div className="empty-state">
        <h1>{area} are managed by the studio.</h1>
        <Link className="button" href="/home">
          Back to your work
        </Link>
      </div>
    </div>
  );
}
