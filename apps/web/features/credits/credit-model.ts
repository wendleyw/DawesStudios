import type { StatusTone } from "@/features/shared/status-tone";
import { formatSize, type Briefing } from "@/features/briefings/briefing-model";
import { describeSupabaseError } from "@/lib/supabase";
import type { Project } from "@/features/workspace/workspace-data";

export type CreditEntry = {
  id: string;
  client_id: string;
  project_id: string | null;
  amount: number;
  balance_after: number;
  kind: CreditKind;
  description: string;
  created_at: string;
};
/** Every kind of ledger entry the backend writes (`supabase/migrations/202609270003_monthly_credits.sql`). */
export type CreditKind =
  | "allocation"
  | "project_debit"
  | "adjustment"
  | "plan_allowance"
  | "extra"
  | "transfer_out"
  | "transfer_in"
  | "final_adjustment"
  | "expiry"
  | "project_refund";
/** A ledger row as the Credits page reads it: with the credit month it counts against. */
export type CreditLedgerEntry = CreditEntry & { month: string };
/** `credit_month_summary(client, month)`: one month's figures, projected for an untouched month. */
export type CreditMonthSummary = {
  month: string;
  status: string;
  available: number;
  allowance: number;
  extras: number;
  used: number;
  transferred: number;
  expiring: number;
  expired: number;
  expires_on: string;
};
export type CreditPlan = { monthly_credits: number; starts_on: string };
export type CreditRequest = {
  id: string;
  client_id: string;
  amount: number;
  note: string;
  status: "pending" | "fulfilled" | "rejected";
  response_note: string;
  created_at: string;
};
export type CreditFilters = {
  search: string;
  kind: "all" | "used" | "added";
  month: string;
  campaignId: string;
  projectId: string;
};
export const creditKindLabels: Record<CreditKind, string> = {
  allocation: "Credit allocation",
  project_debit: "Project debit",
  adjustment: "Credit adjustment",
  plan_allowance: "Monthly allowance",
  extra: "Extra credits",
  transfer_out: "Moved to another month",
  transfer_in: "Moved from another month",
  final_adjustment: "Final settlement",
  expiry: "Expired credits",
  project_refund: "Project refund",
};

/** The entries that make up what a project cost: its debit, a refund on a move, its settlement. */
const PROJECT_COST_KINDS: ReadonlySet<CreditKind> = new Set([
  "project_debit",
  "project_refund",
  "final_adjustment",
]);
export const projectCostKinds = [...PROJECT_COST_KINDS];

/**
 * A credit month is the first day of a month in UTC, as `YYYY-MM-01` — the same boundary the
 * database's `private.month_of` uses, whatever the studio's display timezone. A string is read as a
 * date (`briefings/briefing-model.ts`'s `defaultAcceptanceMonth` calls this with a due date, and
 * `creditMonthLabel` below calls it with an existing `YYYY-MM-01`).
 */
export function creditMonthOf(at: Date | string): string {
  if (typeof at === "string" && /^\d{4}-\d{2}/.test(at)) return `${at.slice(0, 7)}-01`;
  const date = typeof at === "string" ? new Date(at) : at;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** The credit month `count` months after `month` (negative goes back). */
export function addCreditMonths(month: string, count: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  return creditMonthOf(new Date(Date.UTC(year, monthIndex - 1 + count, 1)));
}

/** The credit months from `before` months back to `after` months ahead of `current`, oldest first. */
export function creditMonthRange(current: string, before: number, after: number): string[] {
  return Array.from({ length: before + after + 1 }, (_, index) =>
    addCreditMonths(current, index - before),
  );
}

/** The months the agency can write to: the current month and the next 11. */
export function writableCreditMonths(current: string): string[] {
  return creditMonthRange(current, 0, 11);
}

/** "October 2026" for `2026-10-01` (or any date-like string or `Date`, normalized through `creditMonthOf`). */
export function creditMonthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${creditMonthOf(month)}T00:00:00Z`));
}

/** The plan in force for a month: the one with the latest start on or before it. */
export function planForMonth(plans: CreditPlan[], month: string): CreditPlan | null {
  return (
    plans
      .filter((plan) => plan.starts_on <= month)
      .sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0] ?? null
  );
}

/** Days left in `now`'s UTC month, counting today: 1 on the last day. */
export function daysLeftInMonth(now: Date): number {
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return last.getUTCDate() - now.getUTCDate() + 1;
}

/** The window before a month ends in which the header warns about expiring credits. */
export const EXPIRY_NOTICE_DAYS = 7;

/**
 * What expires at the end of the current month, when it is worth a warning in the header: only in
 * the month's last seven days and only when something is left. Null otherwise.
 */
export function expiringNotice(
  summary: Pick<CreditMonthSummary, "expiring" | "expires_on" | "status"> | null | undefined,
  now: Date,
): { amount: number; on: string } | null {
  if (!summary || summary.status !== "open" || summary.expiring <= 0) return null;
  if (daysLeftInMonth(now) > EXPIRY_NOTICE_DAYS) return null;
  return { amount: summary.expiring, on: summary.expires_on };
}

/** Everything a month received: its allowance, extras and net transfers. The meter's full mark. */
export function monthCreditsReceived(
  summary: Pick<CreditMonthSummary, "allowance" | "extras" | "transferred">,
): number {
  return summary.allowance + summary.extras + summary.transferred;
}

/**
 * A Postgres error's JSON `details` payload, or null when it is missing or malformed — shared by
 * `describeCreditError` below and `project-data.ts`'s `settleProjectCredits`, so a short or empty
 * `details` string falls back to the caller's default instead of a raw `JSON.parse` throwing a
 * `SyntaxError` that replaces the real error.
 */
export function parseErrorDetails<T>(details: string | null | undefined): T | null {
  if (!details) return null;
  try {
    return JSON.parse(details) as T;
  } catch {
    return null;
  }
}

/**
 * A credit write's error as the person should read it. A month outside the writable range (errcode
 * 22023) and a month that is short (`insufficient_month_credits`, with its figures in `details`)
 * get plain sentences; anything else keeps the backend's message.
 */
export function describeCreditError(error: {
  message: string;
  code?: string;
  details?: string | null;
}): string {
  if (error.code === "22023")
    return error.message === "A month is required"
      ? "Choose a month."
      : "Choose the current month or one of the next 11 months.";
  if (error.message === "insufficient_month_credits") {
    const detail = parseErrorDetails<{ available: number; shortfall: number }>(error.details);
    if (!detail) return "That month does not have enough credits.";
    const available = formatCredits(detail.available);
    return `That month has ${available.amount} ${available.word} available, ${formatCredits(detail.shortfall).amount} short.`;
  }
  return error.message;
}

/**
 * `assertResult` for the monthly-credit procedures: it keeps the error's code and details, so a
 * month outside the writable range (errcode 22023) or a short month reads as a sentence
 * (`describeCreditError`). Shared by `credit-data.ts`'s writes and `project-data.ts`'s
 * `moveProjectMonth`, instead of each declaring its own copy of the same three lines.
 */
export function assertCreditResult<T>(result: {
  data: T | null;
  error: { message: string; code?: string; details?: string | null } | null;
}): T {
  if (result.error)
    throw new Error(
      describeCreditError({ ...result.error, message: describeSupabaseError(result.error) }),
    );
  return result.data as T;
}

/** The three states a credit request can hold, named here rather than at the one call site. */
export const creditRequestStatusLabels: Record<CreditRequest["status"], string> = {
  pending: "Pending",
  fulfilled: "Allocated",
  rejected: "Declined",
};

/**
 * A credit request read as a badge tone. A pending request waits on the agency. A fulfilled one
 * produced the credits it asked for. A declined one is closed but produced nothing, so it rests at
 * `neutral` rather than claiming the completion tone.
 */
export const creditRequestStatusTones: Record<CreditRequest["status"], StatusTone> = {
  pending: "attention",
  fulfilled: "complete",
  rejected: "neutral",
};

/**
 * The credits a project used, as a positive number: its debits, less a refund when it moved to
 * another month, plus its final settlement. Null when it was never debited.
 */
export function projectCreditsUsed(entries: Pick<CreditEntry, "amount" | "kind">[]): number | null {
  if (!entries.some((entry) => entry.kind === "project_debit")) return null;
  return entries
    .filter((entry) => PROJECT_COST_KINDS.has(entry.kind))
    .reduce((total, entry) => total - entry.amount, 0);
}

const creditCountFormatter = new Intl.NumberFormat("en-US");

/**
 * A credit count worded the one way the product shows it: the grouped number (`"1,234"`) and its
 * unit, singular only for exactly one. `credit-account-menu.tsx`, `project-credits-chip.tsx` and the
 * client Overview's per-project credit line all share this rule instead of each declaring its own
 * `Intl.NumberFormat` and `count === 1 ? "credit" : "credits"` ternary.
 */
export function formatCredits(count: number): { amount: string; word: "credit" | "credits" } {
  return { amount: creditCountFormatter.format(count), word: count === 1 ? "credit" : "credits" };
}

/**
 * How much of what the current month received is still left, from 0 to 1, for the account menu's
 * ring and dot bar. Null when the month received nothing to measure against, so the menu shows the
 * number alone instead of a guessed proportion.
 */
export function creditRemainingRatio(balance: number, fullBalance: number | null): number | null {
  if (fullBalance == null || fullBalance <= 0) return null;
  return Math.min(1, Math.max(0, balance / fullBalance));
}

/**
 * `filters.month` is a credit month (`YYYY-MM-01`) matched against the month an entry counts
 * against, not the day it was written; empty means every month.
 */
export function filterCreditEntries<Entry extends CreditLedgerEntry>(
  entries: Entry[],
  projects: Project[],
  filters: CreditFilters,
): Entry[] {
  const projectMap = new Map(projects.map((item) => [item.id, item]));
  return entries.filter((entry) => {
    const project = entry.project_id ? projectMap.get(entry.project_id) : undefined;
    return (
      (!filters.month || entry.month === filters.month) &&
      (!filters.projectId || entry.project_id === filters.projectId) &&
      (!filters.campaignId || project?.campaign_id === filters.campaignId) &&
      (filters.kind === "all" ||
        (filters.kind === "used" ? PROJECT_COST_KINDS.has(entry.kind) : entry.amount > 0)) &&
      (!filters.search ||
        `${entry.description} ${project?.title ?? ""}`
          .toLowerCase()
          .includes(filters.search.trim().toLowerCase()))
    );
  });
}

export function deliverableBreakdown(briefing: Briefing | undefined) {
  return (
    briefing?.requested_deliverables
      .map((item) => `${item.name} (${formatSize(item)}): ${item.quantity} ${item.scope}`)
      .join("; ") ?? ""
  );
}

/**
 * The explanation shown with an entry: the studio's scope note for a project debit, and the
 * recorded reason for every other entry (an adjustment, extra, transfer or settlement).
 */
export function creditEntryNote(entry: CreditEntry, briefing: Briefing | undefined): string {
  if (entry.kind === "project_debit") return briefing?.budget_note ?? "";
  return entry.description;
}

export function csvCell(value: string | number): string {
  const text =
    typeof value === "number"
      ? String(value)
      : /^[\s\uFEFF]*[=+@-]/.test(value)
        ? `'${value}`
        : value;
  return `"${text.replaceAll('"', '""')}"`;
}

export function creditCsv({
  clientName,
  entries,
  projects,
  campaigns,
  briefings,
}: {
  clientName: string;
  entries: CreditLedgerEntry[];
  projects: Project[];
  campaigns: { id: string; title: string }[];
  briefings: Briefing[];
}): string {
  const headers = [
    "Client",
    "Month",
    "Date (UTC)",
    "Project",
    "Campaign",
    "Activity",
    "Credits",
    "Balance after activity",
    "Deliverable breakdown",
    "Note",
  ];
  const rows: (string | number)[][] = entries.map((entry) => {
    const project = projects.find((item) => item.id === entry.project_id);
    const briefing = briefings.find((item) => item.id === project?.briefing_id);
    return [
      clientName,
      entry.month.slice(0, 7),
      entry.created_at,
      project?.title ?? "",
      campaigns.find((item) => item.id === project?.campaign_id)?.title ?? "",
      creditKindLabels[entry.kind],
      entry.amount,
      entry.balance_after,
      deliverableBreakdown(briefing),
      creditEntryNote(entry, briefing),
    ];
  });
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/**
 * The month `accept_briefing` debits when none is passed: the due date's month, no earlier than the
 * current month and no later than the last open one. A briefing without a due date uses the current
 * month. The Month select opens on this, so leaving it untouched is exactly the database default.
 */
export function defaultAcceptanceMonth(dueDate: string | null, now: Date = new Date()): string {
  const months = writableCreditMonths(creditMonthOf(now));
  if (!dueDate) return months[0];
  const due = creditMonthOf(dueDate);
  if (due < months[0]) return months[0];
  return due > months[11] ? months[11] : due;
}
