"use client";

import {
  ArrowDownToLine,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { useBriefings, useCampaigns } from "@/features/briefings/briefing-data";
import { useClients, useDateFormat, useProjects } from "@/features/workspace/workspace-data";
import {
  CreditActionDialog,
  CreditMonthDialog,
  CreditRequestReview,
  type CreditMonthAction,
} from "./credit-actions";
import {
  useCreditLedger,
  useCreditMonthSummary,
  useCreditPlans,
  useCreditRequests,
} from "./credit-data";
import {
  creditCsv,
  creditEntryNote,
  creditKindLabels,
  creditMonthOf,
  creditMonthRange,
  creditRequestStatusLabels,
  creditRequestStatusTones,
  deliverableBreakdown,
  filterCreditEntries,
  formatCredits,
  planForMonth,
  writableCreditMonths,
  type CreditFilters,
  type CreditLedgerEntry,
  type CreditRequest,
} from "./credit-model";
import "./credits.css";
import { FormError } from "@/features/shared/form-error";
import { SearchField } from "@/features/shared/search-field";
import { PageStatus } from "@/features/shared/page-status";
import { saveBlob } from "@/features/shared/save-blob";
import { statusToneClass } from "@/features/shared/status-tone";
import { StudioManagedNotice } from "@/features/shared/studio-managed-notice";

/** How far the month switcher reaches either side of the current month. */
const MONTH_REACH = 11;

export function CreditsPage({ clientId }: { clientId: string }) {
  const { profile } = useAuth();
  const { formatDateLong, formatMonth } = useDateFormat();
  const currentMonth = creditMonthOf(new Date());
  const searchParams = useSearchParams();
  // A `?project=` deep link starts on every month, since that project may belong to any of them.
  const [filters, setFilters] = useState<CreditFilters>({
    search: "",
    kind: "all",
    month: searchParams.has("project") ? "" : currentMonth,
    campaignId: "",
    projectId: searchParams.get("project") ?? "",
  });
  const cardMonth = filters.month || currentMonth;
  const clients = useClients();
  const projects = useProjects(clientId);
  const briefings = useBriefings(clientId);
  const campaigns = useCampaigns(clientId);
  const summary = useCreditMonthSummary(clientId, cardMonth);
  const plans = useCreditPlans(clientId);
  const ledger = useCreditLedger(clientId, filters.month || undefined);
  const requests = useCreditRequests(clientId);
  const [tab, setTab] = useState(searchParams.has("project") ? "report" : "activity");
  const [filtersOpen, setFiltersOpen] = useState(searchParams.has("project"));
  const [action, setAction] = useState<"request" | "adjust" | null>(null);
  const [monthAction, setMonthAction] = useState<CreditMonthAction | null>(null);
  const [detail, setDetail] = useState<CreditLedgerEntry | null>(null);
  const [request, setRequest] = useState<CreditRequest | null>(null);
  const [exportError, setExportError] = useState("");
  if (profile?.role === "designer") return <StudioManagedNotice area="Credits" />;
  if (
    clients.isPending ||
    ledger.isPending ||
    projects.isPending ||
    briefings.isPending ||
    campaigns.isPending
  )
    return <PageStatus>Loading your credits…</PageStatus>;
  const client = clients.data?.find((item) => item.id === clientId);
  if (!client || ledger.error || projects.error || campaigns.error || briefings.error)
    return (
      <div className="page-content">
        <h1>Credits unavailable.</h1>
        <p>Your credit report could not be loaded. Please try again.</p>
        <button
          className="button"
          onClick={() => {
            void clients.refetch();
            void ledger.refetch();
            void projects.refetch();
            void campaigns.refetch();
            void briefings.refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  const projectList = projects.data ?? [];
  const briefingList = briefings.data ?? [];
  const campaignList = campaigns.data ?? [];
  const entries = ledger.data ?? [];
  const visible = filterCreditEntries(entries, projectList, filters);
  const isAgency = profile?.role === "agency";
  const months = creditMonthRange(currentMonth, MONTH_REACH, MONTH_REACH);
  const monthIndex = months.indexOf(filters.month);
  const writable = writableCreditMonths(currentMonth).includes(cardMonth);
  // While the summary query still shows the previous month's figures (`keepPreviousData`, so the
  // month switcher never blanks the card), the card must not present them under the new month's
  // heading; showing nothing here falls through to this section's own "…" placeholders below.
  const month = summary.isPlaceholderData ? undefined : summary.data;
  const plan = planForMonth(plans.data ?? [], cardMonth);
  const projectCount = new Set(
    entries
      .filter((entry) => entry.kind === "project_debit" && entry.month === cardMonth)
      .map((entry) => entry.project_id),
  ).size;
  const projectFor = (entry: CreditLedgerEntry) =>
    projectList.find((item) => item.id === entry.project_id);
  const briefFor = (entry: CreditLedgerEntry) =>
    briefingList.find((item) => item.id === projectFor(entry)?.briefing_id);
  const changeFilter = (patch: Partial<CreditFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));
  function downloadCsv() {
    try {
      const blob = new Blob(
        [
          creditCsv({
            clientName: client!.name,
            entries: visible,
            projects: projectList,
            campaigns: campaignList,
            briefings: briefingList,
          }),
        ],
        { type: "text/csv;charset=utf-8;" },
      );
      saveBlob(
        blob,
        `${client!.slug}-credit-report${filters.month ? `-${filters.month.slice(0, 7)}` : ""}.csv`,
      );
      setExportError("");
    } catch {
      setExportError("The report could not be downloaded. Please try again.");
    }
  }
  return (
    <div className="page-content credits-page">
      <header className="page-heading card-heading">
        <div>
          <h1>Credits</h1>
          <p>A clear view of your creative investment.</p>
        </div>
        <div className="page-actions">
          <button
            className="button primary"
            onClick={() => setAction(isAgency ? "adjust" : "request")}
          >
            <Plus size={16} />
            {isAgency ? "Adjust credits" : "Request credits"}
          </button>
        </div>
        <div className="credit-navigation card-heading-tools">
          <nav className="credit-tabs section-tabs" aria-label="Credit views">
            <button
              className={tab === "activity" ? "active" : ""}
              aria-pressed={tab === "activity"}
              onClick={() => setTab("activity")}
            >
              Balance & activity
            </button>
            <button
              className={tab === "report" ? "active" : ""}
              aria-pressed={tab === "report"}
              onClick={() => setTab("report")}
            >
              Client report
            </button>
          </nav>
          <button className="button quiet" onClick={downloadCsv}>
            <ArrowDownToLine size={16} />
            Export CSV
          </button>
        </div>
      </header>
      <div className="credit-overview" aria-busy={summary.isFetching}>
        {/* The month the figures below describe, and the agency's month actions, head the card. */}
        <div className="credit-month-bar">
          <div className="credit-month-switcher">
            <button
              type="button"
              className="icon-button"
              aria-label="Previous month"
              disabled={monthIndex <= 0}
              onClick={() => changeFilter({ month: months[monthIndex - 1] })}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <select
              aria-label="Credit month"
              value={filters.month}
              onChange={(event) => changeFilter({ month: event.target.value })}
            >
              <option value="">All months</option>
              {months.map((item) => (
                <option key={item} value={item}>
                  {formatMonth(item)}
                  {item === currentMonth ? " (this month)" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button"
              aria-label="Next month"
              disabled={monthIndex < 0 || monthIndex >= months.length - 1}
              onClick={() => changeFilter({ month: months[monthIndex + 1] })}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
          {isAgency && (
            <div className="credit-month-actions">
              <button type="button" className="button quiet" onClick={() => setMonthAction("plan")}>
                Set plan
              </button>
              {writable && (
                <>
                  <button
                    type="button"
                    className="button quiet"
                    onClick={() => setMonthAction("transfer")}
                  >
                    Transfer
                  </button>
                  <button type="button" className="button" onClick={() => setMonthAction("extra")}>
                    Add extra
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {summary.error ? (
          <FormError>
            {formatMonth(cardMonth)} could not be loaded.{" "}
            <button className="button quiet" onClick={() => void summary.refetch()}>
              Try again
            </button>
          </FormError>
        ) : (
          <>
            <section>
              <span className="eyebrow">Available in {formatMonth(cardMonth)}</span>
              <div className="credit-balance">
                {month ? formatCredits(month.available).amount : "…"}
                <span>{month ? formatCredits(month.available).word : "credits"}</span>
              </div>
              {month && month.expiring > 0 ? (
                <p className="credit-expiry">
                  {formatCredits(month.expiring).amount} {formatCredits(month.expiring).word}{" "}
                  {month.expiring === 1 ? "expires" : "expire"} on{" "}
                  {formatDateLong(month.expires_on)}.
                </p>
              ) : month && month.expired > 0 ? (
                <p>
                  {formatCredits(month.expired).amount} {formatCredits(month.expired).word} expired
                  at the end of the month.
                </p>
              ) : (
                <p>Credits left in a month expire when it ends.</p>
              )}
            </section>
            <section>
              <span className="eyebrow">Used in {formatMonth(cardMonth)}</span>
              <div className="credit-consumed">{month ? month.used : "…"}</div>
              <p>
                {projectCount} {projectCount === 1 ? "project" : "projects"}
                {month?.allowance ? ` · ${month.allowance} from the plan` : ""}
                {month?.extras ? ` · ${month.extras} extra` : ""}
                {month?.transferred
                  ? ` · ${month.transferred > 0 ? "+" : ""}${month.transferred} transferred`
                  : ""}
              </p>
            </section>
            <section className="credit-plan">
              <h2>
                {plan
                  ? `${formatCredits(plan.monthly_credits).amount} ${formatCredits(plan.monthly_credits).word} a month`
                  : "No monthly plan"}
              </h2>
              <p>
                {plan
                  ? `Plan since ${formatMonth(plan.starts_on)}. Briefings are free to submit; the studio confirms a budget before each project starts.`
                  : "Briefings are free to submit. The studio confirms a credit budget before each project starts."}
              </p>
            </section>
          </>
        )}
      </div>
      <div className="credit-toolbar">
        <SearchField
          label="Search credit activity"
          value={filters.search}
          onChange={(value) => changeFilter({ search: value })}
          placeholder="Find an activity…"
          iconSize={16}
        />
        <button
          className="button quiet"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={15} />
          Filters
        </button>
      </div>
      {filtersOpen && (
        <div className="credit-filters">
          <label>
            Activity
            <select
              value={filters.kind}
              onChange={(event) =>
                changeFilter({ kind: event.target.value as CreditFilters["kind"] })
              }
            >
              <option value="all">All activity</option>
              <option value="used">Project debits</option>
              <option value="added">Credits added</option>
            </select>
          </label>
          <label>
            Campaign
            <select
              value={filters.campaignId}
              onChange={(event) => changeFilter({ campaignId: event.target.value, projectId: "" })}
            >
              <option value="">All campaigns</option>
              {campaignList.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project
            <select
              value={filters.projectId}
              onChange={(event) => changeFilter({ projectId: event.target.value })}
            >
              <option value="">All projects</option>
              {projectList
                .filter((item) => !filters.campaignId || item.campaign_id === filters.campaignId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="button quiet"
            onClick={() => changeFilter({ search: "", kind: "all", campaignId: "", projectId: "" })}
          >
            Clear filters
          </button>
        </div>
      )}
      {exportError && <FormError>{exportError}</FormError>}
      {ledger.isPlaceholderData ? (
        // A month switch keeps the previous month's entries on screen (`keepPreviousData`) while
        // this one loads; filtering those old rows by the new month's filter would otherwise show
        // an empty result and flash "No activity in this view" before the real rows arrive.
        <p role="status">Loading activity…</p>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <h2>No activity in this view.</h2>
          <p>Try another month or clear your filters.</p>
        </div>
      ) : (
        <div className="credit-list">
          {visible.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="credit-list-row"
              onClick={() => setDetail(entry)}
            >
              <strong>{projectFor(entry)?.title ?? entry.description}</strong>
              <span className="credit-list-kind">
                {tab === "report"
                  ? (campaignList.find((item) => item.id === projectFor(entry)?.campaign_id)
                      ?.title ?? creditKindLabels[entry.kind])
                  : creditKindLabels[entry.kind]}
              </span>
              <span className="credit-list-date">{formatDateLong(entry.created_at)}</span>
              <span className="credit-list-amount credit-number">
                {entry.amount > 0 ? "+" : ""}
                {entry.amount}
              </span>
              <span className="credit-list-balance credit-number">{entry.balance_after} left</span>
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
      )}
      <section id="credit-requests" className="credit-requests">
        <h2>Credit requests</h2>
        {requests.isPending ? (
          <p role="status">Loading requests…</p>
        ) : requests.error ? (
          <FormError>
            Requests could not be loaded.{" "}
            <button className="button quiet" onClick={() => void requests.refetch()}>
              Try again
            </button>
          </FormError>
        ) : requests.data?.length ? (
          <div className="credit-request-list">
            {requests.data.map((item) => (
              <div key={item.id} className="credit-request-row">
                <strong>{item.amount} credits</strong>
                <span
                  className="credit-request-note"
                  title={[item.note || "Additional credits requested", item.response_note]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  {item.note || "Additional credits requested"}
                  {item.response_note ? ` · ${item.response_note}` : ""}
                </span>
                <span className="credit-request-date">{formatDateLong(item.created_at)}</span>
                <span className={statusToneClass(creditRequestStatusTones[item.status])}>
                  {creditRequestStatusLabels[item.status]}
                </span>
                {profile?.role === "agency" && item.status === "pending" ? (
                  <button className="button" onClick={() => setRequest(item)}>
                    Review
                  </button>
                ) : (
                  <span aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>No credit requests yet.</h2>
            <p>Requests for more credits will appear here.</p>
          </div>
        )}
      </section>
      {action && (
        <CreditActionDialog clientId={clientId} mode={action} onClose={() => setAction(null)} />
      )}
      {monthAction && (
        <CreditMonthDialog
          clientId={clientId}
          mode={monthAction}
          currentMonth={currentMonth}
          month={cardMonth}
          monthlyCredits={planForMonth(plans.data ?? [], cardMonth)?.monthly_credits ?? null}
          onClose={() => setMonthAction(null)}
        />
      )}
      {request && <CreditRequestReview request={request} onClose={() => setRequest(null)} />}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Credit details">
        {detail && (
          <div className="credit-detail">
            <h3>{projectFor(detail)?.title ?? detail.description}</h3>
            <p>
              {creditKindLabels[detail.kind]} · {detail.amount > 0 ? "+" : ""}
              {detail.amount} credits
            </p>
            <p>
              {formatMonth(detail.month)} · balance after activity: {detail.balance_after} credits
            </p>
            {deliverableBreakdown(briefFor(detail)) && (
              <section>
                <h4>Deliverable breakdown</h4>
                <p>{deliverableBreakdown(briefFor(detail))}</p>
              </section>
            )}
            {creditEntryNote(detail, briefFor(detail)) && (
              <section>
                <h4>{detail.kind === "project_debit" ? "Studio scope note" : "Reason"}</h4>
                <p>{creditEntryNote(detail, briefFor(detail))}</p>
              </section>
            )}
            {detail.project_id && (
              <Link href={`/projects/${detail.project_id}`} className="button">
                Open project
                <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
