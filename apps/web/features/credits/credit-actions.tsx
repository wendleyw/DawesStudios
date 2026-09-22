"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import {
  adjustCredits,
  requestCredits,
  reviewCreditRequest,
  useInvalidateCredits,
} from "./credit-data";
import type { CreditRequest } from "./credit-model";
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
