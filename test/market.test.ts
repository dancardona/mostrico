import { describe, expect, it } from "vitest";
import { fiatBounds, marketPaymentMethods, selectMarketOrders } from "@/lib/market";
import type { MostroOrder } from "@/lib/mostro/types";

const order = (id: string, fields: Partial<MostroOrder> = {}): MostroOrder => ({
  id, kind: "sell", currency: "COP", minFiatAmount: "10000", maxFiatAmount: "100000", paymentMethods: ["Nequi"], premiumPct: 0, ...fields
});
const defaults = { intent: "buy", amount: "", method: "", sort: "premium", savedOnly: false, savedIds: [] } as const;
const select = (orders: MostroOrder[], overrides: Partial<Parameters<typeof selectMarketOrders>[1]> = {}) =>
  selectMarketOrders(orders, { ...defaults, savedIds: [], ...overrides }).map(({ id }) => id);

describe("market filters", () => {
  it("groups known payment methods without changing the original conditions", () => {
    const item = order("a", { paymentMethods: ["Nequi / Bancolombia. Solo desde cuenta propia.", "NEQUI", "Bre-B", "Daviplata y PSE", "Transferencia bancaria", "Efectivo"] });
    expect(marketPaymentMethods(item)).toEqual(["Nequi", "Bancolombia", "Llaves BRE-B", "Daviplata", "PSE", "Transferencia bancaria", "Efectivo"]);
    expect(item.paymentMethods[0]).toBe("Nequi / Bancolombia. Solo desde cuenta propia.");
  });

  it("keeps short custom methods and handles missing or lengthy free-form values", () => {
    expect(marketPaymentMethods(order("a", { paymentMethods: ["  Banco personalizado  ", "Contactar antes de iniciar cualquier transferencia."] }))).toEqual(["Banco personalizado", "Otros"]);
    expect(marketPaymentMethods(order("a", { paymentMethods: [] }))).toEqual(["Otros"]);
  });

  it("prefers fixed amounts and rejects absent or invalid bounds", () => {
    expect(fiatBounds(order("a", { fiatAmount: "50000.50" }))).toEqual({ min: 50000.5, max: 50000.5 });
    expect(fiatBounds(order("a", { fiatAmount: "0", minFiatAmount: "", maxFiatAmount: "Infinity" }))).toEqual({ min: undefined, max: undefined });
  });

  it("matches inclusive ranges, fixed amounts and localized decimals", () => {
    const items = [order("range"), order("fixed", { fiatAmount: "100000.50" }), order("unknown", { maxFiatAmount: undefined })];
    expect(select(items, { amount: "10.000" })).toEqual(["range"]);
    expect(select(items, { amount: "100.000" })).toEqual(["range"]);
    expect(select(items, { amount: "100.000,50" })).toEqual(["fixed"]);
    for (const amount of ["9.999", "0", "-1", "COP 100.000"]) expect(select(items, { amount })).toEqual([]);
  });

  it("maps intent to the other side and keeps COP internal", () => {
    const items = [order("sell"), order("buy", { kind: "buy" }), order("usd", { currency: "USD" })];
    expect(select(items)).toEqual(["sell"]);
    expect(select(items, { intent: "sell" })).toEqual(["buy"]);
  });

  it("combines saved, payment method and amount filters", () => {
    const items = [order("a"), order("b", { paymentMethods: ["Bancolombia"] }), order("c")];
    expect(select(items, { savedOnly: true, savedIds: ["a", "b"], method: "Nequi", amount: "50.000" })).toEqual(["a"]);
    expect(select(items, { savedOnly: true })).toEqual([]);
  });

  it("sorts premium by the user's side and keeps unknown premiums last", () => {
    const items = [order("high", { premiumPct: 3 }), order("unknown", { premiumPct: undefined }), order("low", { premiumPct: -1 })];
    expect(select(items)).toEqual(["low", "high", "unknown"]);
    expect(select(items.map((item) => ({ ...item, kind: "buy" })), { intent: "sell" })).toEqual(["high", "low", "unknown"]);
    expect(items.map(({ id }) => id)).toEqual(["high", "unknown", "low"]);
  });

  it("sorts minima and dates from both CLI and ISO formats", () => {
    const items = [order("older", { minFiatAmount: "20000", createdAt: "2026-09-04 13:00" }), order("newer", { createdAt: "2026-09-04T14:00:00Z" }), order("unknown", { minFiatAmount: undefined, createdAt: "invalid" })];
    expect(select(items, { sort: "newest" })).toEqual(["newer", "older", "unknown"]);
    expect(select(items, { sort: "amount" })).toEqual(["newer", "older", "unknown"]);
  });
});
