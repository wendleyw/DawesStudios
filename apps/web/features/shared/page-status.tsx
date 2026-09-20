import type { ReactNode } from "react";

/**
 * The full-page status message shown while a route loads its data. It pairs the
 * `page-content` layout with `role="status"` so the message is announced once
 * the page settles.
 */
export function PageStatus({ children }: { children: ReactNode }) {
  return (
    <div className="page-content" role="status">
      {children}
    </div>
  );
}
