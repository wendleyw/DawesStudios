"use client";

import Link from "next/link";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/supabase";
import { useScrollRow } from "@/features/shared/use-scroll-row";
import { useBoardPreferences } from "@/features/board/board-data";
import { boardViewName, defaultBoardView } from "@/features/board/board-views";
import type { Client } from "./workspace-data";

/**
 * The client's sections. Its Overview lives in the sidebar instead (`app-shell.tsx`), and Files is a
 * Brand Hub section. The board's link is named after the viewer's saved board view ("List",
 * "Kanban"…), so the menu says what the board will open as.
 */
export function ClientNavigation({ client, role }: { client: Client; role: Profile["role"] }) {
  const pathname = usePathname();
  const navigation = useRef<HTMLElement>(null);
  // On a phone the links scroll sideways in one row with the current section kept in view.
  useScrollRow(navigation, pathname);
  const boardView = useBoardPreferences(client.id).data ?? defaultBoardView;
  const destinations = [
    { path: "board", label: boardViewName(boardView) },
    { path: "briefings", label: "Briefings" },
    { path: "reviews", label: "Reviews" },
    { path: "brand/overview", label: "Brand Hub" },
    ...(role !== "designer" ? [{ path: "credits", label: "Credits" }] : []),
  ];
  return (
    <nav ref={navigation} className="client-navigation" aria-label={`${client.name} navigation`}>
      {destinations.map(({ path, label }) => {
        const active =
          pathname.includes(`/clients/${client.id}/${path.split("/")[0]}`) ||
          (path === "board" && pathname.startsWith("/projects/"));
        return (
          <Link
            key={path}
            href={`/clients/${client.id}/${path}`}
            className="client-navigation-link"
            aria-current={active ? "page" : undefined}
            title={label}
          >
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
