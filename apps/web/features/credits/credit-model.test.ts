import { describe, expect, it } from "vitest";
import {
  defaultAcceptanceMonth,
  addCreditMonths,
  assertCreditResult,
  creditCsv,
  creditEntryNote,
  creditMonthLabel,
  creditMonthOf,
  creditMonthRange,
  creditRemainingRatio,
  csvCell,
  daysLeftInMonth,
  describeCreditError,
  expiringNotice,
  filterCreditEntries,
  formatCredits,
  monthCreditsReceived,
  parseErrorDetails,
  planForMonth,
  projectCreditsUsed,
  writableCreditMonths,
  type CreditFilters,
  type CreditLedgerEntry,
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
const entries: CreditLedgerEntry[] = [
  {
    id: "opening",
    client_id: "client",
    project_id: null,
    amount: 100,
    balance_after: 100,
    kind: "allocation",
    description: "Opening allocation",
    created_at: "2026-08-31T23:59:00Z",
    month: "2026-08-01",
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
    month: "2026-09-01",
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
    // Written in September for October: the credit month, not the day, decides where it counts.
    month: "2026-10-01",
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
      month: "2026-09-01",
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
  it("filters by the credit month an entry counts against, not the day it was written", () => {
    const ids = (month: string) =>
      filterCreditEntries(entries, [project], { ...allFilters, month }).map((item) => item.id);
    expect(ids("2026-08-01")).toEqual(["opening"]);
    expect(ids("2026-09-01")).toEqual(["debit"]);
    expect(ids("2026-10-01")).toEqual(["addition"]);
  });
  it("counts a settlement and a refund as project activity", () => {
    const settlement: CreditLedgerEntry = {
      ...entries[1],
      id: "settlement",
      kind: "final_adjustment",
      amount: -2,
    };
    expect(
      filterCreditEntries([...entries, settlement], [project], { ...allFilters, kind: "used" }).map(
        (item) => item.id,
      ),
    ).toEqual(["debit", "settlement"]);
  });
  it("returns a genuine empty result", () => {
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
      '"Client","Month","Date (UTC)","Project","Campaign","Activity","Credits","Balance after activity","Deliverable breakdown","Note"',
    );
    expect(csv).toContain('"Example","2026-09","2026-09-01T00:01:00Z"');
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

  it("nets a refund from a move and adds the final settlement", () => {
    expect(
      projectCreditsUsed([
        { amount: -5, kind: "project_debit" },
        { amount: 5, kind: "project_refund" },
        { amount: -5, kind: "project_debit" },
        { amount: -2, kind: "final_adjustment" },
      ]),
    ).toBe(7);
  });

  it("is null when the project has no debit", () => {
    expect(projectCreditsUsed([])).toBeNull();
    expect(projectCreditsUsed([{ amount: 100, kind: "allocation" }])).toBeNull();
  });
});

describe("credit months", () => {
  it("takes the month from the UTC calendar, whatever the local zone", () => {
    expect(creditMonthOf(new Date("2026-08-31T23:59:59Z"))).toBe("2026-08-01");
    expect(creditMonthOf(new Date("2026-09-01T00:00:00Z"))).toBe("2026-09-01");
  });

  it("also takes a date-like string, normalizing an existing YYYY-MM-01 unchanged", () => {
    expect(creditMonthOf("2026-12-24")).toBe("2026-12-01");
    expect(creditMonthOf("2026-10-01")).toBe("2026-10-01");
  });

  it("labels a month by name and year", () => {
    expect(creditMonthLabel("2026-10-01")).toBe("October 2026");
  });

  it("steps across year boundaries in both directions", () => {
    expect(addCreditMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addCreditMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addCreditMonths("2026-09-01", 11)).toBe("2027-08-01");
  });

  it("offers 11 months either side for reading and the next 11 for writing", () => {
    const range = creditMonthRange("2026-09-01", 11, 11);
    expect(range).toHaveLength(23);
    expect(range[0]).toBe("2025-10-01");
    expect(range.at(-1)).toBe("2027-08-01");
    expect(writableCreditMonths("2026-09-01")).toEqual(creditMonthRange("2026-09-01", 0, 11));
    expect(writableCreditMonths("2026-09-01")).toHaveLength(12);
  });

  it("finds the plan in force: the latest start on or before the month", () => {
    const plans = [
      { monthly_credits: 100, starts_on: "2026-09-01" },
      { monthly_credits: 150, starts_on: "2026-12-01" },
    ];
    expect(planForMonth(plans, "2026-08-01")).toBeNull();
    expect(planForMonth(plans, "2026-11-01")?.monthly_credits).toBe(100);
    expect(planForMonth(plans, "2027-01-01")?.monthly_credits).toBe(150);
  });

  it("counts the days left in the month, today included", () => {
    expect(daysLeftInMonth(new Date("2026-09-30T23:00:00Z"))).toBe(1);
    expect(daysLeftInMonth(new Date("2026-09-24T00:00:00Z"))).toBe(7);
    expect(daysLeftInMonth(new Date("2026-02-01T00:00:00Z"))).toBe(28);
  });

  it("warns about expiring credits only in a month's last 7 days and only when some are left", () => {
    const summary = { status: "open", expiring: 12, expires_on: "2026-09-30" };
    expect(expiringNotice(summary, new Date("2026-09-23T12:00:00Z"))).toBeNull();
    expect(expiringNotice(summary, new Date("2026-09-24T00:00:00Z"))).toEqual({
      amount: 12,
      on: "2026-09-30",
    });
    expect(
      expiringNotice({ ...summary, expiring: 0 }, new Date("2026-09-30T00:00:00Z")),
    ).toBeNull();
    expect(expiringNotice(null, new Date("2026-09-30T00:00:00Z"))).toBeNull();
  });

  it("measures a month against everything it received", () => {
    expect(monthCreditsReceived({ allowance: 100, extras: 20, transferred: -30 })).toBe(90);
  });
});

describe("describeCreditError", () => {
  it("names the writable range for a month outside it", () => {
    expect(
      describeCreditError({ message: "Choose a month within the next 11 months", code: "22023" }),
    ).toBe("Choose the current month or one of the next 11 months.");
    expect(describeCreditError({ message: "A month is required", code: "22023" })).toBe(
      "Choose a month.",
    );
  });

  it("states a short month's figures", () => {
    expect(
      describeCreditError({
        message: "insufficient_month_credits",
        code: "P0001",
        details: JSON.stringify({ month: "2026-09-01", available: 3, required: 10, shortfall: 7 }),
      }),
    ).toBe("That month has 3 credits available, 7 short.");
    expect(describeCreditError({ message: "insufficient_month_credits", details: null })).toBe(
      "That month does not have enough credits.",
    );
  });

  it("keeps any other message", () => {
    expect(describeCreditError({ message: "Choose two different months" })).toBe(
      "Choose two different months",
    );
  });

  it("falls back to a plain sentence when details is malformed JSON rather than throwing", () => {
    expect(
      describeCreditError({ message: "insufficient_month_credits", details: "not json" }),
    ).toBe("That month does not have enough credits.");
  });
});

describe("parseErrorDetails", () => {
  it("parses a JSON details payload", () => {
    expect(parseErrorDetails<{ available: number }>(JSON.stringify({ available: 3 }))).toEqual({
      available: 3,
    });
  });

  it("returns null instead of throwing for missing or malformed details", () => {
    expect(parseErrorDetails(null)).toBeNull();
    expect(parseErrorDetails(undefined)).toBeNull();
    expect(parseErrorDetails("")).toBeNull();
    expect(parseErrorDetails("{not json")).toBeNull();
  });
});

describe("assertCreditResult", () => {
  it("returns the data when there is no error", () => {
    expect(assertCreditResult({ data: { available: 5 }, error: null })).toEqual({ available: 5 });
  });

  it("describes a month-write error the same way describeCreditError does", () => {
    expect(() =>
      assertCreditResult({
        data: null,
        error: {
          message: "insufficient_month_credits",
          details: JSON.stringify({ available: 2, shortfall: 7 }),
        },
      }),
    ).toThrow("That month has 2 credits available, 7 short.");
    expect(() =>
      assertCreditResult({ data: null, error: { message: "boom", code: "22023" } }),
    ).toThrow("Choose the current month or one of the next 11 months.");
  });
});

describe("creditEntryNote", () => {
  it("is the scope note for a project debit and the recorded reason otherwise", () => {
    expect(creditEntryNote(entries[1], undefined)).toBe("");
    expect(creditEntryNote({ ...entries[2], kind: "extra" }, undefined)).toBe("Approved addition");
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

describe("defaultAcceptanceMonth", () => {
  // 23:30 on Sep 30 in São Paulo is already October in UTC, the database's clock.
  const now = new Date("2026-10-01T02:30:00Z");

  it("defaults acceptance to the due month, clamped to the open window like accept_briefing", () => {
    expect(defaultAcceptanceMonth(null, now)).toBe("2026-10-01");
    expect(defaultAcceptanceMonth("2026-12-12", now)).toBe("2026-12-01");
    expect(defaultAcceptanceMonth("2026-08-02", now)).toBe("2026-10-01");
    expect(defaultAcceptanceMonth("2028-03-01", now)).toBe("2027-09-01");
  });
});
