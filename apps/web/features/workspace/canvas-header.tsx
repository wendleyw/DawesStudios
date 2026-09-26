"use client";
import Link from "next/link";
import { CreditBalanceChip } from "@/features/credits/credit-balance-chip";
import { NotificationsPopover } from "./notifications-popover";
import type { ReactNode } from "react";
import { ClientMark } from "./client-mark";
import { ClientNavigation } from "./client-navigation";
import type { Client } from "./workspace-data";
import type { Profile } from "@/lib/supabase";

/** Shared workspace identity, navigation and signed-in profile across client workspace surfaces. */
export function CanvasHeader({
  client,
  viewer,
  context,
  heading = false,
}: {
  client: Client;
  viewer: Profile | null;
  context?: ReactNode;
  heading?: boolean;
}) {
  const name = viewer?.display_name || "Your account";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const logo = (
    <Link
      className="board-identity-logo"
      href={`/clients/${client.id}/${viewer?.role === "designer" ? "board" : "overview"}`}
      title={client.name}
    >
      <ClientMark client={client} className="board-identity-mark" alt={client.name} />
    </Link>
  );
  return (
    <header className="board-header">
      <div className="board-identity">
        <div className="board-client-context">
          {/* The client's logo stands in for their name and leads to their Overview; designers have
              no client Overview, so theirs leads to the board. The name stays its accessible label. */}
          {heading ? <h1 className="board-identity-heading">{logo}</h1> : logo}
          {context}
        </div>
        {viewer && <ClientNavigation client={client} role={viewer.role} />}
      </div>
      <div className="board-account">
        <CreditBalanceChip clientId={client.id} viewer={viewer} />
        <NotificationsPopover />
        <Link
          href="/settings/account"
          className="board-profile"
          aria-label={`Your profile: ${name}`}
          title={`Your profile: ${name}`}
        >
          <span className="board-profile-avatar" aria-hidden="true">
            {viewer?.avatar_url ? (
              // The signed-in viewer's avatar can be a private URL; avoid the shared image cache.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewer.avatar_url} alt="" />
            ) : (
              initials
            )}
          </span>
          <span className="board-profile-name">{name}</span>
        </Link>
      </div>
    </header>
  );
}
