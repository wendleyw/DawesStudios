"use client";

import { useClientLogo } from "@/features/brand/brand-data";
import type { Client } from "./workspace-data";

/** Shows the active client's own logo and name as the workspace's context marker. */
export function ClientIdentity({ client }: { client: Client }) {
  const logo = useClientLogo(client.id);
  return (
    <div className="topbar-identity">
      {logo.data ? (
        // Keep expiring, caller-scoped signed URLs out of Next.js's shared image optimization cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="client-mark" src={logo.data} alt="" width={26} height={26} />
      ) : (
        <span className="client-mark client-mark-initials" aria-hidden="true">
          {client.initials || client.name.slice(0, 2)}
        </span>
      )}
      <strong>{client.name}</strong>
    </div>
  );
}
