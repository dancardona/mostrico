import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearOrderCache } from "@/lib/mostro/order-cache";
import { MostroService } from "@/lib/mostro/service";
import { getTrade, upsertTrade } from "@/lib/store/local-state";
import type { MostroCliRunner, RunResult } from "@/lib/mostro/types";

vi.mock("@/lib/store/local-state", () => ({ getTrade: vi.fn(), upsertTrade: vi.fn() }));

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
});
