"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";
import { useUnreadNotificationCount } from "./workspace-data";

/** Shared unread indicator for the account popover and global notification page link. */
export function NotificationsBell({
  className = "",
  onClick,
  expanded,
  buttonRef,
  controls,
}: {
  className?: string;
  onClick?: () => void;
  expanded?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  controls?: string;
}) {
  const unread = useUnreadNotificationCount().data ?? 0;
  const classNames = `icon-button notifications-bell ${className} ${unread ? "has-unread" : ""} ${expanded ? "selected" : ""}`;
  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  const icon = (
    <>
      <Bell size={17} />
      {unread > 0 && <span className="unread-dot" aria-hidden="true" />}
    </>
  );
  return onClick ? (
    <button
      ref={buttonRef}
      aria-controls={controls}
      aria-haspopup={controls ? "dialog" : undefined}
      className={classNames}
      aria-label={label}
      title="Notifications"
      aria-expanded={expanded}
      onClick={onClick}
    >
      {icon}
    </button>
  ) : (
    <Link href="/notifications" className={classNames} aria-label={label} title="Notifications">
      {icon}
    </Link>
  );
}
