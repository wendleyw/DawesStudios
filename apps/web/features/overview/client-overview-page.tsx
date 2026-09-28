"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useBriefings } from "@/features/briefings/briefing-data";
import { useCreditAccount, useCreditLedger } from "@/features/credits/credit-data";
import { formatCredits } from "@/features/credits/credit-model";
import { useReviews } from "@/features/reviews/review-data";
import { PageStatus } from "@/features/shared/page-status";
import { statusToneClass } from "@/features/shared/status-tone";
import { welcomeTitle } from "@/features/shared/welcome-header";
import { ClientIdentity } from "@/features/workspace/client-identity";
import {
  projectStatusTone,
  projectStatusLabel,
  useClients,
  useDateFormat,
  useProjects,
} from "@/features/workspace/workspace-data";
import { clientOverview, deliveredOn, relativeAge } from "./overview-model";
import { OverviewPanel } from "./overview-panel";
import "./overview.css";

/** The client's welcome page: their numbers, what is moving, their turn and what shipped. */
export function ClientOverviewPage({ clientId }: { clientId: string }) {
  const { profile } = useAuth();
  const router = useRouter();
  const clients = useClients();
  const projects = useProjects(clientId);
  const briefings = useBriefings(clientId);
  const account = useCreditAccount(clientId);
  const ledger = useCreditLedger(clientId);
  const reviews = useReviews(clientId);
  const { formatDate, formatDayKey, formatMonth, formatWeekdayDate } = useDateFormat();
  // Designers have no Overview destination; one typed by hand opens the client's board.
  useEffect(() => {
    if (profile?.role === "designer") router.replace(`/clients/${clientId}/board`);
  }, [profile?.role, clientId, router]);
  const reads = [clients, projects, briefings, account, ledger, reviews];
  if (profile?.role === "designer" || reads.some((read) => read.isPending))
    return <PageStatus>Loading your overview…</PageStatus>;
  const client = clients.data?.find((item) => item.id === clientId);
  if (!client || reads.some((read) => read.error))
    return (
      <div className="page-content">
        <h1>Overview unavailable.</h1>
        <p>Your overview could not be loaded. Please try again.</p>
        <button className="button" onClick={() => reads.forEach((read) => void read.refetch())}>
          Try again
        </button>
      </div>
    );
  const now = new Date();
  const overview = clientOverview({
    projects: projects.data ?? [],
    briefings: briefings.data ?? [],
    ledger: ledger.data ?? [],
    balance: account.data?.balance ?? 0,
    reviews: reviews.data ?? [],
    now,
    formatMonth,
  });
  const projectHref = (id: string) => `/projects/${id}?channel=client`;
  return (
    <div className="page-content overview-page">
      <header className="page-heading card-heading overview-welcome">
        <div className="overview-welcome-identity">
          <ClientIdentity
            client={client}
            placement="overview"
            href={`/clients/${clientId}/overview`}
          />
          <div>
            <h1>{welcomeTitle(profile?.display_name)}</h1>
            <p>
              <time dateTime={formatDayKey(now.toISOString())}>
                {formatWeekdayDate(now.toISOString())}
              </time>
            </p>
          </div>
        </div>
        <div className="page-actions">
          <Link className="button primary" href={`/clients/${clientId}/briefings/new`}>
            <Plus size={16} />
            New briefing
          </Link>
        </div>
      </header>
      <div className="overview-stats">
        <div>
          <strong>{overview.credits.remaining}</strong>
          <span>Credits remaining</span>
          <small>
            {overview.credits.used} of {overview.credits.total} used
          </small>
        </div>
        <div>
          <strong>{overview.active}</strong>
          <span>Active projects</span>
          <small>{overview.deliveredThisMonth} delivered this month</small>
        </div>
        <div>
          <strong>{overview.needsReview}</strong>
          <span>Needs your review</span>
          <small>awaiting your feedback</small>
        </div>
      </div>
      <section className="overview-flight" aria-label="In flight">
        <span className="eyebrow">In flight</span>
        <span>
          <strong>{overview.inFlight.withStudio}</strong> with the studio
        </span>
        <span>
          <strong>{overview.inFlight.inProgress}</strong> in progress
        </span>
        <span>
          <strong>{overview.inFlight.delivered}</strong> delivered
        </span>
      </section>
      <div className="overview-columns">
        <OverviewPanel
          eyebrow="Active projects"
          title="What's moving"
          seeAll={`/clients/${clientId}/board`}
          empty="Nothing in production right now."
        >
          {overview.moving.map((project) => {
            const credits = overview.creditsByProject.get(project.id);
            const creditsLabel = credits ? formatCredits(credits) : null;
            return (
              <Link key={project.id} className="overview-row" href={projectHref(project.id)}>
                <strong>{project.title}</strong>
                <span className="overview-row-meta">
                  {creditsLabel ? `${creditsLabel.amount} ${creditsLabel.word} · ` : ""}Due{" "}
                  {formatDate(project.due_date, "not set")}
                </span>
                <span className={statusToneClass(projectStatusTone(project))}>
                  {projectStatusLabel(project)}
                </span>
              </Link>
            );
          })}
        </OverviewPanel>
        <OverviewPanel
          eyebrow="Needs you"
          title="Your turn"
          seeAll={`/clients/${clientId}/reviews`}
          empty="Nothing waiting on you."
        >
          {overview.yourTurn.map((row) => (
            <Link key={row.id} className="overview-row" href={projectHref(row.projectId)}>
              <strong>
                {row.title} · {row.label}
              </strong>
              <span className="overview-row-meta">
                Review · {relativeAge(row.date, now, formatDayKey)}
              </span>
            </Link>
          ))}
        </OverviewPanel>
        <OverviewPanel
          eyebrow="Delivered"
          title="Recently shipped"
          seeAll={`/clients/${clientId}/board`}
          empty="Delivered work will appear here."
        >
          {overview.shipped.map((project) => (
            <Link key={project.id} className="overview-row" href={projectHref(project.id)}>
              <strong>{project.title}</strong>
              <span className="overview-row-meta">{formatDate(deliveredOn(project))}</span>
            </Link>
          ))}
        </OverviewPanel>
      </div>
    </div>
  );
}
