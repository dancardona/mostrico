import {
  addInvoiceCommand,
  cancelOrderCommand,
  disputeCommand,
  fiatSentCommand,
  getDmCommand,
  listOrdersCommand,
  newOrderCommand,
  orderInfoCommand,
  rateCommand,
  releaseOrderCommand,
  syncTradeIndexCommand,
  takeSellCommand
} from "./commands";
import { parseNewOrderResult, parseOrderDetail, parseOrders, parseTradeMessages, commandSucceeded } from "./parsers";
import { mostroPubkeySchema, relayListSchema, type NewOrderInput } from "./schemas";
import { getRunner } from "./runner";
import { AppError, type CreatedOrderResult, Diagnostics, MostroCliRunner } from "./types";
import { getTrade, upsertTrade } from "@/lib/store/local-state";
import { cacheOrders, getCachedOrder } from "./order-cache";
import { parseCliError } from "./cli-error";

export class MostroService {
  constructor(private runner: MostroCliRunner = getRunner()) {}

  async diagnostics(): Promise<Diagnostics> {
    const warnings: string[] = [];
    const pubkey = process.env.MOSTRO_PUBKEY ?? "";
    const relays = process.env.RELAYS ?? "";
    const mostroConfigured = mostroPubkeySchema.safeParse(pubkey).success;
    const relayResult = relayListSchema.safeParse(relays);
    const relayCount = relayResult.success ? relayResult.data.length : 0;
    if (!mostroConfigured) warnings.push("Configura MOSTRO_PUBKEY con el pubkey público de la instancia Mostro.");
    if (!relayResult.success || relayCount === 0) warnings.push("Configura RELAYS con una lista wss:// separada por comas.");

    try {
      const version = await this.runner.run(["--version"], { timeoutMs: 10_000 });
      const helpChecks = await Promise.all([
        this.runner.run(["listorders", "--help"], { timeoutMs: 10_000 }),
        this.runner.run(["neworder", "--help"], { timeoutMs: 10_000 }),
        this.runner.run(["ordersinfo", "--help"], { timeoutMs: 10_000 }),
        this.runner.run(["takesell", "--help"], { timeoutMs: 10_000 }),
        this.runner.run(["getdm", "--help"], { timeoutMs: 10_000 })
      ]);
      const supported = version.exitCode === 0 && helpChecks.every((result) => result.exitCode === 0);
      return {
        cliFound: true,
        cliVersion: version.stdout.trim(),
        supported,
        mostroConfigured,
        relayCount,
        connection: mostroConfigured && relayCount > 0 ? "unknown" : "error",
        warnings
      };
    } catch (error) {
      if (error instanceof AppError && error.code === "CLI_NOT_FOUND") {
        return {
          cliFound: false,
          supported: false,
          mostroConfigured,
          relayCount,
          connection: "error",
          warnings: ["No se encontró mostro-cli en PATH o MOSTRO_CLI_PATH.", ...warnings]
        };
      }
      throw error;
    }
  }

  async listOrders(currency = "COP") {
    this.ensureConfigured();
    const command = listOrdersCommand({ currency });
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    const orders = parseOrders(result.stdout);
    cacheOrders(orders);
    return orders;
  }

  async orderInfo(orderId: string) {
    this.ensureConfigured();
    const command = orderInfoCommand(orderId);
    const cachedOrder = getCachedOrder(orderId);
    let result;
    try {
      result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
      this.ensureExitOk(result.exitCode, this.resultOutput(result));
    } catch (error) {
      if (cachedOrder && error instanceof AppError && ["ORDER_NOT_AVAILABLE", "CLI_TIMEOUT", "NETWORK_ERROR"].includes(error.code)) {
        return this.unverifiedOrder(cachedOrder);
      }
      throw error;
    }
    const order = parseOrderDetail(result.stdout) ?? parseOrders(result.stdout)[0];
    if (!order) {
      if (cachedOrder) return this.unverifiedOrder(cachedOrder);
      throw new AppError("CLI_OUTPUT_UNRECOGNIZED", "No pudimos interpretar la oferta.");
    }
    return { ...order, verification: "verified" as const };
  }

  async createOrder(input: NewOrderInput): Promise<CreatedOrderResult> {
    this.ensureConfigured();
    const command = newOrderCommand(input);
    const result = await this.runner.run(command.args, {
      timeoutMs: command.timeoutMs,
      preserveInvoices: true
    });
    const output = this.resultOutput(result);
    const created = parseNewOrderResult(output);
    if (result.exitCode !== 0 && !created.orderId) this.ensureExitOk(result.exitCode, output);
    if (!created.orderId) {
      throw new AppError("CLI_OUTPUT_UNRECOGNIZED", "Mostro respondió, pero no pudimos identificar la orden creada.");
    }

    try {
      await upsertTrade(created.orderId, {
        currency: input.currency,
        role: "maker",
        kind: input.kind,
        selectedFiatAmount: input.fiatAmount,
        satsAmount: input.satsAmount,
        paymentMethods: input.paymentMethods,
        premiumPct: input.premium,
        expirationDays: input.expirationDays,
        lastKnownStep: created.paymentInvoice ? "waiting_for_lock" : "maker_pending"
      });
    } catch {
      // Mostro already created the order; local persistence must not make it look retryable.
    }

    return {
      orderId: created.orderId,
      kind: input.kind,
      paymentInvoice: created.paymentInvoice,
      message: created.paymentInvoice
        ? "Orden creada. Paga la hold invoice desde tu wallet para bloquear los sats."
        : "Orden creada y publicada en Mostro.",
      partial: result.exitCode !== 0
    };
  }

  async localOrder(orderId: string) {
    const trade = await getTrade(orderId);
    if (!trade || trade.role !== "maker") {
      throw new AppError("ORDER_NOT_FOUND", "No encontramos esta orden entre las creadas con Mostrico.");
    }
    return { orderId, ...trade };
  }

  async takeSell(input: { orderId: string; fiatAmount?: string; invoice?: string; confirmed: true }) {
    this.ensureConfigured();
    const command = takeSellCommand({
      orderId: input.orderId,
      fiatAmount: input.fiatAmount,
      confirmed: input.confirmed
    });
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    try {
      await upsertTrade(input.orderId, {
        currency: "COP",
        selectedFiatAmount: input.fiatAmount,
        lastKnownStep: "needs_invoice"
      });
    } catch {
      // Mostro already accepted the order; local persistence must not make this look retryable.
    }

    if (!input.invoice) {
      return {
        message: "Oferta tomada. Agrega una invoice Lightning para continuar.",
        orderId: input.orderId,
        invoiceAdded: false
      };
    }

    const invoiceCommand = addInvoiceCommand({ orderId: input.orderId, invoice: input.invoice });
    try {
      const invoiceResult = await this.runner.run(invoiceCommand.args, { timeoutMs: invoiceCommand.timeoutMs });
      this.ensureExitOk(invoiceResult.exitCode, this.resultOutput(invoiceResult));
      try {
        await upsertTrade(input.orderId, { lastKnownStep: "waiting_for_lock" });
      } catch {
        // The invoice is already remote state, so report that success even if local state cannot persist.
      }
      return {
        message: "Oferta tomada e invoice Lightning agregada.",
        orderId: input.orderId,
        invoiceAdded: true
      };
    } catch {
      return {
        message: "La oferta fue tomada, pero la invoice no pudo agregarse. Agrégala de nuevo desde la operación.",
        orderId: input.orderId,
        invoiceAdded: false
      };
    }
  }

  async addInvoice(input: { orderId: string; invoice: string }) {
    this.ensureConfigured();
    const command = addInvoiceCommand(input);
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    await upsertTrade(input.orderId, { lastKnownStep: "waiting_for_lock" });
    return { message: commandSucceeded(result.stdout), orderId: input.orderId };
  }

  async syncTradeIndex() {
    this.ensureConfigured();
    const command = syncTradeIndexCommand();
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    return { message: "Índice de operaciones sincronizado. Ya puedes volver a intentar tomar la oferta." };
  }

  async messages(orderId: string, since = 30) {
    this.ensureConfigured();
    const command = getDmCommand(since);
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    return parseTradeMessages(result.stdout, orderId);
  }

  async fiatSent(orderId: string) {
    this.ensureConfigured();
    const command = fiatSentCommand(orderId);
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    await upsertTrade(orderId, { lastKnownStep: "fiat_marked_sent" });
    return { message: commandSucceeded(result.stdout), orderId };
  }

  async rate(orderId: string, rating: number) {
    this.ensureConfigured();
    const command = rateCommand(orderId, rating);
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    return { message: commandSucceeded(result.stdout), orderId };
  }

  async dispute(orderId: string) {
    this.ensureConfigured();
    const command = disputeCommand(orderId);
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    await upsertTrade(orderId, { lastKnownStep: "disputed" });
    return { message: commandSucceeded(result.stdout), orderId };
  }

  async cancelOrder(orderId: string) {
    this.ensureConfigured();
    const command = cancelOrderCommand(orderId);
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    await upsertTrade(orderId, { lastKnownStep: "canceled" });
    return { message: "Orden cancelada.", orderId };
  }

  async releaseOrder(orderId: string) {
    this.ensureConfigured();
    const command = releaseOrderCommand(orderId);
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    await upsertTrade(orderId, { lastKnownStep: "completed" });
    return { message: "Sats liberados al comprador.", orderId };
  }

  private ensureExitOk(exitCode: number, output: string) {
    if (exitCode !== 0) {
      const message = output.trim() || "mostro-cli devolvió un error.";
      throw parseCliError(message);
    }
  }

  private resultOutput(result: { stdout: string; stderr: string }) {
    return [result.stdout, result.stderr].filter(Boolean).join("\n");
  }

  private unverifiedOrder(order: ReturnType<typeof getCachedOrder> & object) {
    return {
      ...order,
      verification: "unverified" as const,
      verificationMessage: "El nodo de Mostro no pudo verificar esta oferta. Los datos provienen del libro público y podrían estar desactualizados."
    };
  }

  private ensureConfigured() {
    const pubkey = process.env.MOSTRO_PUBKEY ?? "";
    const relays = process.env.RELAYS ?? "";
    const relayResult = relayListSchema.safeParse(relays);
    if (!mostroPubkeySchema.safeParse(pubkey).success) {
      throw new AppError("MOSTRO_NOT_CONFIGURED", "MOSTRO_PUBKEY no es válido o no está configurado.");
    }
    if (!relayResult.success || relayResult.data.length === 0) {
      throw new AppError("RELAYS_NOT_CONFIGURED", "RELAYS debe incluir al menos un relay wss://.");
    }
  }
}
