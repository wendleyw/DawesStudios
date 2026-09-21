"use client";

import { ArrowDownToLine, ArrowUpRight, Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { useBriefings, useCampaigns } from "@/features/briefings/briefing-data";
import { useClients, useDateFormat, useProjects } from "@/features/workspace/workspace-data";
import { CreditActionDialog, CreditRequestReview } from "./credit-actions";
import { useCreditAccount, useCreditLedger, useCreditRequests } from "./credit-data";
import {
  creditCsv,
  creditKindLabels,
  creditRequestStatusLabels,
  deliverableBreakdown,
  filterCreditEntries,
  type CreditEntry,
  type CreditFilters,
  type CreditRequest,
} from "./credit-model";
import "./credits.css";
import { FormError } from "@/features/shared/form-error";
import { SearchField } from "@/features/shared/search-field";
import { PageStatus } from "@/features/shared/page-status";

export function CreditsPage({ clientId }: { clientId: string }) {
  const { profile } = useAuth();
  const { formatDateLong, formatMonth } = useDateFormat();
  const clients = useClients();
  const projects = useProjects(clientId);
  const briefings = useBriefings(clientId);
  const campaigns = useCampaigns(clientId);
  const account = useCreditAccount(clientId);
  const ledger = useCreditLedger(clientId);
  const requests = useCreditRequests(clientId);
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<CreditFilters>({
    search: "",
    kind: "all",
    month: "",
    campaignId: "",
    projectId: searchParams.get("project") ?? "",
  });
  const [tab, setTab] = useState(searchParams.has("project") ? "report" : "activity");
  const [filtersOpen, setFiltersOpen] = useState(searchParams.has("project"));
  const [action, setAction] = useState<"request" | "adjust" | null>(null);
  const [detail, setDetail] = useState<CreditEntry | null>(null);
  const [request, setRequest] = useState<CreditRequest | null>(null);
  const [exportError, setExportError] = useState("");
  if (profile?.role === "designer")
    return (
      <div className="page-content">
        <h1>Credits are managed by the studio.</h1>
        <Link className="button" href="/home">
          Back to your work
        </Link>
      </div>
    );
  if (
    clients.isPending ||
    account.isPending ||
    ledger.isPending ||
    projects.isPending ||
    briefings.isPending ||
    campaigns.isPending
  )
    return <PageStatus>Loading your credits…</PageStatus>;
  const client = clients.data?.find((item) => item.id === clientId);
  if (
    !client ||
    account.error ||
    ledger.error ||
    projects.error ||
    campaigns.error ||
    briefings.error
  )
    return (
      <div className="page-content">
        <h1>Credits unavailable.</h1>
        <FormError>Your credit report could not be loaded. Please try again.</FormError>
        <button
          className="button"
          onClick={() => {
            void clients.refetch();
            void account.refetch();
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
  const consumed = -entries
    .filter((entry) => entry.kind === "project_debit")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const months = [...new Set(entries.map((entry) => entry.created_at.slice(0, 7)))]
    .sort()
    .reverse();
  const projectFor = (entry: CreditEntry) =>
    projectList.find((item) => item.id === entry.project_id);
  const briefFor = (entry: CreditEntry) =>
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
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${client!.slug}-credit-report.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportError("");
    } catch {
      setExportError("The report could not be downloaded. Please try again.");
    }
  }
  return (
    <div className="page-content credits-page">
      <header className="page-heading">
        <div>
          <h1>Credits</h1>
          <p>A clear view of your creative investment.</p>
        </div>
        <button
          className="button primary"
          onClick={() => setAction(profile?.role === "agency" ? "adjust" : "request")}
        >
          <Plus size={16} />
          {profile?.role === "agency" ? "Adjust credits" : "Request credits"}
        </button>
      </header>
      <div className="credit-overview">
        <section>
          <span className="eyebrow">Available balance</span>
          <div className="credit-balance">
            {account.data?.balance ?? 0}
            <span>credits</span>
          </div>
          <p>Ready for your next project.</p>
        </section>
        <section>
          <span className="eyebrow">Project credits used</span>
          <div className="credit-consumed">{consumed}</div>
          <p>
            {entries.filter((entry) => entry.kind === "project_debit").length} projects · one debit
            per project
          </p>
        </section>
        <section className="credit-plan">
          <h2>Scope first. One clear total.</h2>
          <p>
            Briefings are free to submit. The studio confirms a credit budget before each project
            starts.
          </p>
        </section>
      </div>
      <div className="credit-navigation">
        <nav className="credit-tabs" aria-label="Credit views">
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
            Period
            <select
              value={filters.month}
              onChange={(event) => changeFilter({ month: event.target.value })}
            >
              <option value="">All time</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonth(`${month}-01`)}
                </option>
              ))}
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
            onClick={() =>
              setFilters({ search: "", kind: "all", month: "", campaignId: "", projectId: "" })
            }
          >
            Clear filters
          </button>
        </div>
      )}
      {exportError && <FormError>{exportError}</FormError>}
      {visible.length === 0 ? (
        <div className="empty-state">
          <h2>No activity in this view.</h2>
          <p>Try another period or clear your filters.</p>
        </div>
      ) : (
        <div className="credit-table-wrap">
          <table className="credit-table">
            <thead>
              <tr>
                <th scope="col">{tab === "report" ? "Project / activity" : "Activity"}</th>
                <th scope="col">Date</th>
                <th scope="col">Credits</th>
                <th scope="col">Balance after</th>
                <th scope="col">
                  <span className="visually-hidden">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <strong>{projectFor(entry)?.title ?? entry.description}</strong>
                    <span>
                      {tab === "report"
                        ? (campaignList.find((item) => item.id === projectFor(entry)?.campaign_id)
                            ?.title ?? creditKindLabels[entry.kind])
                        : creditKindLabels[entry.kind]}
                    </span>
                  </td>
                  <td>{formatDateLong(entry.created_at)}</td>
                  <td className="credit-number">
                    {entry.amount > 0 ? "+" : ""}
                    {entry.amount}
                  </td>
                  <td className="credit-number">{entry.balance_after}</td>
                  <td>
                    <button
                      className="button quiet"
                      aria-label={`View ${entry.description} credit details`}
                      onClick={() => setDetail(entry)}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="credit-requests">
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
          requests.data.map((item) => (
            <div key={item.id} className="credit-request">
              <div>
                <strong>{item.amount} credits</strong>
                <p>{item.note || "Additional credits requested"}</p>
                {item.response_note && <p>{item.response_note}</p>}
              </div>
              <span className={`status-badge ${item.status}`}>
                {creditRequestStatusLabels[item.status]}
              </span>
              {profile?.role === "agency" && item.status === "pending" && (
                <button className="button" onClick={() => setRequest(item)}>
                  Review
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="credit-note">No credit requests yet.</p>
        )}
      </section>
      {action && (
        <CreditActionDialog clientId={clientId} mode={action} onClose={() => setAction(null)} />
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
            <p>Balance after activity: {detail.balance_after} credits</p>
            {deliverableBreakdown(briefFor(detail)) && (
              <section>
                <h4>Deliverable breakdown</h4>
                <p>{deliverableBreakdown(briefFor(detail))}</p>
              </section>
            )}
            {briefFor(detail)?.budget_note && (
              <section>
                <h4>Studio scope note</h4>
                <p>{briefFor(detail)?.budget_note}</p>
              </section>
            )}
            {detail.kind === "adjustment" && <p>{detail.description}</p>}
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
