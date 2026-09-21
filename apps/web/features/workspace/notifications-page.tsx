"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Bell, Check } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import {
  markNotificationsRead,
  useDateFormat,
  useInvalidateNotifications,
  useNotifications,
} from "./workspace-data";
import { FormError } from "@/features/shared/form-error";

export function NotificationsPage() {
  const { database, session } = useAuth();
  const { formatDateTime } = useDateFormat();
  const notifications = useNotifications();
  const invalidateNotifications = useInvalidateNotifications();
  const markRead = useMutation({
    mutationFn: (id?: string) => markNotificationsRead(database, { userId: session!.user.id, id }),
    onSuccess: () => invalidateNotifications(),
  });
  const unread = notifications.data?.filter((item) => !item.read_at).length ?? 0;
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">IN THE LOOP</span>
          <h1>Notifications</h1>
          <p>
            {unread
              ? `${unread} notification${unread === 1 ? "" : "s"} waiting for you.`
              : "You’re up to date."}
          </p>
        </div>
        <button
          className="button"
          disabled={!unread || markRead.isPending}
          onClick={() => markRead.mutate(undefined)}
        >
          <Check size={15} />
          Mark all read
        </button>
      </div>
      {notifications.isPending ? (
        <p role="status">Loading your notifications…</p>
      ) : notifications.error ? (
        <div role="alert">
          <p className="form-error">We couldn’t load notifications.</p>
          <button className="button" onClick={() => void notifications.refetch()}>
            Try again
          </button>
        </div>
      ) : notifications.data?.length ? (
        <div className="notification-list">
          {notifications.data.map((item) => (
            <article className={`notification-item ${!item.read_at ? "unread" : ""}`} key={item.id}>
              <span className="notification-icon">
                <Bell size={17} />
              </span>
              <div>
                <h2>{item.title}</h2>
                {item.body && <p>{item.body}</p>}
                <time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
              </div>
              {item.project_id ? (
                <Link
                  className="icon-button"
                  href={`/projects/${item.project_id}`}
                  aria-label={`Open project for ${item.title}`}
                  onClick={() => markRead.mutate(item.id)}
                >
                  <ArrowUpRight size={17} />
                </Link>
              ) : item.client_id ? (
                <Link
                  className="icon-button"
                  href={`/clients/${item.client_id}/board`}
                  aria-label={`Open client for ${item.title}`}
                  onClick={() => markRead.mutate(item.id)}
                >
                  <ArrowUpRight size={17} />
                </Link>
              ) : null}
              {!item.read_at && (
                <button
                  className="icon-button"
                  aria-label={`Mark ${item.title} as read`}
                  onClick={() => markRead.mutate(item.id)}
                >
                  <Check size={15} />
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Bell size={25} />
          <h2>A quiet moment.</h2>
          <p>Notifications about your projects will appear here.</p>
        </div>
      )}
      {markRead.error && <FormError>{markRead.error.message}</FormError>}
    </div>
  );
}
