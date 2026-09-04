import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  commandSucceeded,
  parseChatMessages,
  parseCliTradeEvents,
  parseNewOrderResult,
  parseOrderDetail,
  parseOrders,
  parsePeerDisclosures,
  parseTakeBuyResult,
  parseTakeSellResult,
  parseTradeMessages
} from "@/lib/mostro/parsers";

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

  it("turns successful terminal output into safe, concise Markdown", () => {
    const output = `Checking for legacy token columns...
No legacy token columns found - database is up to date
⚡ Add Lightning Invoice
│ Field │ Value │
│ Order ID │ 11111111-1111-4111-8111-111111111111 │
│ Trade Keys │ [redacted-hex-key] │
⏳ Waiting for Seller Payment
💡 The seller needs to pay the invoice to continue
✅ Order status updated successfully!`;

    const result = commandSucceeded(output);
    expect(result).toBe("**Invoice Lightning agregada**\n\nEl vendedor debe pagar la hold invoice para bloquear los sats y continuar la operación.");
    expect(result).not.toMatch(/legacy|Trade Keys|11111111/);
  });

  it("extracts an anti-abuse bond invoice from a take-sell response", () => {
    const invoice = "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka";
    const output = `🪙 Anti-Abuse Bond Invoice
📋 Order ID: 11111111-1111-4111-8111-111111111111
⚡ LIGHTNING BOND INVOICE TO PAY:
─────────────────────────────────────
${invoice}
─────────────────────────────────────`;

    expect(parseTakeSellResult(output)).toEqual({ bondInvoice: invoice });
  });

  it("distinguishes a trade hold invoice from an anti-abuse bond", () => {
    const invoice = "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka";
    const output = `Payment Invoice Received
LIGHTNING INVOICE TO PAY:
${invoice}`;

    expect(parseTakeBuyResult(output)).toEqual({ bondInvoice: undefined, paymentInvoice: invoice });
  });

  it("groups getdm lifecycle events without exposing unrelated structure", () => {
    const invoice = "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka";
    const output = `📄 Message 1:
─────────────────────────────────────
⏰ Time: 2026-09-03 18:40:37
🎯 Action: 🪙 PayBondInvoice
📝 Details:
   ⚡ Lightning Invoice:
   ${invoice}

📄 Message 2:
─────────────────────────────────────
⏰ Time: 2026-09-03 18:41:00
🎯 Action: ⚡ AddInvoice
📝 Details:
   📋 Order: 11111111-1111-4111-8111-111111111111 100000 sats (COP)`;

    expect(parseCliTradeEvents(output)).toEqual([
      { action: "PayBondInvoice", timestamp: "2026-09-03 18:40:37", orderId: undefined, invoice },
      { action: "AddInvoice", timestamp: "2026-09-03 18:41:00", orderId: "11111111-1111-4111-8111-111111111111", invoice: undefined }
    ]);
  });

  it("parses multiline counterpart chat as plain text", () => {
    const output = `📨 Fetch User Direct Messages
📄 Message 1:
─────────────────────────────────────
⏰ Time: 2026-09-03 18:41:00
📨 From: 👤 Counterparty (${"1".repeat(64)})
📝 Content:
   Hola
   <script>alert(1)</script>`;

    expect(parseChatMessages(output)).toEqual([{
      id: expect.stringMatching(/^incoming-/),
      direction: "incoming",
      text: "Hola\n<script>alert(1)</script>",
      timestamp: "2026-09-03T18:41:00Z"
    }]);
  });

  it("associates a peer from the same message or one unambiguous recent order", () => {
    const associated = `📄 Message 1:
⏰ Time: 2026-09-03 18:41:00
🎯 Action: FiatSentOk
📝 Details:
   📋 Order: 11111111-1111-4111-8111-111111111111
   👤 Peer: ${"1".repeat(64)}`;
    const contextual = `📄 Message 2:
⏰ Time: 2026-09-03 18:41:20
🎯 Action: FiatSentOk
📝 Details:
   👤 Peer: ${"2".repeat(64)}`;

    expect(parsePeerDisclosures(`${associated}\n${contextual}`)).toEqual([
      { orderId: "11111111-1111-4111-8111-111111111111", pubkey: "1".repeat(64) },
      { orderId: "11111111-1111-4111-8111-111111111111", pubkey: "2".repeat(64) }
    ]);
  });

  it("keeps a peer ambiguous when two recent orders could match", () => {
    const output = `📄 Message 1:
⏰ Time: 2026-09-03 18:41:00
📝 Details:
   📋 Order: 11111111-1111-4111-8111-111111111111
📄 Message 2:
⏰ Time: 2026-09-03 18:41:10
📝 Details:
   📋 Order: 22222222-2222-4222-8222-222222222222
📄 Message 3:
⏰ Time: 2026-09-03 18:41:20
🎯 Action: FiatSentOk
📝 Details:
   👤 Peer: ${"3".repeat(64)}`;

    expect(parsePeerDisclosures(output)).toEqual([]);
  });
});
