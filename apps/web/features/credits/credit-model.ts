import type { StatusTone } from "@/features/shared/status-tone";
import { formatSize, type Briefing } from "@/features/briefings/briefing-model";
import type { Project } from "@/features/workspace/workspace-data";

export type CreditEntry = {
  id: string;
  client_id: string;
  project_id: string | null;
  amount: number;
  balance_after: number;
  kind: "allocation" | "project_debit" | "adjustment";
  description: string;
  created_at: string;
};
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
export const creditKindLabels: Record<CreditEntry["kind"], string> = {
  allocation: "Credit allocation",
  project_debit: "Project debit",
  adjustment: "Credit adjustment",
};

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

export function filterCreditEntries(
  entries: CreditEntry[],
  projects: Project[],
  filters: CreditFilters,
): CreditEntry[] {
  const projectMap = new Map(projects.map((item) => [item.id, item]));
  return entries.filter((entry) => {
    const project = entry.project_id ? projectMap.get(entry.project_id) : undefined;
    return (
      (!filters.month || entry.created_at.slice(0, 7) === filters.month) &&
      (!filters.projectId || entry.project_id === filters.projectId) &&
      (!filters.campaignId || project?.campaign_id === filters.campaignId) &&
      (filters.kind === "all" ||
        (filters.kind === "used" ? entry.kind === "project_debit" : entry.amount > 0)) &&
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
  entries: CreditEntry[];
  projects: Project[];
  campaigns: { id: string; title: string }[];
  briefings: Briefing[];
}): string {
  const headers = [
    "Client",
    "Date (UTC)",
    "Project",
    "Campaign",
    "Activity",
    "Credits",
    "Balance after activity",
    "Deliverable breakdown",
    "Agency adjustment",
  ];
  const rows: (string | number)[][] = entries.map((entry) => {
    const project = projects.find((item) => item.id === entry.project_id);
    const briefing = briefings.find((item) => item.id === project?.briefing_id);
    return [
      clientName,
      entry.created_at,
      project?.title ?? "",
      campaigns.find((item) => item.id === project?.campaign_id)?.title ?? "",
      creditKindLabels[entry.kind],
      entry.amount,
      entry.balance_after,
      deliverableBreakdown(briefing),
      briefing?.budget_note ?? (entry.kind === "adjustment" ? entry.description : ""),
    ];
  });
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
