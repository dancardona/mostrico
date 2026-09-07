import { describe, expect, it } from "vitest";
import { getTradeFlow } from "@/lib/trade-flow";
import type { TradeLifecycleStatus } from "@/lib/mostro/types";

const options = { sellerHint: false, bondSeen: false, continueAfterBond: false };
const lifecycle: TradeLifecycleStatus = { step: "waiting_for_bond", kind: "sell", role: "taker", bondRequired: true, readyForInvoice: false };

describe("trade wizard", () => {
  it.each(["waiting_for_payout", "needs_payout_invoice"] as const)("keeps %s in the final step for both sides", (step) => {
    for (const kind of ["buy", "sell"] as const) {
      const flow = getTradeFlow({ ...lifecycle, kind, step }, options);
      expect(flow.stage).toBe("payout");
      expect(flow.activeIndex).toBe(flow.steps.length - 1);
    }
  });
  it("keeps unknown orders non-actionable even with a role or bond URL hint", () => {
    const flow = getTradeFlow(null, { ...options, sellerHint: true, bondSeen: true });
    expect(flow.stage).toBe("syncing");
    expect(flow.activeIndex).toBe(-1);
  });

  it("lets the buyer submit an invoice without claiming the bond is confirmed", () => {
    const flow = getTradeFlow(lifecycle, { ...options, continueAfterBond: true });
    expect(flow.stage).toBe("invoice");
    expect(flow.bondPending).toBe(true);
  });

  it("keeps sellers on the bond until Mostro advances", () => {
    const flow = getTradeFlow({ ...lifecycle, kind: "buy" }, { ...options, continueAfterBond: true });
    expect(flow.stage).toBe("bond");
    expect(flow.steps.some((step) => step.id === "invoice")).toBe(false);
  });

  it.each(["completed", "canceled", "disputed"] as const)("does not reopen a %s trade because a bond was acknowledged", (step) => {
    expect(getTradeFlow({ ...lifecycle, step }, { ...options, continueAfterBond: true }).stage).toBe(step);
  });

  it.each([
    ["sell", "maker", true], ["buy", "maker", false],
    ["sell", "taker", false], ["buy", "taker", true]
  ] as const)("resolves the %s/%s side from the lifecycle", (kind, role, isSeller) => {
    expect(getTradeFlow({ ...lifecycle, kind, role }, options).isSeller).toBe(isSeller);
  });

  it("skips an unneeded guarantee and follows remote progress", () => {
    const flow = getTradeFlow({ ...lifecycle, step: "fiat_marked_sent", bondRequired: false }, options);
    expect(flow.stage).toBe("release");
    expect(flow.steps.some((step) => step.id === "bond")).toBe(false);
  });
});
