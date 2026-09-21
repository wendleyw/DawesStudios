"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useNotifications } from "./workspace-data";

/**
 * The workspace's unread marker, rendered by whichever surface holds the global actions: the
 * topbar on a page that has no header row of its own, the page's own header row inside a client
 * workspace, where the topbar stands down. Pages pass `page-bell`, which hides this copy below
 * 901px, where the topbar returns and carries the marker again. The query behind it is shared, so
 * two mounted copies still make one request.
 */
export function NotificationsBell({ className = "" }: { className?: string }) {
  const notifications = useNotifications();
  const unread = notifications.data?.filter((item) => !item.read_at).length ?? 0;
  return (
    <Link
      href="/notifications"
      className={`icon-button notifications-bell ${className} ${unread ? "has-unread" : ""}`}
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <Bell size={17} />
      {unread > 0 && <span className="unread-dot" aria-hidden="true" />}
    </Link>
  );
}
