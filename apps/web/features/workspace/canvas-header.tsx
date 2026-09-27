"use client";
import Link from "next/link";
import { AccountMenu } from "./account-menu";
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
        <NotificationsPopover />
        <AccountMenu clientId={client.id} viewer={viewer} />
      </div>
    </header>
  );
}
