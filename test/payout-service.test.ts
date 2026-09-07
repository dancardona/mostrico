import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MostroService } from "@/lib/mostro/service";
import { getTrade, upsertTrade } from "@/lib/store/local-state";
import type { LocalTradeMetadata, MostroCliRunner } from "@/lib/mostro/types";

vi.mock("@/lib/store/local-state", () => ({ getTrade: vi.fn(), upsertTrade: vi.fn() }));
const orderId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const invoice = `lnbc1${"q".repeat(80)}`;
const event = (action: string, id: string | undefined = orderId, details = "", time = "2026-09-05 03:21:30") =>
  `📄 Message 1:\nTime: ${time}\nAction: ${action}\n${id ? `Order ID: ${id}\n` : ""}Details:\n${details}\n`;
const invoiceRequest = event("AddInvoice", orderId, `Order: ${orderId} 2224 sats (COP)\nStatus: SettledHoldInvoice`);
let trade: LocalTradeMetadata;
let dmOutput: string;
let snapshot: string;
let addOutput: string;
let addExit: number;
let restoreStatus: string;
const run = vi.fn<MostroCliRunner["run"]>();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-05T03:30:00Z"));
  vi.stubEnv("MOSTRO_PUBKEY", "0".repeat(64));
  vi.stubEnv("RELAYS", "wss://relay.example");
  trade = { createdAt: "2026-09-04T00:00:00Z", currency: "COP", kind: "sell", role: "taker", lastKnownStep: "fiat_marked_sent" };
  dmOutput = invoiceRequest;
  snapshot = JSON.stringify([{ id: orderId, status: "SettledHoldInvoice", sats: 2231 }]);
  addOutput = `Order ID: ${orderId}\nInvoice updated successfully. Payout confirmation is still pending.`;
  addExit = 0;
  restoreStatus = "settled-hold-invoice";
  vi.mocked(getTrade).mockImplementation(async () => ({ ...trade }));
  vi.mocked(upsertTrade).mockImplementation(async (_id, patch) => {
    trade = { ...trade, ...patch };
    return trade;
  });
  run.mockReset();
  run.mockImplementation(async (args) => ({
    exitCode: args[0] === "addinvoice" ? addExit : 0,
    stdout: args[0] === "getdm" ? dmOutput : args[0] === "ordersinfo" ? snapshot : args[0] === "addinvoice" ? addOutput
      : args[1] === "capabilities" ? JSON.stringify({ schema_version: 1, ok: true, data: { api_version: 1, cli_version: "0.16.1", features: ["restore-persist"] } })
      : args[1] === "restore" ? JSON.stringify({ schema_version: 1, ok: true, data: { persisted: { orders: 1, disputes: 0 }, orders: [{ order_id: orderId, trade_index: 1, status: restoreStatus }], disputes: [] } })
      : "Hold invoice payment settled successfully!",
    stderr: "", durationMs: 1
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("pending payout recovery", () => {
  it("recovers an older request, keeps the net amount and stays in payout after replacing the invoice", async () => {
    const service = new MostroService({ run });
    expect((await service.messages(orderId)).lifecycle).toMatchObject({ step: "needs_payout_invoice", payoutSats: 2224, readyForInvoice: false });
    expect(Number(run.mock.calls[0][0][2])).toBeGreaterThan(1440);
    expect((await service.addInvoice({ orderId, invoice })).message).toContain("pago a tu wallet sigue pendiente");
    dmOutput += event("HoldInvoicePaymentAccepted", orderId, "", "2026-09-04 00:07:41");
    expect((await service.messages(orderId)).lifecycle).toMatchObject({ step: "waiting_for_payout", payoutSats: 2224 });
    expect(run.mock.calls.filter(([args]) => args[0] === "getdm").at(-1)?.[0]).toEqual(["getdm", "--since", "30"]);
    expect(run.mock.calls.some(([args]) => ["release", "fiatsent"].includes(args[0]))).toBe(false);
    expect(JSON.stringify(trade)).not.toContain(invoice);
    dmOutput = event("AddInvoice", orderId, `Order: ${orderId} 2224 sats (COP)\nStatus: SettledHoldInvoice`, "2026-09-05 03:32:00");
    expect((await service.messages(orderId)).lifecycle.step).toBe("needs_payout_invoice");
  });

  it.each(["Invoice rejected: expired", "No response received"])("keeps the request pending on %s", async (failure) => {
    trade.lastKnownStep = "needs_payout_invoice";
    addExit = 1;
    addOutput = failure;
    await expect(new MostroService({ run }).addInvoice({ orderId, invoice })).rejects.toThrow();
    expect(trade.lastKnownStep).toBe("needs_payout_invoice");
  });

  it("does not accept exit zero or an acknowledgement for another order as invoice confirmation", async () => {
    trade.lastKnownStep = "needs_payout_invoice";
    for (const output of ["ok", `Order ID: ${orderId}\nSending lightning invoice...\nOrder ID: ${otherId}\nInvoice updated successfully.`]) {
      addOutput = output;
      await expect(new MostroService({ run }).addInvoice({ orderId, invoice })).rejects.toMatchObject({ code: "CLI_OUTPUT_UNRECOGNIZED" });
      expect(trade.lastKnownStep).toBe("needs_payout_invoice");
    }
  });

  it("keeps initial invoices on the existing lock flow", async () => {
    trade.lastKnownStep = "needs_invoice";
    addOutput = "Waiting for seller payment";
    await new MostroService({ run }).addInvoice({ orderId, invoice });
    expect(trade.lastKnownStep).toBe("waiting_for_lock");
  });

  it("never associates anonymous or other-order payment success by proximity", async () => {
    dmOutput += event("PurchaseCompleted", "") + event("PurchaseCompleted", otherId);
    expect((await new MostroService({ run }).messages(orderId)).lifecycle.step).toBe("needs_payout_invoice");
  });

  it("completes only on exact buyer payment confirmation or a verified Success snapshot", async () => {
    const service = new MostroService({ run });
    dmOutput += event("PurchaseCompleted", orderId, "", "2026-09-05 03:25:00");
    expect((await service.messages(orderId)).lifecycle.step).toBe("completed");
    expect(trade.payoutConfirmed).toBe(true);
    trade = { ...trade, lastKnownStep: "waiting_for_payout", payoutConfirmed: false, payoutEventAt: 0 };
    dmOutput = "";
    snapshot = JSON.stringify([{ id: orderId, status: "Success" }]);
    expect((await service.messages(orderId)).lifecycle.step).toBe("completed");
  });

  it("does not complete from an unrelated or unreadable snapshot", async () => {
    trade.lastKnownStep = "waiting_for_payout";
    dmOutput = "";
    for (const output of [JSON.stringify([{ id: otherId, status: "Success" }]), "Network error"]) {
      snapshot = output;
      expect((await new MostroService({ run }).messages(orderId)).lifecycle.step).toBe("waiting_for_payout");
    }
  });

  it("records release as pending and prevents repeating release or fiat confirmation", async () => {
    const service = new MostroService({ run });
    await service.releaseOrder(orderId);
    expect(trade.lastKnownStep).toBe("waiting_for_payout");
    await service.releaseOrder(orderId);
    await service.fiatSent(orderId);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rejects seller payout invoices without contacting Mostro", async () => {
    trade = { ...trade, kind: "buy", lastKnownStep: "needs_payout_invoice" };
    await expect(new MostroService({ run }).addInvoice({ orderId, invoice })).rejects.toMatchObject({ code: "ACTION_NOT_ALLOWED" });
    expect(run).not.toHaveBeenCalled();
  });

  it("preserves an invoice request when restoring a settled hold, but confirms actual Success", async () => {
    trade.lastKnownStep = "needs_payout_invoice";
    trade.payoutSats = 2224;
    const service = new MostroService({ run });
    await service.restoreSession();
    expect(trade).toMatchObject({ lastKnownStep: "needs_payout_invoice", payoutSats: 2224 });
    restoreStatus = "success";
    await service.restoreSession();
    expect(trade).toMatchObject({ lastKnownStep: "completed", payoutConfirmed: true });
  });
});
