import type { TradeLifecycleStatus } from "@/lib/mostro/types";

export type TradeStage = "syncing" | "bond" | "invoice" | "lock" | "fiat" | "release" | "payout" | "completed" | "canceled" | "disputed";

export function getTradeFlow(lifecycle: TradeLifecycleStatus | null, options: {
  sellerHint: boolean;
  bondSeen: boolean;
  continueAfterBond: boolean;
}) {
  const isSeller = lifecycle?.kind
    ? lifecycle.role === "maker" ? lifecycle.kind === "sell" : lifecycle.kind === "buy"
    : options.sellerHint;
  const bondRequired = options.bondSeen || Boolean(lifecycle?.bondRequired || lifecycle?.bondInvoice);
  const step = lifecycle?.step;
  let stage: TradeStage = "syncing";

  if (step === "completed" || step === "canceled" || step === "disputed") {
    stage = step;
  } else if (step === "waiting_for_payout" || step === "needs_payout_invoice") {
    stage = "payout";
  } else if (step === "fiat_marked_sent" || step === "waiting_release") {
    stage = "release";
  } else if (step === "ready_for_fiat" || step === "waiting_for_fiat") {
    stage = "fiat";
  } else if (step === "waiting_for_lock") {
    stage = "lock";
  } else if (step === "waiting_for_bond") {
    // Some nodes validate the bond when the buyer submits their receiving invoice.
    stage = options.continueAfterBond && !isSeller ? "invoice" : "bond";
  } else if (step === "needs_invoice") {
    stage = isSeller ? "lock" : "invoice";
  }

  const steps: { id: TradeStage; label: string }[] = [
    ...(bondRequired ? [{ id: "bond" as const, label: "Garantía" }] : []),
    ...(!isSeller ? [{ id: "invoice" as const, label: "Tu wallet" }] : []),
    { id: "lock", label: "Asegurar sats" },
    { id: "fiat", label: "Pago fiat" },
    { id: "release", label: "Finalizar" }
  ];
  const activeIndex = stage === "completed" ? steps.length : steps.findIndex((item) => item.id === (stage === "payout" ? "release" : stage));
  const bondPending = step === "waiting_for_bond";

  return { isSeller, stage, steps, activeIndex, bondRequired, bondPending };
}
