import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseNewOrderResult, parseOrderDetail, parseOrders, parseTradeMessages } from "@/lib/mostro/parsers";

const fixture = (name: string) => readFileSync(path.join(process.cwd(), "test/fixtures/cli", name), "utf8");

describe("CLI parsers", () => {
  it("parses listorders output defensively", () => {
    const orders = parseOrders(fixture("listorders.txt"));
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      kind: "sell",
      currency: "COP",
      minFiatAmount: "50000",
      maxFiatAmount: "150000"
    });
  });

  it("returns empty orderbook for blank output", () => {
    expect(parseOrders(fixture("empty-orderbook.txt"))).toEqual([]);
  });

  it("parses the unicode table by column and joins wrapped payment methods", () => {
    const orders = parseOrders(fixture("listorders-table.txt"));
    expect(orders).toHaveLength(3);
    expect(orders[0]).toMatchObject({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      fiatAmount: "100000",
      premiumPct: 3,
      paymentMethods: ["NEQUI LLAVES BRE-B"]
    });
    expect(orders[1]).toMatchObject({
      minFiatAmount: "500000",
      maxFiatAmount: "2000000",
      premiumPct: 1
    });
    expect(orders[2]).toMatchObject({
      minFiatAmount: "1000000",
      maxFiatAmount: "4000000",
      premiumPct: 0,
      paymentMethods: ["Lightning to Bitcoin Contact first"]
    });
  });

  it("parses key-value order detail", () => {
    const order = parseOrderDetail(fixture("order-detail.txt"));
    expect(order?.paymentMethods).toEqual(["Nequi", "Daviplata"]);
    expect(order?.sats).toBe(100000);
    expect(order?.premiumPct).toBe(1.5);
  });

  it("keeps unrelated and ambiguous messages out of current trade messages", () => {
    const parsed = parseTradeMessages(fixture("getdm.txt"), "11111111-1111-4111-8111-111111111111");
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.ambiguousMessages).toHaveLength(1);
  });

  it("extracts a created order id and its payable hold invoice", () => {
    const output = `Payment Invoice Received
Order ID: 44444444-4444-4444-8444-444444444444
LIGHTNING INVOICE TO PAY:
─────────────────────────────────────
lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka
─────────────────────────────────────`;
    expect(parseNewOrderResult(output)).toEqual({
      orderId: "44444444-4444-4444-8444-444444444444",
      paymentInvoice: "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka"
    });
  });
});
