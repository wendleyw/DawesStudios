"use client";
import Link from "next/link";
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
  return (
    <header className="board-header">
      <div className="board-identity">
        <div className="board-client-context">
          <ClientMark
            client={client}
            className={
              heading ? "board-identity-mark board-identity-mark-large" : "board-identity-mark"
            }
          />
          {heading ? (
            <h1 title={client.name}>{client.name}</h1>
          ) : (
            <Link
              className="canvas-client-name"
              href={`/clients/${client.id}/board`}
              title={client.name}
            >
              {client.name}
            </Link>
          )}
          {context}
        </div>
        {viewer && <ClientNavigation client={client} role={viewer.role} />}
      </div>
      <div className="board-account">
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
