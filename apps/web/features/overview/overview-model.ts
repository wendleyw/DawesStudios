import type { CreditEntry } from "@/features/credits/credit-model";
import {
  inReviewTab,
  publishedVersionStatus,
  type ReviewRow,
} from "@/features/reviews/review-data";
import type { Project } from "@/features/workspace/workspace-data";

/** Rows per dashboard column; "See all" leads to the full list. */
export const ROW_LIMIT = 5;

const DAY = 86_400_000;
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** When a delivered project shipped: its delivery instant, else its last update (older rows). */
export function deliveredOn(project: Project): string {
  return project.delivered_at ?? project.updated_at;
}

/**
 * "today", "yesterday", "3 days ago", "last week", "2 months ago" … never a future phrase.
 *
 * Counted in calendar days in the studio's time zone (`formatDayKey`, from `useDateFormat()`), not
 * elapsed 24-hour blocks — a New York evening after 20:00 EDT is already the next UTC calendar day,
 * which used to make "yesterday" read as "today" and shift every later bucket by one.
 */
export function relativeAge(
  date: string,
  now: Date,
  formatDayKey: (date: string) => string,
): string {
  const days = Math.max(
    0,
    (Date.parse(formatDayKey(now.toISOString())) - Date.parse(formatDayKey(date))) / DAY,
  );
  if (days < 7) return relative.format(-days, "day");
  if (days < 30) return relative.format(-Math.floor(days / 7), "week");
  if (days < 365) return relative.format(-Math.floor(days / 30), "month");
  return relative.format(-Math.floor(days / 365), "year");
}

/** Soonest due first; undated projects last, newest first among themselves. */
export function bySoonestDue(a: Project, b: Project): number {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return b.created_at.localeCompare(a.created_at);
}

const newestDelivery = (a: Project, b: Project) => deliveredOn(b).localeCompare(deliveredOn(a));
const inProgress = new Set(["planned", "in_progress", "internal_review", "changes_requested"]);
const withStudio = new Set(["awaiting_review", "budget_confirmed"]);

type MonthFormatter = (date: string | null) => string;

export type ClientOverview = {
  credits: { remaining: number; used: number; total: number };
  active: number;
  deliveredThisMonth: number;
  needsReview: number;
  inFlight: { withStudio: number; inProgress: number; delivered: number };
  moving: Project[];
  yourTurn: ReviewRow[];
  shipped: Project[];
  creditsByProject: Map<string, number>;
};

/**
 * Everything the client Overview shows. Reviews go through the client's own **Waiting for you**
 * rule (`inReviewTab`), which also drops every internal row, so the studio's view of this page
 * shows exactly what the client sees.
 */
export function clientOverview(input: {
  projects: Project[];
  briefings: { status: string }[];
  ledger: CreditEntry[];
  balance: number;
  reviews: ReviewRow[];
  now: Date;
  formatMonth: MonthFormatter;
}): ClientOverview {
  const active = input.projects.filter((project) => project.status !== "delivered");
  const delivered = input.projects.filter((project) => project.status === "delivered");
  const month = input.formatMonth(input.now.toISOString());
  const creditsByProject = new Map<string, number>();
  let used = 0;
  for (const entry of input.ledger) {
    if (entry.kind !== "project_debit") continue;
    used -= entry.amount;
    if (entry.project_id)
      creditsByProject.set(
        entry.project_id,
        (creditsByProject.get(entry.project_id) ?? 0) - entry.amount,
      );
  }
  const waiting = input.reviews.filter((row) => inReviewTab("waiting", row, "client"));
  return {
    credits: { remaining: input.balance, used, total: input.balance + used },
    active: active.length,
    deliveredThisMonth: delivered.filter(
      (project) => input.formatMonth(deliveredOn(project)) === month,
    ).length,
    needsReview: waiting.length,
    inFlight: {
      withStudio: input.briefings.filter((briefing) => withStudio.has(briefing.status)).length,
      inProgress: active.filter((project) => inProgress.has(project.status)).length,
      delivered: delivered.length,
    },
    moving: active.toSorted(bySoonestDue).slice(0, ROW_LIMIT),
    yourTurn: waiting.toSorted((a, b) => a.date.localeCompare(b.date)).slice(0, ROW_LIMIT),
    shipped: delivered.toSorted(newestDelivery).slice(0, ROW_LIMIT),
    creditsByProject,
  };
}

export type RawDesignerVersion = {
  id: string;
  project_id: string;
  deliverable_id: string;
  version_number: number;
  status: string;
  created_at: string;
};

export type DesignerVersion = {
  id: string;
  projectId: string;
  title: string;
  deliverable: string;
  version: number;
  status: string;
  date: string;
};

/**
 * Each deliverable's latest version on the designer's projects. A version shared with the client
 * takes the client's decision from its project (`publishedVersionStatus`), so a share the client
 * sent back reads as changes requested.
 */
export function designerVersions(
  versions: RawDesignerVersion[],
  deliverables: { id: string; name: string }[],
  projects: Project[],
): DesignerVersion[] {
  const latest = new Map<string, RawDesignerVersion>();
  for (const version of versions) {
    const current = latest.get(version.deliverable_id);
    if (!current || current.version_number < version.version_number)
      latest.set(version.deliverable_id, version);
  }
  return [...latest.values()].flatMap((version) => {
    const project = projects.find((item) => item.id === version.project_id);
    if (!project) return [];
    return [
      {
        id: version.id,
        projectId: project.id,
        title: project.title,
        deliverable:
          deliverables.find((item) => item.id === version.deliverable_id)?.name ?? "Deliverable",
        version: version.version_number,
        status: publishedVersionStatus(version.status, project.status),
        date: version.created_at,
      },
    ];
  });
}

export type DesignerOverview = {
  active: number;
  yourTurn: number;
  inStudioReview: number;
  deliveredThisMonth: number;
  moving: Project[];
  yourTurnRows: DesignerVersion[];
  delivered: Project[];
};

/** Everything the designer's `/home` shows, over the projects their assignments admit. */
export function designerOverview(input: {
  projects: Project[];
  versions: DesignerVersion[];
  now: Date;
  formatMonth: MonthFormatter;
}): DesignerOverview {
  const active = input.projects.filter((project) => project.status !== "delivered");
  const delivered = input.projects.filter((project) => project.status === "delivered");
  const month = input.formatMonth(input.now.toISOString());
  const sentBack = input.versions.filter((version) => version.status === "changes_requested");
  return {
    active: active.length,
    yourTurn: sentBack.length,
    inStudioReview: input.versions.filter((version) => version.status === "submitted").length,
    deliveredThisMonth: delivered.filter(
      (project) => input.formatMonth(deliveredOn(project)) === month,
    ).length,
    moving: active.toSorted(bySoonestDue).slice(0, ROW_LIMIT),
    yourTurnRows: sentBack.toSorted((a, b) => a.date.localeCompare(b.date)).slice(0, ROW_LIMIT),
    delivered: delivered.toSorted(newestDelivery).slice(0, ROW_LIMIT),
  };
}
