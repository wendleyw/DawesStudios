"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  acceptBriefing,
  confirmBriefingBudget,
  useBriefingCreditBalance,
  useBriefingProject,
  useBriefings,
  useCampaigns,
} from "./briefing-data";
import { briefingStatusLabels, initialDraft, type Briefing } from "./briefing-model";
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
  if (briefings.isPending || campaigns.isPending)
    return <PageStatus>Loading the briefing…</PageStatus>;
  const briefing = briefings.data?.find((item) => item.id === briefingId);
  if (!briefing || briefings.error || campaigns.error)
    return (
      <div className="page-content">
        <h1>Briefing unavailable.</h1>
        <p>This briefing may no longer be available, or you may not have access.</p>
        <Link href={`/clients/${clientId}/briefings`} className="button">
          Back to briefings
        </Link>
      </div>
    );
  return (
    <div className="page-content briefing-detail">
      <header className="briefing-detail-header">
        <Link href={`/clients/${clientId}/briefings`} className="button quiet">
          <ArrowLeft size={16} />
          All briefings
        </Link>
        <span className={`status-badge ${briefing.status}`}>
          {briefingStatusLabels[briefing.status]}
        </span>
      </header>
      <div className="briefing-detail-layout">
        <div>
          <BriefingSummary
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
              <p>Continue shaping your brief before sending it to the studio.</p>
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
    </div>
  );
}

function BudgetReview({ briefing }: { briefing: Briefing }) {
  const { database } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [credits, setCredits] = useState(
    String(briefing.confirmed_credits ?? briefing.estimated_credits ?? 1),
  );
  const [note, setNote] = useState(briefing.budget_note ?? "");
  const balance = useBriefingCreditBalance(briefing.client_id);
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["briefings"] }),
  });
  const accept = useMutation({
    mutationFn: async () => await acceptBriefing(database, { briefingId: briefing.id }),
    onSuccess: async (id) => {
      await Promise.all(
        ["briefings", "projects", "credit-account", "credit-ledger", "notifications"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      router.push(`/projects/${id}`);
    },
  });
  const enough =
    balance.data && balance.data.balance >= (briefing.confirmed_credits ?? Number(credits));
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
        {balance.isPending ? (
          <p className="briefing-note">Checking balance…</p>
        ) : balance.error ? (
          <p className="briefing-note">Balance unavailable. Try reloading.</p>
        ) : (
          <dl className="briefing-budget-figures">
            <div>
              <dt>Scope estimate</dt>
              <dd>{briefing.estimated_credits ?? "—"} cr</dd>
            </div>
            <div>
              <dt>Approved total</dt>
              <dd>{Number(credits) || 0} cr</dd>
            </div>
            <div>
              <dt>Available balance</dt>
              <dd>{balance.data?.balance ?? 0} cr</dd>
            </div>
            <div>
              <dt>Balance after acceptance</dt>
              <dd>{(balance.data?.balance ?? 0) - (Number(credits) || 0)} cr</dd>
            </div>
          </dl>
        )}
        {confirm.error && <FormError>{confirm.error.message}</FormError>}
        <button className="button" disabled={confirm.isPending || accept.isPending}>
          {confirm.isPending ? "Saving…" : "Confirm budget"}
        </button>
      </form>
      {briefing.status === "budget_confirmed" && (
        <div className="briefing-accept">
          <p>{briefing.confirmed_credits} credits · one project</p>
          {!enough && !balance.isPending && (
            <p className="form-error">
              {balance.error
                ? "Check the credit account before accepting."
                : `${(briefing.confirmed_credits ?? 0) - (balance.data?.balance ?? 0)} more credits are needed to accept this briefing.`}
            </p>
          )}
          {accept.error && <FormError>{accept.error.message}</FormError>}
          {unconfirmedEdit && (
            <p className="briefing-note">
              The budget above has unsaved changes. Choose Confirm budget to apply them, or restore
              the confirmed values to accept as they stand.
            </p>
          )}
          <button
            className="button primary"
            disabled={accept.isPending || confirm.isPending || !enough || unconfirmedEdit}
            onClick={() => accept.mutate()}
          >
            {accept.isPending ? "Creating project…" : "Accept & create project"}
          </button>
          <Link href={`/clients/${briefing.client_id}/credits`} className="button quiet">
            View credits
          </Link>
        </div>
      )}
    </>
  );
}
