"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  useInvalidateNotifications,
  useInvalidateWorkspace,
} from "@/features/workspace/workspace-data";
import { Modal } from "@/features/shared/modal";
import { personName, requesterLabel, type ClientPerson } from "@/features/team/client-people";
import { useClientPeople } from "@/features/team/team-data";
import {
  acceptBriefing,
  briefingQueryKeys,
  confirmBriefingBudget,
  setBriefingRequester,
  useBriefingProject,
  useBriefings,
  useCampaigns,
  useCreditMonthSummaries,
} from "./briefing-data";
import {
  briefingStatusLabels,
  briefingStatusTones,
  creditMonthLabel,
  defaultAcceptanceMonth,
  initialDraft,
  initialRequester,
  openCreditMonths,
  type Briefing,
} from "./briefing-model";
import { statusToneClass } from "@/features/shared/status-tone";
import { BriefingAttachments } from "./briefing-attachments";
import { BriefingSummary } from "./briefing-summary";
import "./briefings.css";
import { FormError } from "@/features/shared/form-error";
import { PageStatus } from "@/features/shared/page-status";

export function BriefingDetail({ clientId, briefingId }: { clientId: string; briefingId: string }) {
  const { profile } = useAuth();
  const briefings = useBriefings(clientId);
  const campaigns = useCampaigns(clientId);
  const linked = useBriefingProject(briefingId);
  const people = useClientPeople(clientId);
  const [changingRequester, setChangingRequester] = useState(false);
  if (briefings.isPending || campaigns.isPending)
    return <PageStatus>Loading the briefing…</PageStatus>;
  const briefing = briefings.data?.find((item) => item.id === briefingId);
  if (!briefing || briefings.error || campaigns.error)
    return (
      <div className="page-content">
        <h1>Briefing unavailable.</h1>
        <p>This briefing may no longer be available, or you may not have access.</p>
        <Link href={`/clients/${clientId}/briefings`} className="button">
          All briefings
        </Link>
      </div>
    );
  const requester = personName(briefing.requested_by, people.data, profile?.role);
  const canChangeRequester = profile?.role === "agency" && !!people.data?.team.length;
  const requesterLine =
    requesterLabel(requester) ?? (canChangeRequester ? "No requester yet" : null);
  return (
    <div className="page-content briefing-detail">
      <header className="page-heading client-page-heading">
        <div>
          <div className="page-title-row">
            <Link
              href={`/clients/${clientId}/briefings`}
              className="icon-button"
              aria-label="All briefings"
              title="All briefings"
            >
              <ArrowLeft size={16} />
            </Link>
            <h1>{briefing.title || "Untitled briefing"}</h1>
          </div>
          {requesterLine && (
            <p className="briefing-requester">
              <span>{requesterLine}</span>
              {canChangeRequester && (
                <button
                  className="button quiet small"
                  aria-label={`${requester ? "Change" : "Choose"} who requested this briefing`}
                  onClick={() => setChangingRequester(true)}
                >
                  {requester ? "Change" : "Choose"}
                </button>
              )}
            </p>
          )}
        </div>
        <div className="page-actions">
          <span className={statusToneClass(briefingStatusTones[briefing.status])}>
            {briefingStatusLabels[briefing.status]}
          </span>
        </div>
      </header>
      <div className="briefing-detail-layout">
        <div>
          <BriefingSummary
            showTitle={false}
            draft={initialDraft(briefing, {})}
            campaignName={campaigns.data?.find((item) => item.id === briefing.campaign_id)?.title}
          />
          <BriefingAttachments briefingId={briefing.id} />
        </div>
        <aside className="briefing-review-aside">
          {profile?.role === "designer" ? (
            <>
              <h2>Creative direction</h2>
              <p>
                This is the accepted project scope. Coordinate changes with the studio in your
                project.
              </p>
              {linked.data && (
                <Link className="button primary" href={`/projects/${linked.data.id}`}>
                  Open project
                  <ArrowUpRight size={15} />
                </Link>
              )}
            </>
          ) : briefing.status === "draft" ? (
            <>
              <h2>Ready when you are.</h2>
              <p>Continue shaping your briefing before sending it to the studio.</p>
              <Link
                className="button primary"
                href={`/clients/${clientId}/briefings/${briefing.id}/edit`}
              >
                Continue briefing
              </Link>
            </>
          ) : briefing.status === "accepted" ? (
            <>
              <h2>Your project is underway.</h2>
              <p>{briefing.confirmed_credits} credits were used once for this project.</p>
              {briefing.budget_note && <p>{briefing.budget_note}</p>}
              {linked.data && (
                <Link href={`/projects/${linked.data.id}`} className="button primary">
                  Open project
                  <ArrowUpRight size={15} />
                </Link>
              )}
              <Link
                className="button quiet"
                href={`/clients/${clientId}/credits${linked.data ? `?project=${linked.data.id}` : ""}`}
              >
                View credit report
              </Link>
            </>
          ) : profile?.role === "agency" ? (
            <BudgetReview key={`${briefing.id}-${briefing.updated_at}`} briefing={briefing} />
          ) : (
            <>
              <h2>
                {briefing.status === "budget_confirmed" ? "Scope confirmed." : "With the studio."}
              </h2>
              <p>
                {briefing.status === "budget_confirmed"
                  ? `The project budget is ${briefing.confirmed_credits} credits. The studio will confirm the start of work.`
                  : "The studio is reviewing your scope and will confirm the project budget. No credits have been used."}
              </p>
              {briefing.budget_note && <p>{briefing.budget_note}</p>}
            </>
          )}
        </aside>
      </div>
      {changingRequester && people.data && (
        <RequesterDialog
          briefing={briefing}
          people={people.data.team}
          onClose={() => setChangingRequester(false)}
        />
      )}
    </div>
  );
}

/** The studio's choice of who a briefing's work is for; the database accepts only the client's people. */
function RequesterDialog({
  briefing,
  people,
  onClose,
}: {
  briefing: Briefing;
  people: ClientPerson[];
  onClose: () => void;
}) {
  const { database } = useAuth();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState(() => initialRequester(briefing.requested_by, people));
  const save = useMutation({
    mutationFn: async () => {
      if (!choice) throw new Error("Choose who requested this briefing.");
      await setBriefingRequester(database, { briefingId: briefing.id, requestedBy: choice });
    },
    // Changing the requester rewrites the briefing row only.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [briefingQueryKeys.briefings] });
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Who requested this briefing?"
      description="Notifications about its project go to this person."
      onClose={() => {
        if (!save.isPending) onClose();
      }}
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Requested by
          <select value={choice} onChange={(event) => setChoice(event.target.value)}>
            <option value="">Choose a person</option>
            {people.map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {person.display_name}
              </option>
            ))}
          </select>
        </label>
        {save.error && <FormError>{save.error.message}</FormError>}
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BudgetReview({ briefing }: { briefing: Briefing }) {
  const { database } = useAuth();
  const queryClient = useQueryClient();
  const invalidateWorkspace = useInvalidateWorkspace();
  const invalidateNotifications = useInvalidateNotifications();
  const router = useRouter();
  const [credits, setCredits] = useState(
    String(briefing.confirmed_credits ?? briefing.estimated_credits ?? 1),
  );
  const [note, setNote] = useState(briefing.budget_note ?? "");
  // The project is charged to one month's credits. The select opens on the month `accept_briefing`
  // defaults to (the due-date month, clamped to the open window) and always sends its choice, so
  // the figures shown are the figures the procedure checks.
  const months = useMemo(() => openCreditMonths(), []);
  const [month, setMonth] = useState(() => defaultAcceptanceMonth(briefing.due_date));
  const summaries = useCreditMonthSummaries(briefing.client_id, months);
  const balance = {
    isPending: summaries.isPending,
    error: summaries.error,
    available: summaries.data?.[months.indexOf(month)]?.available ?? 0,
  };
  const monthName = creditMonthLabel(month);
  const confirm = useMutation({
    mutationFn: async () => {
      const amount = Number(credits);
      if (!Number.isSafeInteger(amount) || amount < 1)
        throw new Error("Enter a positive whole number of credits.");
      if (
        (amount !== briefing.estimated_credits || briefing.service_type === "other") &&
        !note.trim()
      )
        throw new Error("Explain the custom estimate or adjustment.");
      await confirmBriefingBudget(database, {
        briefingId: briefing.id,
        credits: amount,
        note: note.trim(),
      });
    },
    // Confirming a budget rewrites the briefing row only.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [briefingQueryKeys.briefings] }),
  });
  const accept = useMutation({
    mutationFn: async () => await acceptBriefing(database, { briefingId: briefing.id, month }),
    onSuccess: async (id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [briefingQueryKeys.briefings] }),
        // `credit-account`/`credit-ledger` are owned by `credits/credit-data.ts`, but its
        // `useInvalidateCredits()` also covers `credit-requests`, a key accepting a briefing never
        // touched before this migration — calling it here would widen the invalidation, so these
        // two stay explicit instead of going through that helper.
        queryClient.invalidateQueries({ queryKey: ["credit-account"] }),
        queryClient.invalidateQueries({ queryKey: ["credit-ledger"] }),
        invalidateWorkspace(),
        invalidateNotifications(),
      ]);
      router.push(`/projects/${id}`);
    },
  });
  const required = briefing.confirmed_credits ?? Number(credits);
  const enough = !balance.isPending && !balance.error && balance.available >= required;
  // Accept applies the confirmed figures, so an edited-but-unsaved form must say why it is blocked
  // instead of greying the button out with no explanation.
  const unconfirmedEdit =
    Number(credits) !== briefing.confirmed_credits || note !== (briefing.budget_note ?? "");
  return (
    <>
      <h2>Project budget</h2>
      <p>Confirm one total for the agreed scope.</p>
      <form
        className="briefing-form"
        onSubmit={(event) => {
          event.preventDefault();
          confirm.mutate();
        }}
      >
        <label>
          Approved project credits
          <input
            type="number"
            min={1}
            step={1}
            required
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
          />
        </label>
        <label>
          Scope note
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Explain any adjustment to the estimate"
          />
        </label>
        <label>
          Credit month
          <select value={month} onChange={(event) => setMonth(event.target.value)}>
            {months.map((option, index) => {
              const summary = summaries.data?.[index];
              return (
                <option key={option} value={option}>
                  {creditMonthLabel(option)}
                  {summary ? ` · ${summary.available} available` : ""}
                </option>
              );
            })}
          </select>
        </label>
        {balance.isPending ? (
          <p className="briefing-note">Checking balance…</p>
        ) : balance.error ? (
          <p className="briefing-note">Balance unavailable. Try reloading.</p>
        ) : (
          <dl className="briefing-budget-figures">
            <div>
              <dt>Scope estimate</dt>
              <dd>{briefing.estimated_credits ?? "—"} credits</dd>
            </div>
            <div>
              <dt>Approved total</dt>
              <dd>{Number(credits) || 0} credits</dd>
            </div>
            <div>
              <dt>Available in {monthName}</dt>
              <dd>{balance.available} credits</dd>
            </div>
            <div>
              <dt>Balance after acceptance</dt>
              <dd>{balance.available - (Number(credits) || 0)} credits</dd>
            </div>
          </dl>
        )}
        {confirm.error && <FormError>{confirm.error.message}</FormError>}
        {/* One primary action at a time: Confirm budget stays the only button until the briefing is
            budget_confirmed with no unsaved edits, at which point Accept & create project takes over
            below. Editing any field flips `unconfirmedEdit` back to true and brings this back. */}
        {!(briefing.status === "budget_confirmed" && !unconfirmedEdit) && (
          <button className="button" disabled={confirm.isPending || accept.isPending}>
            {confirm.isPending ? "Saving…" : "Confirm budget"}
          </button>
        )}
      </form>
      {briefing.status === "budget_confirmed" && (
        <div className="briefing-accept">
          <p>
            {briefing.confirmed_credits} credits · one project · {monthName}
          </p>
          {!enough && !balance.isPending && (
            <p className="form-error">
              {balance.error
                ? "Check the credit account before accepting."
                : `${monthName} has ${balance.available} credits available; ${required - balance.available} more are needed. Choose another month, or add an extra to ${monthName} on the Credits page.`}
            </p>
          )}
          {accept.error && <FormError>{accept.error.message}</FormError>}
          {unconfirmedEdit && (
            <p className="briefing-note">
              The budget above has unsaved changes. Choose Confirm budget to apply them, or restore
              the confirmed values to accept as they stand.
            </p>
          )}
          {!unconfirmedEdit && (
            <button
              className="button primary"
              disabled={accept.isPending || confirm.isPending || !enough || unconfirmedEdit}
              onClick={() => accept.mutate()}
            >
              {accept.isPending ? "Creating project…" : "Accept & create project"}
            </button>
          )}
          <Link href={`/clients/${briefing.client_id}/credits`} className="button quiet">
            View credits
          </Link>
        </div>
      )}
    </>
  );
}
