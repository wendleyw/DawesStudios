"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useNotifications } from "./workspace-data";

/**
 * The workspace's unread marker, rendered by whichever surface holds the global actions: the
 * topbar on a page that has none of its own, the board's identity header on the board. The query
 * behind it is shared, so two mounted copies still make one request.
 */
export function NotificationsBell() {
  const notifications = useNotifications();
  const unread = notifications.data?.filter((item) => !item.read_at).length ?? 0;
  return (
    <Link
      href="/notifications"
      className={`icon-button notifications-bell ${unread ? "has-unread" : ""}`}
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <Bell size={17} />
      {unread > 0 && <span className="unread-dot" aria-hidden="true" />}
    </Link>
  );
}
