"use client";
import { AccountMenu } from "./account-menu";
import { NotificationsPopover } from "./notifications-popover";
import type { ReactNode } from "react";
import { ClientIdentity } from "./client-identity";
import { ClientNavigation } from "./client-navigation";
import type { Client } from "./workspace-data";
import type { Profile } from "@/lib/supabase";

/** Shared workspace identity, navigation and signed-in profile across client workspace surfaces. */
export function CanvasHeader({
  client,
  viewer,
  context,
  center,
  heading = false,
  showIdentity = true,
}: {
  client: Client;
  viewer: Profile | null;
  context?: ReactNode;
  center?: ReactNode;
  heading?: boolean;
  showIdentity?: boolean;
}) {
  const logo = (
    <ClientIdentity
      client={client}
      href={`/clients/${client.id}/${viewer?.role === "designer" ? "board" : "overview"}`}
    />
  );
  return (
    <header className="board-header">
      <div className="board-identity">
        {(showIdentity || context) && (
          <div className="board-client-context">
            {/* The client's logo stands in for their name and leads to their Overview; designers have
              no client Overview, so theirs leads to the board. The name stays its accessible label. */}
            {showIdentity && (heading ? <h1 className="board-identity-heading">{logo}</h1> : logo)}
            {context}
          </div>
        )}
        {viewer && <ClientNavigation client={client} role={viewer.role} />}
      </div>
      {center}
      <div className="board-account">
        <NotificationsPopover />
        <AccountMenu clientId={client.id} viewer={viewer} />
      </div>
    </header>
  );
}
