import { describe, expect, it, vi } from "vitest";
import {
  addMonthExtra,
  adjustCredits,
  requestCredits,
  reviewCreditRequest,
  setCreditPlan,
  transferMonthCredits,
} from "./credit-data";

function stubDatabase(result: { data: unknown; error: { message: string } | null }) {
  return { rpc: vi.fn().mockResolvedValue(result) };
}

describe("credit mutations", () => {
  it("requests credits with the client, amount, trimmed note and idempotency key", async () => {
    const database = stubDatabase({ data: null, error: null });
    await requestCredits(database as never, {
      clientId: "c1",
      amount: 50,
      note: " top up ",
      idempotencyKey: "request:abc",
    });
    expect(database.rpc).toHaveBeenCalledWith("request_credits", {
      p_client_id: "c1",
      p_amount: 50,
      p_note: " top up ",
      p_idempotency_key: "request:abc",
    });
  });

  it("adjusts credits with the idempotency key it is given", async () => {
    const database = stubDatabase({ data: null, error: null });
    await adjustCredits(database as never, {
      clientId: "c1",
      amount: -10,
      description: "correction",
      idempotencyKey: "adjustment:abc",
    });
    expect(database.rpc).toHaveBeenCalledWith("adjust_credits", {
      p_client_id: "c1",
      p_amount: -10,
      p_description: "correction",
      p_idempotency_key: "adjustment:abc",
    });
  });

  it("routes a fulfil decision to the fulfil procedure", async () => {
    const database = stubDatabase({ data: null, error: null });
    await reviewCreditRequest(database as never, {
      requestId: "r1",
      decision: "fulfill",
      note: "",
    });
    expect(database.rpc).toHaveBeenCalledWith("fulfill_credit_request", {
      p_request_id: "r1",
      p_note: "",
    });
  });

  it("routes a reject decision to the reject procedure", async () => {
    const database = stubDatabase({ data: null, error: null });
    await reviewCreditRequest(database as never, {
      requestId: "r1",
      decision: "reject",
      note: "out of scope",
    });
    expect(database.rpc).toHaveBeenCalledWith("reject_credit_request", {
      p_request_id: "r1",
      p_note: "out of scope",
    });
  });

  it("surfaces the database error message", async () => {
    const database = stubDatabase({ data: null, error: { message: "insufficient balance" } });
    await expect(
      requestCredits(database as never, {
        clientId: "c1",
        amount: 50,
        note: "",
        idempotencyKey: "request:abc",
      }),
    ).rejects.toThrow("insufficient balance");
  });
});

describe("monthly credit mutations", () => {
  it("sets a plan from its start month", async () => {
    const database = stubDatabase({ data: null, error: null });
    await setCreditPlan(database as never, {
      clientId: "c1",
      monthlyCredits: 120,
      startsOn: "2026-10-01",
    });
    expect(database.rpc).toHaveBeenCalledWith("set_credit_plan", {
      p_client_id: "c1",
      p_monthly_credits: 120,
      p_starts_on: "2026-10-01",
    });
  });

  it("adds an extra to one month with its idempotency key", async () => {
    const database = stubDatabase({ data: "entry", error: null });
    await addMonthExtra(database as never, {
      clientId: "c1",
      month: "2026-11-01",
      amount: 20,
      reason: "Launch",
      idempotencyKey: "extra:abc",
    });
    expect(database.rpc).toHaveBeenCalledWith("add_month_extra", {
      p_client_id: "c1",
      p_month: "2026-11-01",
      p_amount: 20,
      p_reason: "Launch",
      p_idempotency_key: "extra:abc",
    });
  });

  it("transfers between months with its idempotency key", async () => {
    const database = stubDatabase({ data: "entry", error: null });
    await transferMonthCredits(database as never, {
      clientId: "c1",
      fromMonth: "2026-09-01",
      toMonth: "2026-10-01",
      amount: 5,
      reason: "Bring forward",
      idempotencyKey: "transfer:abc",
    });
    expect(database.rpc).toHaveBeenCalledWith("transfer_month_credits", {
      p_client_id: "c1",
      p_from_month: "2026-09-01",
      p_to_month: "2026-10-01",
      p_amount: 5,
      p_reason: "Bring forward",
      p_idempotency_key: "transfer:abc",
    });
  });

  it("explains a month outside the writable range (errcode 22023)", async () => {
    const database = stubDatabase({
      data: null,
      error: { message: "Choose the current month or a later one", code: "22023" } as never,
    });
    await expect(
      addMonthExtra(database as never, {
        clientId: "c1",
        month: "2026-01-01",
        amount: 1,
        reason: "Late",
        idempotencyKey: "extra:x",
      }),
    ).rejects.toThrow("Choose the current month or one of the next 11 months.");
  });

  it("states a short month's figures", async () => {
    const database = stubDatabase({
      data: null,
      error: {
        message: "insufficient_month_credits",
        code: "P0001",
        details: '{"available": 2, "shortfall": 3}',
      } as never,
    });
    await expect(
      transferMonthCredits(database as never, {
        clientId: "c1",
        fromMonth: "2026-09-01",
        toMonth: "2026-10-01",
        amount: 5,
        reason: "Bring forward",
        idempotencyKey: "transfer:x",
      }),
    ).rejects.toThrow("That month has 2 credits available, 3 short.");
  });
});
