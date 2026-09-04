import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearOrderCache } from "@/lib/mostro/order-cache";
import { MostroService } from "@/lib/mostro/service";
import { appendChatMessage, getTrade, mergeChatMessages, upsertTrade } from "@/lib/store/local-state";
import type { MostroCliRunner, RunResult } from "@/lib/mostro/types";
import type { ChatTransport } from "@/lib/mostro/chat-transport";

vi.mock("@/lib/store/local-state", () => ({
  appendChatMessage: vi.fn(),
  getTrade: vi.fn(),
  mergeChatMessages: vi.fn(),
  upsertTrade: vi.fn()
}));

const orderId = "11111111-1111-4111-8111-111111111111";
const listOutput = `ID                                   Kind Currency Amount        Sats    Premium Payment methods Status
${orderId} sell COP      50000-150000  100000  1.5     Nequi,Daviplata active
`;

class UnavailableDetailRunner implements MostroCliRunner {
  async run(args: readonly string[]): Promise<RunResult> {
    if (args[0] === "listorders") {
      return { exitCode: 0, stdout: listOutput, stderr: "", durationMs: 1 };
    }
    return {
      exitCode: 1,
      stdout: "Resource not found. Verify the order or dispute id exists.",
      stderr: "Received response with mismatched action. Expected: Orders, Got: CantDo",
      durationMs: 1
    };
  }
}

class TakeSellRunner implements MostroCliRunner {
  calls: readonly string[][] = [];

  constructor(private failInvoice = false) {}

  async run(args: readonly string[]): Promise<RunResult> {
    this.calls = [...this.calls, [...args]];
    if (args[0] === "addinvoice" && this.failInvoice) {
      return { exitCode: 1, stdout: "Invoice rejected", stderr: "", durationMs: 1 };
    }
    return { exitCode: 0, stdout: "ok", stderr: "", durationMs: 1 };
  }
}

class BondTakeSellRunner implements MostroCliRunner {
  calls: readonly string[][] = [];

  async run(args: readonly string[]): Promise<RunResult> {
    this.calls = [...this.calls, [...args]];
    return {
      exitCode: 0,
      stdout: `🪙 Anti-Abuse Bond Invoice
📋 Order ID: ${orderId}
⚡ LIGHTNING BOND INVOICE TO PAY:
lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka`,
      stderr: "",
      durationMs: 1
    };
  }
}

class InvalidTradeIndexRunner implements MostroCliRunner {
  calls: readonly string[][] = [];

  async run(args: readonly string[]): Promise<RunResult> {
    this.calls = [...this.calls, [...args]];
    if (args[0] === "takesell") {
      return {
        exitCode: 1,
        stdout: "Unexpected response from Mostro: Sending cantDo message to user for InvalidTradeIndex",
        stderr: "Invalid trade index. Please synchronize the trade index with mostro",
        durationMs: 1
      };
    }
    return { exitCode: 0, stdout: "Trade index synchronized successfully!", stderr: "", durationMs: 1 };
  }
}

describe("MostroService order detail fallback", () => {
  beforeEach(() => {
    vi.mocked(upsertTrade).mockReset();
    vi.mocked(getTrade).mockReset();
    vi.mocked(appendChatMessage).mockReset();
    vi.mocked(mergeChatMessages).mockReset();
    clearOrderCache();
    process.env.MOSTRO_PUBKEY = "0".repeat(64);
    process.env.RELAYS = "wss://relay.example";
  });

  it("takes the order without an invoice before adding it separately", async () => {
    const runner = new TakeSellRunner();
    const service = new MostroService(runner);
    const result = await service.takeSell({
      orderId,
      fiatAmount: "100000",
      invoice: "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka",
      confirmed: true
    });

    expect(runner.calls).toEqual([
      ["takesell", "-o", orderId, "-a", "100000"],
      ["addinvoice", "-o", orderId, "-i", "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka"]
    ]);
    expect(result).toMatchObject({ invoiceAdded: true });
  });

  it("stops at the anti-abuse bond without sending the payout invoice", async () => {
    const runner = new BondTakeSellRunner();
    const service = new MostroService(runner);
    const result = await service.takeSell({
      orderId,
      fiatAmount: "100000",
      invoice: "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka",
      confirmed: true
    });

    expect(runner.calls).toEqual([["takesell", "-o", orderId, "-a", "100000"]]);
    expect(result).toMatchObject({
      invoiceAdded: false,
      nextStep: "pay_bond",
      bondInvoice: expect.stringMatching(/^lnbc/)
    });
    expect(upsertTrade).toHaveBeenCalledWith(orderId, expect.objectContaining({
      role: "taker",
      lastKnownStep: "waiting_for_bond"
    }));
    expect(upsertTrade).toHaveBeenCalledWith(orderId, expect.not.objectContaining({ invoice: expect.anything() }));
  });

  it("takes a buy order as seller and returns the hold invoice", async () => {
    const invoice = "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka";
    const calls: string[][] = [];
    const runner: MostroCliRunner = {
      async run(args) {
        calls.push([...args]);
        return {
          exitCode: 0,
          stdout: `Payment Invoice Received\nOrder ID: ${orderId}\nLIGHTNING INVOICE TO PAY:\n${invoice}`,
          stderr: "",
          durationMs: 1
        };
      }
    };

    const result = await new MostroService(runner).takeBuy({ orderId, fiatAmount: "100000", confirmed: true });

    expect(calls).toEqual([["takebuy", "-o", orderId, "-a", "100000"]]);
    expect(result).toMatchObject({ paymentInvoice: invoice, nextStep: "pay_invoice" });
    expect(upsertTrade).toHaveBeenCalledWith(orderId, expect.objectContaining({
      role: "taker",
      kind: "buy",
      lastKnownStep: "waiting_for_lock"
    }));
  });

  it("recovers the matching bond from getdm and keeps general messages redacted", async () => {
    const invoice = "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka";
    vi.mocked(getTrade).mockResolvedValue({
      createdAt: "2026-09-03T18:40:40.000Z",
      currency: "COP",
      role: "taker",
      kind: "sell",
      lastKnownStep: "needs_invoice"
    });
    const runner: MostroCliRunner = {
      async run() {
        return {
          exitCode: 0,
          stdout: `📄 Message 1:
⏰ Time: 2026-09-03 18:40:37
🎯 Action: 🪙 PayBondInvoice
📝 Details:
   ⚡ Lightning Invoice:
   ${invoice}`,
          stderr: "",
          durationMs: 1
        };
      }
    };

    const result = await new MostroService(runner).messages(orderId, 30);

    expect(result.lifecycle).toMatchObject({
      step: "waiting_for_bond",
      bondRequired: true,
      bondInvoice: invoice,
      readyForInvoice: false
    });
    expect(JSON.stringify(result.ambiguousMessages)).not.toContain(invoice);
    expect(upsertTrade).toHaveBeenCalledWith(orderId, { lastKnownStep: "waiting_for_bond" });
  });

  it("creates a sell order and returns its hold invoice without persisting it", async () => {
    const runner = new TakeSellRunner();
    runner.run = vi.fn(async (args: readonly string[]) => ({
      exitCode: 0,
      stdout: `Payment Invoice Received\nOrder ID: 44444444-4444-4444-8444-444444444444\nLIGHTNING INVOICE TO PAY:\nlnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka`,
      stderr: "",
      durationMs: 1
    }));
    const service = new MostroService(runner);

    const result = await service.createOrder({
      kind: "sell",
      currency: "COP",
      fiatAmount: "100000",
      satsAmount: "0",
      paymentMethods: ["Nequi"],
      premium: 1,
      expirationDays: 3,
      confirmed: true
    });

    expect(result).toMatchObject({
      orderId: "44444444-4444-4444-8444-444444444444",
      kind: "sell",
      paymentInvoice: expect.stringMatching(/^lnbc/),
      partial: false
    });
    expect(upsertTrade).toHaveBeenCalledWith(result.orderId, expect.not.objectContaining({ paymentInvoice: expect.anything() }));
  });

  it("reports a partial success instead of allowing the order to be taken twice", async () => {
    const service = new MostroService(new TakeSellRunner(true));
    await expect(service.takeSell({
      orderId,
      fiatAmount: "100000",
      invoice: "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka",
      confirmed: true
    })).resolves.toMatchObject({ invoiceAdded: false });
  });

  it("does not notify Mostro twice when fiat was already marked as sent", async () => {
    vi.mocked(getTrade).mockResolvedValue({
      createdAt: "2026-09-04T00:05:47.000Z",
      currency: "COP",
      role: "taker",
      kind: "sell",
      lastKnownStep: "fiat_marked_sent"
    });
    const runner = new TakeSellRunner();

    const result = await new MostroService(runner).fiatSent(orderId);

    expect(result).toMatchObject({ alreadyConfirmed: true, orderId });
    expect(result.message).toContain("ya recibió esta confirmación");
    expect(runner.calls).toEqual([]);
    expect(upsertTrade).not.toHaveBeenCalled();
  });

  it("marks the trade ready for fiat after Mostro accepts the hold invoice", async () => {
    vi.mocked(getTrade).mockResolvedValue({
      createdAt: "2026-09-04T00:05:47.000Z",
      currency: "COP",
      role: "taker",
      kind: "sell",
      lastKnownStep: "waiting_for_lock"
    });
    const runner: MostroCliRunner = {
      async run() {
        return {
          exitCode: 0,
          stdout: `📄 Message 1:
⏰ Time: 2026-09-04 00:07:41
🎯 Action: 🎯 HoldInvoicePaymentAccepted
📝 Details:
   📋 Order: ${orderId} 2224 sats (COP)
   ✅ Status: Active`,
          stderr: "",
          durationMs: 1
        };
      }
    };

    const result = await new MostroService(runner).messages(orderId, 30);

    expect(result.lifecycle.step).toBe("ready_for_fiat");
    expect(upsertTrade).toHaveBeenCalledWith(orderId, { lastKnownStep: "ready_for_fiat" });
  });

  it("recovers a fiat confirmation from a contextual FiatSentOk event", async () => {
    vi.mocked(getTrade).mockResolvedValue({
      createdAt: "2026-09-04T00:05:47.000Z",
      currency: "COP",
      role: "taker",
      kind: "sell",
      lastKnownStep: "waiting_for_lock"
    });
    const runner: MostroCliRunner = {
      async run() {
        return {
          exitCode: 0,
          stdout: `📄 Message 1:
⏰ Time: 2026-09-04 00:07:41
🎯 Action: 🎯 HoldInvoicePaymentAccepted
📝 Details:
   📋 Order: ${orderId} 2224 sats (COP)
📄 Message 2:
⏰ Time: 2026-09-04 00:07:57
🎯 Action: 💸 FiatSentOk
📝 Details:
   👤 Peer: ${"1".repeat(64)}`,
          stderr: "",
          durationMs: 1
        };
      }
    };

    const result = await new MostroService(runner).messages(orderId, 30);

    expect(result.lifecycle.step).toBe("fiat_marked_sent");
    expect(upsertTrade).toHaveBeenCalledWith(orderId, { lastKnownStep: "fiat_marked_sent" });
  });

  it("reports remote success even when local state cannot be saved", async () => {
    vi.mocked(upsertTrade).mockRejectedValue(new Error("disk unavailable"));
    const runner = new TakeSellRunner();
    const service = new MostroService(runner);

    await expect(service.takeSell({
      orderId,
      fiatAmount: "100000",
      invoice: "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka",
      confirmed: true
    })).resolves.toMatchObject({ invoiceAdded: true });
    expect(runner.calls.map(([command]) => command)).toEqual(["takesell", "addinvoice"]);
  });

  it("formats an invalid trade index and synchronizes without retrying the order", async () => {
    const runner = new InvalidTradeIndexRunner();
    const service = new MostroService(runner);

    await expect(service.takeSell({ orderId, fiatAmount: "100000", confirmed: true })).rejects.toMatchObject({
      code: "TRADE_INDEX_OUT_OF_SYNC",
      message: expect.stringContaining("La oferta no fue tomada")
    });
    await expect(service.syncTradeIndex()).resolves.toMatchObject({
      message: expect.stringContaining("sincronizado")
    });
    expect(runner.calls.map(([command]) => command)).toEqual(["takesell", "getlasttradeindex"]);
  });

  it("returns cached public data when ordersinfo reports CantDo", async () => {
    const service = new MostroService(new UnavailableDetailRunner());
    await service.listOrders("COP");
    await expect(service.orderInfo(orderId)).resolves.toMatchObject({
      id: orderId,
      minFiatAmount: "50000",
      maxFiatAmount: "150000",
      verification: "unverified"
    });
  });

  it("maps CantDo to ORDER_NOT_AVAILABLE without a cached order", async () => {
    const service = new MostroService(new UnavailableDetailRunner());
    await expect(service.orderInfo(orderId)).rejects.toMatchObject({
      code: "ORDER_NOT_AVAILABLE"
    });
  });

  it("reads counterpart messages only with the pubkey stored for the local trade", async () => {
    vi.mocked(getTrade).mockResolvedValue({
      createdAt: "2026-09-03T18:40:40.000Z",
      currency: "COP",
      role: "taker",
      kind: "sell",
      counterpartyPubkey: "1".repeat(64),
      chatMessages: [{ id: "sent-1", direction: "outgoing", text: "Hola", timestamp: "2026-09-03T18:40:00Z" }],
      lastKnownStep: "ready_for_fiat"
    });
    const calls: string[][] = [];
    const runner: MostroCliRunner = {
      async run(args) {
        calls.push([...args]);
        return {
          exitCode: 0,
          stdout: "📭 No chat messages found for this shared conversation key.",
          stderr: "",
          durationMs: 1
        };
      }
    };
    const received = {
      id: "chat-peer-message",
      direction: "incoming" as const,
      text: "Ya recibí tu mensaje",
      timestamp: "2026-09-03T18:41:00Z"
    };
    const chatTransport: ChatTransport = {
      receive: vi.fn().mockResolvedValue([received]),
      send: vi.fn()
    };
    vi.mocked(mergeChatMessages).mockResolvedValue([
      { id: "sent-1", direction: "outgoing", text: "Hola", timestamp: "2026-09-03T18:40:00Z" },
      received
    ]);

    const result = await new MostroService(runner, chatTransport).chat(orderId, 120);

    expect(calls).toEqual([]);
    expect(chatTransport.receive).toHaveBeenCalledWith({
      orderId,
      peerPubkey: "1".repeat(64),
      relays: ["wss://relay.example"],
      since: 120
    });
    expect(result.messages.map((message) => message.direction)).toEqual(["outgoing", "incoming"]);
  });

  it("sends chat to the stored counterpart and records the outgoing message", async () => {
    vi.mocked(getTrade).mockResolvedValue({
      createdAt: "2026-09-03T18:40:40.000Z",
      currency: "COP",
      counterpartyPubkey: "1".repeat(64),
      lastKnownStep: "ready_for_fiat"
    });
    vi.mocked(appendChatMessage).mockResolvedValue([]);
    const runner = new TakeSellRunner();
    const chatTransport: ChatTransport = {
      receive: vi.fn(),
      send: vi.fn().mockResolvedValue({
        id: "chat-sent-message",
        direction: "outgoing",
        text: "Hola, ya pagué",
        timestamp: "2026-09-03T18:42:00Z"
      })
    };

    const result = await new MostroService(runner, chatTransport).sendChatMessage(orderId, "  Hola, ya pagué  ");

    expect(runner.calls).toEqual([]);
    expect(chatTransport.send).toHaveBeenCalledWith({
      orderId,
      peerPubkey: "1".repeat(64),
      relays: ["wss://relay.example"],
      message: "Hola, ya pagué"
    });
    expect(result).toMatchObject({ persisted: true, message: { direction: "outgoing", text: "Hola, ya pagué" } });
    expect(appendChatMessage).toHaveBeenCalledWith(orderId, expect.objectContaining({ text: "Hola, ya pagué" }));
  });

  it("does not invoke the CLI when a trade has no configured counterpart", async () => {
    vi.mocked(getTrade).mockResolvedValue({
      createdAt: "2026-09-03T18:40:40.000Z",
      currency: "COP",
      lastKnownStep: "unknown"
    });
    const runner = new TakeSellRunner();

    await expect(new MostroService(runner).sendChatMessage(orderId, "Hola")).rejects.toMatchObject({
      code: "ACTION_NOT_ALLOWED"
    });
    expect(runner.calls).toEqual([]);
  });

  it("locks the counterpart after an outgoing message exists", async () => {
    vi.mocked(getTrade).mockResolvedValue({
      createdAt: "2026-09-03T18:40:40.000Z",
      currency: "COP",
      counterpartyPubkey: "1".repeat(64),
      chatMessages: [{ id: "sent-1", direction: "outgoing", text: "Hola", timestamp: "2026-09-03T18:40:00Z" }],
      lastKnownStep: "ready_for_fiat"
    });

    await expect(new MostroService(new TakeSellRunner()).configureChat(orderId, "2".repeat(64))).rejects.toMatchObject({
      code: "ACTION_NOT_ALLOWED",
      message: expect.stringContaining("otra contraparte")
    });
    expect(upsertTrade).not.toHaveBeenCalled();
  });
});
