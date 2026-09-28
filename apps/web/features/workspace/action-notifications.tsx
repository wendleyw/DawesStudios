"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  ACTION_NOTIFICATION_LIMIT,
  useActionNotifications,
  type ActionNotification,
} from "./workspace-data";

const actionLabels: Record<string, string> = {
  review_briefing: "Review briefing",
  start_project: "Start project",
  prepare_project: "Prepare project",
  review_round: "Review round",
  respond_feedback: "Respond to feedback",
  deliver_project: "Deliver project",
  review_credit_request: "Review credit request",
  submit_round: "Submit round",
  prepare_board: "Prepare production brief",
  revise_board: "Make changes",
  review_version: "Review version",
};

export function actionNotificationDestination(item: ActionNotification): string | null {
  const client = encodeURIComponent(item.client_id);
  const entity = encodeURIComponent(item.entity_id);
  const project = item.project_id && encodeURIComponent(item.project_id);
  const board = item.board_id && encodeURIComponent(item.board_id);

  switch (item.kind) {
    case "review_briefing":
    case "start_project":
      return `/clients/${client}/briefings/${entity}`;
    case "prepare_project":
      return project ? `/projects/${project}?channel=internal&panel=details` : null;
    case "prepare_board":
      return project && board
        ? `/projects/${project}?channel=internal&board=${board}&panel=details`
        : null;
    case "review_round":
      return project && board
        ? `/projects/${project}?channel=internal&board=${board}&round=${entity}`
        : null;
    case "revise_board":
    case "submit_round":
      return project && board ? `/projects/${project}?channel=internal&board=${board}` : null;
    case "respond_feedback":
      return project
        ? `/projects/${project}?channel=client&version=${entity}&panel=comments`
        : null;
    case "deliver_project":
      return project ? `/clients/${client}/brand/files?project=${project}` : null;
    case "review_version":
      return project ? `/projects/${project}?channel=client&version=${entity}` : null;
    case "review_credit_request":
      return `/clients/${client}/credits#credit-requests`;
    default:
      return null;
  }
}

/** The queue comes from current workflow state and cannot be dismissed as read activity. */
export function ActionNotifications() {
  const [page, setPage] = useState(0);
  const actions = useActionNotifications(page);
  const count = actions.data?.count ?? 0;

  return (
    <section className="action-notifications" aria-labelledby="action-notifications-title">
      <div className="notification-section-heading">
        <h2 id="action-notifications-title">Needs your action</h2>
        {!actions.isPending && !actions.error && count > 0 && (
          <span className="notification-section-count">{count}</span>
        )}
      </div>
      {actions.isPending ? (
        <p role="status">Loading actions…</p>
      ) : actions.error ? (
        <div role="alert">
          <p className="form-error">We couldn’t load actions.</p>
          <button className="button" onClick={() => void actions.refetch()}>
            Try again
          </button>
        </div>
      ) : actions.data?.items.length ? (
        <>
          <div className="action-notifications-list">
            {actions.data.items.map((item) => {
              const destination = actionNotificationDestination(item);
              const content = (
                <>
                  <span className="action-notification-content">
                    <strong>{item.subject}</strong>
                    <span>{actionLabels[item.kind] ?? "Open action"}</span>
                  </span>
                  {destination && <ArrowUpRight size={17} aria-hidden="true" />}
                </>
              );
              return destination ? (
                <Link className="action-notification-item" href={destination} key={item.id}>
                  {content}
                </Link>
              ) : (
                <div className="action-notification-item" key={item.id}>
                  {content}
                </div>
              );
            })}
          </div>
          {count > ACTION_NOTIFICATION_LIMIT && (
            <p className="action-notifications-limit">
              Showing {page * ACTION_NOTIFICATION_LIMIT + 1}–
              {Math.min((page + 1) * ACTION_NOTIFICATION_LIMIT, count)} of {count} actions.
            </p>
          )}
        </>
      ) : (
        <p className="action-notifications-empty">
          {count > 0 ? "No remaining actions on this page." : "No actions needed."}
        </p>
      )}
      {(page > 0 || count > ACTION_NOTIFICATION_LIMIT) && (
        <nav className="form-actions" aria-label="Action pages">
          <button
            className="button"
            disabled={page === 0 || actions.isPending}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous actions
          </button>
          <button
            className="button"
            disabled={
              (page + 1) * ACTION_NOTIFICATION_LIMIT >= count ||
              actions.isPending ||
              !!actions.error
            }
            onClick={() => setPage((current) => current + 1)}
          >
            Next actions
          </button>
        </nav>
      )}
    </section>
  );
}
