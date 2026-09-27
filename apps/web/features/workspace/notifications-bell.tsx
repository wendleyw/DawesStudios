"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";
import { useActionNotifications, useUnreadNotificationCount } from "./workspace-data";

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
  const actions = useActionNotifications().data?.count ?? 0;
  const classNames = `icon-button notifications-bell ${className} ${unread || actions ? "has-unread" : ""} ${expanded ? "selected" : ""}`;
  const label = `Notifications${unread ? `, ${unread} unread` : ""}${actions ? `, ${actions} action${actions === 1 ? "" : "s"} needed` : ""}`;
  const icon = (
    <>
      <Bell size={17} />
      {(unread > 0 || actions > 0) && <span className="unread-dot" aria-hidden="true" />}
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
