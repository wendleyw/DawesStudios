"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/supabase";
import type { Client } from "./workspace-data";

export function ClientNavigation({ client, role }: { client: Client; role: Profile["role"] }) {
  const pathname = usePathname();
  const destinations = [
    { path: "board", label: "Board" },
    { path: "briefings", label: "Briefings" },
    { path: "reviews", label: "Reviews" },
    { path: "assets", label: "Files" },
    { path: "brand/overview", label: "Brand Hub" },
    ...(role !== "designer" ? [{ path: "credits", label: "Credits" }] : []),
  ];
  return (
    <nav className="client-navigation" aria-label={`${client.name} navigation`}>
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
