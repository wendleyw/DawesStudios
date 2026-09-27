import { describe, expect, it } from "vitest";
import {
  creditCsv,
  creditRemainingRatio,
  csvCell,
  filterCreditEntries,
  formatCredits,
  projectCreditsUsed,
  type CreditEntry,
  type CreditFilters,
} from "./credit-model";
import type { Project } from "@/features/workspace/workspace-data";
import type { Briefing } from "@/features/briefings/briefing-model";

const project: Project = {
  id: "project",
  client_id: "client",
  campaign_id: "campaign",
  briefing_id: "brief",
  title: 'Launch, "considered"',
  description: "",
  service_type: "social",
  status: "planned",
  due_date: null,
  delivered_at: null,
  start_date: null,
  board_position: { x: 0, y: 0 },
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
};
const entries: CreditEntry[] = [
  {
    id: "opening",
    client_id: "client",
    project_id: null,
    amount: 100,
    balance_after: 100,
    kind: "allocation",
    description: "Opening allocation",
    created_at: "2026-08-31T23:59:00Z",
  },
  {
    id: "debit",
    client_id: "client",
    project_id: "project",
    amount: -5,
    balance_after: 95,
    kind: "project_debit",
    description: "Launch",
    created_at: "2026-09-01T00:01:00Z",
  },
  {
    id: "addition",
    client_id: "client",
    project_id: null,
    amount: 25,
    balance_after: 120,
    kind: "adjustment",
    description: "Approved addition",
    created_at: "2026-09-15T12:00:00Z",
  },
];
const allFilters: CreditFilters = {
  search: "",
  kind: "all",
  month: "",
  campaignId: "",
  projectId: "",
};

describe("credit report filtering", () => {
  it("combines month, campaign, project and search without changing ledger balances", () => {
    const filtered = filterCreditEntries(entries, [project], {
      ...allFilters,
      month: "2026-09",
      campaignId: "campaign",
      projectId: "project",
      search: "LAUNCH",
    });
    expect(filtered).toEqual([entries[1]]);
    expect(filtered[0].balance_after).toBe(95);
  });
  it("selects added credits across allocation and adjustment without including debits", () => {
    expect(
      filterCreditEntries(entries, [project], { ...allFilters, kind: "added" }).map(
        (item) => item.id,
      ),
    ).toEqual(["opening", "addition"]);
  });
  it("uses UTC month boundaries and returns a genuine empty result", () => {
    expect(
      filterCreditEntries(entries, [project], { ...allFilters, month: "2026-08" }).map(
        (item) => item.id,
      ),
    ).toEqual(["opening"]);
    expect(
      filterCreditEntries(entries, [project], { ...allFilters, campaignId: "another-campaign" }),
    ).toEqual([]);
  });
});

describe("credit CSV export", () => {
  it.each([
    '=HYPERLINK("https://example.test")',
    "+SUM(1,1)",
    "-dangerous",
    "@formula",
    "\t=payload",
    " \r+payload",
  ])("neutralizes formula-like text %s", (value) => {
    expect(csvCell(value).startsWith("\"'")).toBe(true);
  });
  it("preserves numeric debits and escapes quotes and embedded newlines", () => {
    expect(csvCell(-5)).toBe('"-5"');
    expect(csvCell('A "clear"\nbrief')).toBe('"A ""clear""\nbrief"');
  });
  it("exports the selected ledger rows with matching scope and budget explanation", () => {
    const briefing: Briefing = {
      id: "brief",
      client_id: "client",
      campaign_id: "campaign",
      title: "Launch",
      service_type: "social",
      status: "accepted",
      overview: "",
      goals: "",
      direction: {},
      requested_deliverables: [
        { name: "Feed", format: "feed", width: 1080, height: 1350, quantity: 1, scope: "original" },
      ],
      due_date: null,
      estimated_credits: 2,
      confirmed_credits: 5,
      budget_note: "Additional retouching approved.",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    };
    const csv = creditCsv({
      clientName: "Example",
      entries: [entries[1]],
      projects: [project],
      campaigns: [{ id: "campaign", title: "Fall campaign" }],
      briefings: [briefing],
    });
    expect(csv).toContain(
      '"Client","Date (UTC)","Project","Campaign","Activity","Credits","Balance after activity","Deliverable breakdown","Agency adjustment"',
    );
    expect(csv).toContain('"Launch, ""considered""","Fall campaign","Project debit","-5","95"');
    expect(csv).toContain("Feed (1080 × 1350 px): 1 original");
    expect(csv).toContain("Additional retouching approved.");
    expect(csv).not.toContain("Opening allocation");
  });
  it("exports headers for an empty report without fabricating activity", () => {
    const csv = creditCsv({
      clientName: "Example",
      entries: [],
      projects: [],
      campaigns: [],
      briefings: [],
    });
    expect(csv.split("\r\n")).toHaveLength(2);
  });
});

describe("formatCredits", () => {
  it.each([
    [0, "0", "credits"],
    [1, "1", "credit"],
    [2, "2", "credits"],
    [1234, "1,234", "credits"],
  ])("words %i credits as %s %s", (count, amount, word) => {
    expect(formatCredits(count)).toEqual({ amount, word });
  });
});

describe("projectCreditsUsed", () => {
  it("is the project's debit, as a positive number of credits", () => {
    expect(projectCreditsUsed([{ amount: -3, kind: "project_debit" }])).toBe(3);
  });

  it("adds every debit and ignores other kinds of entry", () => {
    expect(
      projectCreditsUsed([
        { amount: -3, kind: "project_debit" },
        { amount: -2, kind: "project_debit" },
        { amount: 5, kind: "adjustment" },
      ]),
    ).toBe(5);
  });

  it("is null when the project has no debit", () => {
    expect(projectCreditsUsed([])).toBeNull();
    expect(projectCreditsUsed([{ amount: 100, kind: "allocation" }])).toBeNull();
  });
});

describe("creditRemainingRatio", () => {
  it("is the balance as a share of the balance after the latest top-up", () => {
    expect(creditRemainingRatio(25, 100)).toBe(0.25);
    expect(creditRemainingRatio(100, 100)).toBe(1);
  });

  it("stays within 0 and 1", () => {
    expect(creditRemainingRatio(150, 100)).toBe(1);
    expect(creditRemainingRatio(-5, 100)).toBe(0);
  });

  it("is null without a positive top-up balance to measure against", () => {
    expect(creditRemainingRatio(40, null)).toBeNull();
    expect(creditRemainingRatio(40, 0)).toBeNull();
  });
});
