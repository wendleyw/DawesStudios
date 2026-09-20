"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Bell, Check } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/features/auth/auth-provider";
import { useWorkspaceSettings } from "@/features/workspace/workspace-settings";
import { useNotifications } from "./workspace-data";
import { assertResult } from "@/lib/supabase";

export function NotificationsPage() {
  const { database, session } = useAuth();
  const queryClient = useQueryClient();
  const settings = useWorkspaceSettings();
  const notifications = useNotifications();
  const markRead = useMutation({
    mutationFn: async (id?: string) => {
      const query = database
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", session!.user.id)
        .is("read_at", null);
      assertResult(await (id ? query.eq("id", id) : query));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
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
              ? `${unread} update${unread === 1 ? "" : "s"} waiting for you.`
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
        <p role="status">Loading your updates…</p>
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
                <time dateTime={item.created_at}>
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: settings.data?.timezone ?? "UTC",
                  }).format(new Date(item.created_at))}
                </time>
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
                  aria-label={`Open workspace for ${item.title}`}
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
          <p>Project updates and feedback will appear here.</p>
        </div>
      )}
      {markRead.error && (
        <p className="form-error" role="alert">
          {markRead.error.message}
        </p>
      )}
    </div>
  );
}
