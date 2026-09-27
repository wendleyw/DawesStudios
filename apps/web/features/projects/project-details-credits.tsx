"use client";

import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useCreditMonthSummaries } from "@/features/credits/credit-data";
import {
  creditMonthLabel,
  creditMonthOf,
  writableCreditMonths,
  type CreditMonthSummary,
} from "@/features/credits/credit-model";
import { FormError } from "@/features/shared/form-error";
import { Modal } from "@/features/shared/modal";
import {
  moveProjectMonth,
  MonthShortfallError,
  settleProjectCredits,
  useInvalidateProjectCredits,
  type TableRow,
} from "./project-data";

/**
 * What settling changed, beside the Credits line that already shows the final total: "3 more
 * charged to September 2026", "2 refunded to September 2026" or "No change".
 */
export function settlementLine(settlement: {
  difference: number;
  charged_month: string | null;
}): string {
  const month = settlement.charged_month ? creditMonthLabel(settlement.charged_month) : "";
  if (settlement.difference > 0) return `${settlement.difference} more charged to ${month}`;
  if (settlement.difference < 0) return `${-settlement.difference} refunded to ${month}`;
  return "No change";
}

/** "October 2026 · 40 available" once the month's figures are in. */
function monthOption(month: string, summary: CreditMonthSummary | undefined): string {
  return summary
    ? `${creditMonthLabel(month)} · ${summary.available} available`
    : creditMonthLabel(month);
}

/**
 * Moves the project's charge to another open month. An open origin month gets its credits back; an
 * expired one does not, so the move then asks the studio to confirm charging the full amount again.
 */
export function MoveMonthDialog({
  project,
  fromMonth,
  charged,
  onClose,
}: {
  project: TableRow<"projects">;
  fromMonth: string;
  charged: number;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const invalidate = useInvalidateProjectCredits();
  const months = useMemo(() => writableCreditMonths(creditMonthOf(new Date())), []);
  const choices = months.filter((month) => month !== fromMonth);
  const summaries = useCreditMonthSummaries(project.client_id, months);
  const [target, setTarget] = useState(choices[0]);
  const [chargeFull, setChargeFull] = useState(false);
  // One key for the whole dialog opening, not one per chosen target: if a first attempt's outcome
  // is unknown (its response was lost) and the studio picks another month before retrying, reusing
  // this same key makes the database reject the retry as a month mismatch instead of moving the
  // project a second time. The dialog closes and reopens (a fresh key) to try again.
  const [attempt] = useState(() => crypto.randomUUID());
  const originExpired = fromMonth < months[0];
  const available = summaries.data?.[months.indexOf(target)]?.available;
  const short = available !== undefined && available < charged;
  const from = creditMonthLabel(fromMonth);
  const to = creditMonthLabel(target);
  const move = useMutation({
    mutationFn: async () =>
      moveProjectMonth(database, {
        projectId: project.id,
        toMonth: target,
        chargeFull: originExpired && chargeFull,
        idempotencyKey: `move:${project.id}:${attempt}`,
      }),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  return (
    <Modal
      open
      title="Move to another month"
      description={`The project is charged ${charged} credits to ${from}.`}
      onClose={() => {
        if (!move.isPending) onClose();
      }}
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          move.mutate();
        }}
      >
        <label>
          New month
          <select value={target} onChange={(event) => setTarget(event.target.value)}>
            {choices.map((month) => (
              <option key={month} value={month}>
                {monthOption(month, summaries.data?.[months.indexOf(month)])}
              </option>
            ))}
          </select>
        </label>
        {originExpired ? (
          <>
            <p>
              {from} has ended and its credits expired, so they are not returned. Moving charges the
              full {charged} credits to {to}.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={chargeFull}
                onChange={(event) => setChargeFull(event.target.checked)}
              />
              Charge the full {charged} credits to {to}
            </label>
          </>
        ) : (
          <p>
            {charged} credits return to {from} and are charged to {to}.
          </p>
        )}
        {short && (
          <p className="form-error">
            {to} has {available} credits available; {charged - available} more are needed.
          </p>
        )}
        {move.error && <FormError>{move.error.message}</FormError>}
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose} disabled={move.isPending}>
            Cancel
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={
              move.isPending || summaries.isPending || short || (originExpired && !chargeFull)
            }
          >
            {move.isPending ? "Moving…" : `Move to ${to}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Settles the project's final credits once, with a reason the client reads. Extra cost comes from
 * the current month; when that month is short, the dialog names the shortfall and offers a later
 * month to charge instead. A refund always returns to the current month.
 */
export function SettleCreditsDialog({
  project,
  charged,
  onClose,
}: {
  project: TableRow<"projects">;
  charged: number;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const invalidate = useInvalidateProjectCredits();
  const months = useMemo(() => writableCreditMonths(creditMonthOf(new Date())), []);
  const [finalCredits, setFinalCredits] = useState(String(charged));
  const [reason, setReason] = useState("");
  const [chargeMonth, setChargeMonth] = useState<string | null>(null);
  const [attempt] = useState(() => crypto.randomUUID());
  const summaries = useCreditMonthSummaries(project.client_id, months, chargeMonth !== null);
  const total = Number(finalCredits);
  const difference = Number.isSafeInteger(total) ? total - charged : 0;
  const current = creditMonthLabel(months[0]);
  const settle = useMutation({
    mutationFn: async () => {
      if (!Number.isSafeInteger(total) || total < 0)
        throw new Error("Enter the final total as a whole number of credits.");
      if (!reason.trim()) throw new Error("Explain the final total to the client.");
      return settleProjectCredits(database, {
        projectId: project.id,
        finalCredits: total,
        reason: reason.trim(),
        chargeMonth,
        idempotencyKey: `settle:${project.id}:${attempt}`,
      });
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
    onError: (error) => {
      // A shortfall opens the charge-month choice on the short month, so the studio picks another.
      if (error instanceof MonthShortfallError && chargeMonth === null)
        setChargeMonth(error.month || months[0]);
    },
  });
  const shortfall = settle.error instanceof MonthShortfallError ? settle.error : null;
  return (
    <Modal
      open
      title="Settle final credits"
      description={`The project is charged ${charged} credits. Enter its final total once; the client sees the reason.`}
      onClose={() => {
        if (!settle.isPending) onClose();
      }}
    >
      <form
        className="stack-form"
        onSubmit={(event) => {
          event.preventDefault();
          settle.mutate();
        }}
      >
        <label>
          Final total
          <input
            type="number"
            min={0}
            step={1}
            required
            value={finalCredits}
            onChange={(event) => setFinalCredits(event.target.value)}
          />
        </label>
        <label>
          Reason
          <textarea
            rows={3}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What the final total covers"
          />
        </label>
        <p>
          {difference > 0
            ? `${difference} more credits will be charged to ${creditMonthLabel(chargeMonth ?? months[0])}.`
            : difference < 0
              ? `${-difference} credits will be refunded to ${current}.`
              : "The charge stays the same."}
        </p>
        {chargeMonth !== null && (
          <label>
            Charge month
            <select value={chargeMonth} onChange={(event) => setChargeMonth(event.target.value)}>
              {months.map((month, index) => (
                <option key={month} value={month}>
                  {monthOption(month, summaries.data?.[index])}
                </option>
              ))}
            </select>
          </label>
        )}
        {shortfall ? (
          <FormError>
            {creditMonthLabel(shortfall.month || months[0])} has {shortfall.available} credits
            available, {shortfall.shortfall} short. Choose another charge month, or add an extra on
            the Credits page and try again.
          </FormError>
        ) : (
          settle.error && <FormError>{settle.error.message}</FormError>
        )}
        <div className="form-actions">
          <button className="button" type="button" onClick={onClose} disabled={settle.isPending}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={settle.isPending}>
            {settle.isPending ? "Settling…" : "Settle credits"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
