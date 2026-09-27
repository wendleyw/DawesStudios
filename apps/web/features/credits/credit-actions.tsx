"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { useDateFormat } from "@/features/workspace/workspace-data";
import {
  addMonthExtra,
  adjustCredits,
  requestCredits,
  reviewCreditRequest,
  setCreditPlan,
  transferMonthCredits,
  useInvalidateCredits,
} from "./credit-data";
import { writableCreditMonths, type CreditRequest } from "./credit-model";
import { FormError } from "@/features/shared/form-error";

/**
 * The credit packages a request can choose from. Postgres holds the authoritative constraint
 * (`supabase/migrations/202609200004_requests_and_attachments.sql`, `check(amount in (25,50,100))`);
 * this is the client's fail-fast copy of it, stated once rather than once per use.
 */
const CREDIT_PACKAGES = [25, 50, 100] as const;

export function CreditActionDialog({
  clientId,
  mode,
  onClose,
}: {
  clientId: string;
  mode: "request" | "adjust";
  onClose: () => void;
}) {
  const { database } = useAuth();
  const invalidateCredits = useInvalidateCredits();
  const [amount, setAmount] = useState("50");
  const [note, setNote] = useState("");
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const quantity = Number(amount);
      if (!Number.isSafeInteger(quantity) || quantity === 0)
        throw new Error("Enter a non-zero whole number of credits.");
      if (mode === "request") {
        if (!CREDIT_PACKAGES.includes(quantity as (typeof CREDIT_PACKAGES)[number]))
          throw new Error("Choose a credit package.");
        const payload = `${clientId}:${quantity}:${note.trim()}`;
        if (attempt.current?.payload !== payload)
          attempt.current = { payload, key: `request:${crypto.randomUUID()}` };
        await requestCredits(database, {
          clientId,
          amount: quantity,
          note: note.trim(),
          idempotencyKey: attempt.current.key,
        });
      } else {
        if (!note.trim()) throw new Error("Add a reason for this credit adjustment.");
        const payload = `${clientId}:${quantity}:${note.trim()}`;
        if (attempt.current?.payload !== payload)
          attempt.current = { payload, key: `adjustment:${crypto.randomUUID()}` };
        await adjustCredits(database, {
          clientId,
          amount: quantity,
          description: note.trim(),
          idempotencyKey: attempt.current.key,
        });
      }
    },
    onSuccess: async () => {
      await invalidateCredits();
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "request" ? "Request credits" : "Adjust credits"}
      description={
        mode === "request"
          ? "The studio will review your request. No payment is collected here."
          : "Record an allocation or correction with a clear reason."
      }
    >
      <form
        className="credit-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="credit-packages" role="group" aria-label="Credit packages">
          {CREDIT_PACKAGES.map((value) => (
            <button
              type="button"
              className={Number(amount) === value ? "selected" : ""}
              aria-pressed={Number(amount) === value}
              onClick={() => setAmount(String(value))}
              key={value}
            >
              <strong>+{value}</strong>
              <span>credits</span>
            </button>
          ))}
        </div>
        {mode === "adjust" && (
          <label>
            Credit adjustment
            <input
              type="number"
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <span className="credit-note">Use a negative number to record a correction.</span>
          </label>
        )}
        <label>
          {mode === "request" ? "Note (optional)" : "Reason"}
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            required={mode === "adjust"}
          />
        </label>
        {save.error && <FormError>{save.error.message}</FormError>}
        <div className="credit-dialog-actions">
          <button type="button" className="button" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button className="button primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : mode === "request" ? "Send request" : "Save adjustment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CreditRequestReview({
  request,
  onClose,
}: {
  request: CreditRequest;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const invalidateCredits = useInvalidateCredits();
  const [note, setNote] = useState("");
  const review = useMutation({
    mutationFn: async (decision: "fulfill" | "reject") => {
      if (decision === "reject" && !note.trim())
        throw new Error("Explain why this request is being declined.");
      await reviewCreditRequest(database, { requestId: request.id, decision, note: note.trim() });
    },
    onSuccess: async () => {
      await invalidateCredits();
      onClose();
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`${request.amount} credits requested`}
      description="Fulfillment records a studio-approved credit allocation."
    >
      <div className="credit-form">
        {request.note && <p>{request.note}</p>}
        <label>
          Response note
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Required when declining"
          />
        </label>
        {review.error && <FormError>{review.error.message}</FormError>}
        <div className="credit-dialog-actions">
          <button
            className="button"
            disabled={review.isPending}
            onClick={() => review.mutate("reject")}
          >
            Decline request
          </button>
          <button
            className="button primary"
            disabled={review.isPending}
            onClick={() => review.mutate("fulfill")}
          >
            {review.isPending ? "Saving…" : "Allocate credits"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export type CreditMonthAction = "plan" | "extra" | "transfer";

const monthActionCopy: Record<
  CreditMonthAction,
  { title: string; description: string; submit: string }
> = {
  plan: {
    title: "Set plan",
    description:
      "The monthly credits the client receives from a start month on. Months that already received their allowance keep it.",
    submit: "Save plan",
  },
  extra: {
    title: "Add extra",
    description: "Credits added to one month, on top of its plan. The client sees the reason.",
    submit: "Add credits",
  },
  transfer: {
    title: "Transfer between months",
    description: "Move available credits from one month to another. The client sees the reason.",
    submit: "Transfer credits",
  },
};

/**
 * The agency's month actions on the Credits page: set the monthly plan, add an extra to a month, or
 * transfer credits between months. Only the current month and the next 11 can be chosen, as the
 * backend requires. Validation and trimming happen here; an extra or a transfer keeps one
 * idempotency key per payload, so a retry of the same form never writes twice.
 */
export function CreditMonthDialog({
  clientId,
  mode,
  currentMonth,
  month,
  monthlyCredits,
  onClose,
}: {
  clientId: string;
  mode: CreditMonthAction;
  /** The current credit month (`YYYY-MM-01`); the first month offered. */
  currentMonth: string;
  /** The month the page is showing, preselected when it can be written to. */
  month: string;
  /** The plan currently in force, to prefill Set plan. */
  monthlyCredits: number | null;
  onClose: () => void;
}) {
  const { database } = useAuth();
  const { formatMonth } = useDateFormat();
  const invalidateCredits = useInvalidateCredits();
  const months = writableCreditMonths(currentMonth);
  const selected = months.includes(month) ? month : currentMonth;
  const [amount, setAmount] = useState(
    mode === "plan" && monthlyCredits != null ? String(monthlyCredits) : "",
  );
  const [fromMonth, setFromMonth] = useState(selected);
  const [toMonth, setToMonth] = useState(
    mode === "transfer" ? (months.find((item) => item !== selected) ?? selected) : selected,
  );
  const [reason, setReason] = useState("");
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const keyFor = (payload: string) => {
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: `${mode}:${crypto.randomUUID()}` };
    return attempt.current.key;
  };
  const save = useMutation({
    mutationFn: async () => {
      const quantity = Number(amount);
      const note = reason.trim();
      if (mode === "plan") {
        if (amount.trim() === "" || !Number.isSafeInteger(quantity) || quantity < 0)
          throw new Error("Enter a whole number of credits, 0 or more.");
        await setCreditPlan(database, { clientId, monthlyCredits: quantity, startsOn: fromMonth });
        return;
      }
      if (!Number.isSafeInteger(quantity) || quantity <= 0)
        throw new Error("Enter a positive whole number of credits.");
      if (!note) throw new Error("Add a reason the client will see.");
      if (mode === "extra") {
        await addMonthExtra(database, {
          clientId,
          month: toMonth,
          amount: quantity,
          reason: note,
          idempotencyKey: keyFor(`${clientId}:${toMonth}:${quantity}:${note}`),
        });
        return;
      }
      if (fromMonth === toMonth) throw new Error("Choose two different months.");
      await transferMonthCredits(database, {
        clientId,
        fromMonth,
        toMonth,
        amount: quantity,
        reason: note,
        idempotencyKey: keyFor(`${clientId}:${fromMonth}:${toMonth}:${quantity}:${note}`),
      });
    },
    onSuccess: async () => {
      await invalidateCredits();
      onClose();
    },
  });
  const copy = monthActionCopy[mode];
  const monthSelect = (label: string, value: string, onChange: (next: string) => void) => (
    <label>
      {label}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {months.map((item) => (
          <option key={item} value={item}>
            {formatMonth(item)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Modal open onClose={onClose} title={copy.title} description={copy.description}>
      <form
        className="credit-form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {mode === "plan" && monthSelect("Starts in", fromMonth, setFromMonth)}
        {mode === "extra" && monthSelect("Month", toMonth, setToMonth)}
        {mode === "transfer" && (
          <div className="credit-month-pair">
            {monthSelect("From", fromMonth, setFromMonth)}
            {monthSelect("To", toMonth, setToMonth)}
          </div>
        )}
        <label>
          {mode === "plan" ? "Credits per month" : "Credits"}
          <input
            type="number"
            inputMode="numeric"
            min={mode === "plan" ? 0 : 1}
            step={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </label>
        {mode !== "plan" && (
          <label>
            Reason
            <textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </label>
        )}
        {save.error && <FormError>{save.error.message}</FormError>}
        <div className="credit-dialog-actions">
          <button type="button" className="button" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button className="button primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : copy.submit}
          </button>
        </div>
      </form>
    </Modal>
  );
}
