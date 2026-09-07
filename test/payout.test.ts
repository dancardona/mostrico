import { describe, expect, it } from "vitest";
import { parseCliTradeEvents } from "@/lib/mostro/parsers";
import { reconcilePayout } from "@/lib/mostro/payout";

const orderId = "11111111-1111-4111-8111-111111111111";
const request = { action: "AddInvoice", orderId, timestamp: "2026-09-05 03:21:30", status: "SettledHoldInvoice", sats: 2224 };

describe("payout lifecycle", () => {
  it("extracts the exact order, payout status and net amount from the CLI", () => {
    const events = parseCliTradeEvents(`📄 Message 1:
Time: 2026-09-05 03:21:30
Action: AddInvoice
Order ID: ${orderId}
Details:
  Order: ${orderId} 2224 sats (COP)
  Status: SettledHoldInvoice
  Kind: Sell`);
    expect(events).toEqual([expect.objectContaining(request)]);
    expect(reconcilePayout({ lastKnownStep: "fiat_marked_sent" }, events)).toMatchObject({ lastKnownStep: "needs_payout_invoice", payoutSats: 2224 });
  });

  it("does not interpret the initial AddInvoice as payout recovery", () => {
    expect(reconcilePayout({ lastKnownStep: "needs_invoice" }, [{ ...request, status: "WaitingBuyerInvoice" }]).lastKnownStep).toBe("needs_invoice");
  });

  it.each(["Released", "HoldInvoicePaymentSettled", "PaymentFailed"])("does not treat %s as buyer payment success", (action) => {
    expect(reconcilePayout({ lastKnownStep: "waiting_release" }, [{ ...request, action }])).toMatchObject({ lastKnownStep: "waiting_for_payout", payoutConfirmed: undefined });
  });

  it("replays in order, preserves a replacement across polls, and accepts a newer request", () => {
    const updated = { ...request, action: "InvoiceUpdated", timestamp: "2026-09-05 03:22:00" };
    const pending = reconcilePayout({}, [updated, request]);
    expect(pending.lastKnownStep).toBe("waiting_for_payout");
    expect(reconcilePayout(pending, [request, updated])).toEqual(pending);
    expect(reconcilePayout(pending, [{ ...request, timestamp: "2026-09-05 03:24:00" }]).lastKnownStep).toBe("needs_payout_invoice");
  });

  it("only confirms actual buyer payment and never reopens it", () => {
    const completed = reconcilePayout({ lastKnownStep: "waiting_for_payout", payoutEventAt: Date.now() }, [{ ...request, action: "PurchaseCompleted" }]);
    expect(completed).toMatchObject({ lastKnownStep: "completed", payoutConfirmed: true });
    expect(reconcilePayout(completed, [{ ...request, timestamp: "2026-09-06 03:24:00" }])).toEqual(completed);
  });

  it("recovers a legacy false completion but leaves canceled orders alone", () => {
    expect(reconcilePayout({ lastKnownStep: "completed" }, [request]).lastKnownStep).toBe("needs_payout_invoice");
    expect(reconcilePayout({ lastKnownStep: "canceled" }, [request]).lastKnownStep).toBe("canceled");
  });
});
