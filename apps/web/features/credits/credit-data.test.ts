import { describe, expect, it, vi } from "vitest";
import { adjustCredits, requestCredits, reviewCreditRequest } from "./credit-data";

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
