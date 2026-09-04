import { describe, expect, it } from "vitest";
import {
  addInvoiceCommand,
  cancelOrderCommand,
  disputeCommand,
  fiatSentCommand,
  getDmUserCommand,
  listOrdersCommand,
  newOrderCommand,
  orderInfoCommand,
  rateCommand,
  releaseOrderCommand,
  sendDmCommand,
  syncTradeIndexCommand,
  takeBuyCommand,
  takeSellCommand
} from "@/lib/mostro/commands";

const orderId = "11111111-1111-4111-8111-111111111111";
const invoice = "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka";

describe("Mostro command construction", () => {
  it("builds fixed allowlisted argument arrays", () => {
    expect(listOrdersCommand({ currency: "COP" }).args).toEqual(["listorders", "-k", "sell", "-c", "cop"]);
    expect(listOrdersCommand({ currency: "COP", kind: "buy" }).args).toEqual(["listorders", "-k", "buy", "-c", "cop"]);
    expect(orderInfoCommand(orderId).args).toEqual(["ordersinfo", "-o", orderId]);
    expect(takeSellCommand({ orderId, fiatAmount: "100000", confirmed: true }).args).toEqual([
      "takesell", "-o", orderId, "-a", "100000"
    ]);
    expect(takeBuyCommand({ orderId, fiatAmount: "100000", confirmed: true }).args).toEqual([
      "takebuy", "-o", orderId, "-a", "100000"
    ]);
    expect(addInvoiceCommand({ orderId, invoice }).args).toEqual(["addinvoice", "-o", orderId, "-i", invoice]);
    expect(fiatSentCommand(orderId).args).toEqual(["fiatsent", "-o", orderId]);
    expect(rateCommand(orderId, 5).args).toEqual(["rate", "-o", orderId, "-r", "5"]);
    expect(disputeCommand(orderId).args).toEqual(["dispute", "-o", orderId]);
    expect(syncTradeIndexCommand().args).toEqual(["getlasttradeindex"]);
    expect(getDmUserCommand({ orderId, pubkey: "1".repeat(64), since: 120 }).args).toEqual([
      "getdmuser", "-p", "1".repeat(64), "-o", orderId, "--since", "120"
    ]);
    expect(sendDmCommand({ orderId, pubkey: "1".repeat(64), message: "Hola, ya pagué" }).args).toEqual([
      "senddm", "-p", "1".repeat(64), "-o", orderId, "-m", "Hola, ya pagué"
    ]);
    expect(newOrderCommand({
      kind: "buy",
      currency: "COP",
      fiatAmount: "100000-300000",
      satsAmount: "0",
      paymentMethods: ["Nequi", "Bancolombia"],
      premium: 2,
      invoice,
      expirationDays: 7,
      confirmed: true
    }).args).toEqual([
      "neworder", "-k", "buy", "-c", "cop", "-f", "100000-300000",
      "-m", "Nequi,Bancolombia", "-a", "0", "-p", "2", "-e", "7", "-i", invoice
    ]);
    expect(cancelOrderCommand(orderId).args).toEqual(["cancel", "-o", orderId]);
    expect(releaseOrderCommand(orderId).args).toEqual(["release", "-o", orderId]);
  });

  it("rejects injection-shaped order IDs before runner invocation", () => {
    for (const bad of ["uuid; rm -rf /", "$(whoami)", "\"`touch /tmp/x`\""]) {
      expect(() => orderInfoCommand(bad)).toThrow();
      expect(() => fiatSentCommand(bad)).toThrow();
      expect(() => sendDmCommand({ orderId: bad, pubkey: "1".repeat(64), message: "hola" })).toThrow();
    }
  });

  it("rejects invalid chat recipients and control characters", () => {
    expect(() => sendDmCommand({ orderId, pubkey: "$(whoami)", message: "hola" })).toThrow();
    expect(() => sendDmCommand({ orderId, pubkey: "1".repeat(64), message: "hola\u0000mundo" })).toThrow();
  });

  it("requires explicit confirmation for mutating take sell", () => {
    expect(() => takeSellCommand({ orderId, confirmed: false as true })).toThrow();
  });
});
