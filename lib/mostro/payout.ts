import type { CliTradeEvent } from "./parsers";
import type { LocalTradeMetadata, LocalTradeStep } from "./types";

export function isPayoutStep(step?: LocalTradeStep) {
  return step === "waiting_for_payout" || step === "needs_payout_invoice";
}

export function normalizeStatus(status?: string) {
  return (status ?? "").replace(/[-_\s]/g, "").toLowerCase();
}

export function reconcilePayout(trade: Partial<LocalTradeMetadata>, events: CliTradeEvent[]) {
  let lastKnownStep = trade.lastKnownStep ?? "unknown";
  let payoutEventAt = trade.payoutEventAt ?? 0;
  let payoutSats = trade.payoutSats;
  let payoutConfirmed = trade.payoutConfirmed;
  const after = payoutEventAt;
  if (payoutConfirmed || lastKnownStep === "canceled") {
    return { lastKnownStep, payoutEventAt, payoutSats, payoutConfirmed };
  }

  // Only the caller's exact-order events may change payout state. Never infer ownership by timing.
  const ordered = events.map((event) => ({
    ...event, time: event.timestamp ? Date.parse(`${event.timestamp.replace(" ", "T")}Z`) : NaN
  })).filter((event) => Number.isFinite(event.time)).sort((a, b) => a.time - b.time);

  for (const event of ordered) {
    if (event.time <= after && event.action !== "PurchaseCompleted") continue;
    if (event.action === "PurchaseCompleted") {
      lastKnownStep = "completed";
      payoutConfirmed = true;
    } else if (event.action === "AddInvoice" && normalizeStatus(event.status) === "settledholdinvoice") {
      lastKnownStep = "needs_payout_invoice";
      if (event.sats !== undefined && Number.isSafeInteger(event.sats) && event.sats > 0) payoutSats = event.sats;
    } else if (event.action === "InvoiceUpdated") {
      lastKnownStep = "waiting_for_payout";
    } else if (["Released", "HoldInvoicePaymentSettled", "PaymentFailed"].includes(event.action ?? "")) {
      if (!isPayoutStep(lastKnownStep)) lastKnownStep = "waiting_for_payout";
    } else {
      continue;
    }
    payoutEventAt = event.time;
    if (payoutConfirmed) break;
  }
  return { lastKnownStep, payoutEventAt, payoutSats, payoutConfirmed };
}
