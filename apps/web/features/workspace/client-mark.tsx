"use client";

import { useClientLogo } from "@/features/brand/brand-data";
import type { Client } from "./workspace-data";

/**
 * The client's approved brand mark, falling back to their initials until one is uploaded.
 *
 * Size is left to CSS through `--client-mark-size`, so any surface showing the mark scales it from
 * one component rather than keeping a copy of its own.
 */
export function ClientMark({
  client,
  className = "",
  /** Empty where a visible name sits beside the mark, so it is not announced twice. */
  alt = "",
}: {
  client: Client;
  className?: string;
  alt?: string;
}) {
  const logo = useClientLogo(client.id);
  const classes = `client-mark ${className}`.trim();
  if (logo.data)
    // Keep expiring, caller-scoped signed URLs out of Next.js's shared image optimization cache.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={classes} src={logo.data} alt={alt} />;
  return (
    <span
      className={`${classes} client-mark-initials`}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {client.initials || client.name.slice(0, 2)}
    </span>
  );
}
