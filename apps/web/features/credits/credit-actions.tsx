"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { Modal } from "@/features/shared/modal";
import { assertResult } from "@/lib/supabase";
import type { CreditRequest } from "./credit-model";

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
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("50");
  const [note, setNote] = useState("");
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const quantity = Number(amount);
      if (!Number.isSafeInteger(quantity) || quantity === 0)
        throw new Error("Enter a non-zero whole number of credits.");
      if (mode === "request") {
        if (![25, 50, 100].includes(quantity)) throw new Error("Choose a credit package.");
        assertResult(
          await database.rpc("request_credits", {
            p_client_id: clientId,
            p_amount: quantity,
            p_note: note.trim(),
          }),
        );
      } else {
        if (!note.trim()) throw new Error("Add a reason for this credit adjustment.");
        const payload = `${clientId}:${quantity}:${note.trim()}`;
        if (attempt.current?.payload !== payload)
          attempt.current = { payload, key: `adjustment:${crypto.randomUUID()}` };
        assertResult(
          await database.rpc("adjust_credits", {
            p_client_id: clientId,
            p_amount: quantity,
            p_description: note.trim(),
            p_idempotency_key: attempt.current.key,
          }),
        );
      }
    },
    onSuccess: async () => {
      await Promise.all(
        ["credit-account", "credit-ledger", "credit-requests", "notifications"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
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
          {[25, 50, 100].map((value) => (
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
        {save.error && (
          <p className="form-error" role="alert">
            {save.error.message}
          </p>
        )}
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
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const review = useMutation({
    mutationFn: async (decision: "fulfill" | "reject") => {
      if (decision === "reject" && !note.trim())
        throw new Error("Explain why this request is being declined.");
      assertResult(
        await database.rpc(
          decision === "fulfill" ? "fulfill_credit_request" : "reject_credit_request",
          { p_request_id: request.id, p_note: note.trim() },
        ),
      );
    },
    onSuccess: async () => {
      await Promise.all(
        ["credit-account", "credit-ledger", "credit-requests", "notifications"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
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
        {review.error && (
          <p className="form-error" role="alert">
            {review.error.message}
          </p>
        )}
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
