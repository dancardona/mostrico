import {
  addInvoiceCommand,
  cancelOrderCommand,
  disputeCommand,
  fiatSentCommand,
  getDmCommand,
  getDmUserCommand,
  listOrdersCommand,
  newOrderCommand,
  orderInfoCommand,
  rateCommand,
  releaseOrderCommand,
  syncTradeIndexCommand,
  takeSellCommand
} from "./commands";
import {
  commandSucceeded,
  parseCliTradeEvents,
  parseChatMessages,
  parseNewOrderResult,
  parseOrderDetail,
  parseOrders,
  parsePeerDisclosures,
  parseTakeSellResult,
  parseTradeMessages
} from "./parsers";
import { chatMessageSchema, mostroPubkeySchema, nostrPubkeySchema, relayListSchema, type NewOrderInput } from "./schemas";
import { getRunner } from "./runner";
import { AppError, type CreatedOrderResult, Diagnostics, MostroCliRunner, type TakeSellResult } from "./types";
import { appendChatMessage, getTrade, mergeChatMessages, upsertTrade } from "@/lib/store/local-state";
import { cacheOrders, getCachedOrder } from "./order-cache";
import { parseCliError } from "./cli-error";
import { redactSensitive } from "./redact";
import { cacheBondInvoice, clearCachedBondInvoice, getCachedBondInvoice } from "./bond-cache";
import { getChatTransport, type ChatTransport } from "./chat-transport";

const bondEventMatchWindowMs = 2 * 60_000;

function cliTimestampMs(value?: string) {
  if (!value) return undefined;
  const parsed = Date.parse(`${value.replace(" ", "T")}Z`);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasContextualTradeEvent(
  events: ReturnType<typeof parseCliTradeEvents>,
  orderId: string,
  action: string
) {
  return events.some((event, index) => {
    if (event.action !== action) return false;
    if (event.orderId) return event.orderId === orderId;
    const eventTime = cliTimestampMs(event.timestamp);
    if (eventTime === undefined) return false;
    const recentOrderIds = new Set(events.slice(0, index)
      .filter((candidate) => candidate.orderId)
      .filter((candidate) => {
        const candidateTime = cliTimestampMs(candidate.timestamp);
        return candidateTime !== undefined && eventTime >= candidateTime && eventTime - candidateTime <= bondEventMatchWindowMs;
      })
      .map((candidate) => candidate.orderId as string));
    return recentOrderIds.size === 1 && recentOrderIds.has(orderId);
  });
}

export class MostroService {
  constructor(
    private runner: MostroCliRunner = getRunner(),
    private chatTransport: ChatTransport = getChatTransport()
  ) {}

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
        this.runner.run(["getdm", "--help"], { timeoutMs: 10_000 }),
        this.runner.run(["getdmuser", "--help"], { timeoutMs: 10_000 }),
        this.runner.run(["senddm", "--help"], { timeoutMs: 10_000 })
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

  async takeSell(input: { orderId: string; fiatAmount?: string; invoice?: string; confirmed: true }): Promise<TakeSellResult> {
    this.ensureConfigured();
    const makerPubkey = getCachedOrder(input.orderId)?.makerPubkey;
    const parsedMakerPubkey = nostrPubkeySchema.safeParse(makerPubkey);
    const counterpartyPubkey = parsedMakerPubkey.success ? parsedMakerPubkey.data : undefined;
    const command = takeSellCommand({
      orderId: input.orderId,
      fiatAmount: input.fiatAmount,
      confirmed: input.confirmed
    });
    const result = await this.runner.run(command.args, {
      timeoutMs: command.timeoutMs,
      preserveInvoices: true
    });
    const output = this.resultOutput(result);
    this.ensureExitOk(result.exitCode, output);
    const { bondInvoice } = parseTakeSellResult(output);

    if (bondInvoice) {
      cacheBondInvoice(input.orderId, bondInvoice);
      try {
        await upsertTrade(input.orderId, {
          currency: "COP",
          role: "taker",
          kind: "sell",
          selectedFiatAmount: input.fiatAmount,
          counterpartyPubkey,
          lastKnownStep: "waiting_for_bond"
        });
      } catch {
        // The bond request is already remote state; return it even if local persistence fails.
      }
      return {
        message: "Mostro requiere una garantía anti-abuso antes de continuar.",
        orderId: input.orderId,
        invoiceAdded: false,
        bondInvoice,
        nextStep: "pay_bond"
      };
    }

    try {
      await upsertTrade(input.orderId, {
        currency: "COP",
        role: "taker",
        kind: "sell",
        selectedFiatAmount: input.fiatAmount,
        counterpartyPubkey,
        lastKnownStep: "needs_invoice"
      });
    } catch {
      // Mostro already accepted the order; local persistence must not make this look retryable.
    }

    if (!input.invoice) {
      return {
        message: "Oferta tomada. Agrega una invoice Lightning para continuar.",
        orderId: input.orderId,
        invoiceAdded: false,
        nextStep: "add_invoice"
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
        invoiceAdded: true,
        nextStep: "waiting_for_seller"
      };
    } catch {
      return {
        message: "La oferta fue tomada, pero la invoice no pudo agregarse. Agrégala de nuevo desde la operación.",
        orderId: input.orderId,
        invoiceAdded: false,
        nextStep: "add_invoice"
      };
    }
  }

  async addInvoice(input: { orderId: string; invoice: string }) {
    this.ensureConfigured();
    const command = addInvoiceCommand(input);
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    await upsertTrade(input.orderId, { lastKnownStep: "waiting_for_lock" });
    clearCachedBondInvoice(input.orderId);
    return {
      message: commandSucceeded(result.stdout, "**Invoice enviada**\n\nMostro recibió la solicitud. Actualiza la operación para confirmar el siguiente paso."),
      orderId: input.orderId
    };
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
    const result = await this.runner.run(command.args, {
      timeoutMs: command.timeoutMs,
      preserveInvoices: true,
      preservePeerPubkeys: true
    });
    const output = this.resultOutput(result);
    this.ensureExitOk(result.exitCode, output);

    const trade = await getTrade(orderId);
    const createdAt = trade ? Date.parse(trade.createdAt) : Number.NaN;
    const events = parseCliTradeEvents(output);
    const disclosedPeer = parsePeerDisclosures(output).find((peer) => peer.orderId === orderId)?.pubkey;
    const validatedPeer = nostrPubkeySchema.safeParse(disclosedPeer);
    if (trade && !trade.counterpartyPubkey && validatedPeer.success) {
      await upsertTrade(orderId, { counterpartyPubkey: validatedPeer.data });
    }
    const exactEvents = events.filter((event) => event.orderId === orderId);
    const readyForInvoice = exactEvents.some((event) => event.action === "AddInvoice");
    const readyForFiat = exactEvents.some((event) => event.action === "HoldInvoicePaymentAccepted");
    const fiatSentAccepted = hasContextualTradeEvent(events, orderId, "FiatSentOk");
    const bondEvent = events
      .filter((event) => event.action === "PayBondInvoice" && event.invoice)
      .map((event) => ({ event, timestamp: cliTimestampMs(event.timestamp) }))
      .filter(({ event, timestamp }) => event.orderId === orderId || (
        trade && timestamp !== undefined && Number.isFinite(createdAt) && Math.abs(timestamp - createdAt) <= bondEventMatchWindowMs
      ))
      .sort((left, right) => Math.abs((left.timestamp ?? 0) - createdAt) - Math.abs((right.timestamp ?? 0) - createdAt))[0]?.event;
    const bondInvoice = bondEvent?.invoice ?? getCachedBondInvoice(orderId);

    let step = trade?.lastKnownStep ?? "unknown";
    if (bondEvent && !["waiting_for_lock", "ready_for_fiat", "fiat_marked_sent", "waiting_release", "completed", "canceled", "disputed"].includes(step)) {
      step = "waiting_for_bond";
    }
    if (readyForInvoice && step === "waiting_for_bond") step = "needs_invoice";
    if (readyForFiat && !["fiat_marked_sent", "waiting_release", "completed", "canceled", "disputed"].includes(step)) {
      step = "ready_for_fiat";
    }
    if (fiatSentAccepted && !["waiting_release", "completed", "canceled", "disputed"].includes(step)) {
      step = "fiat_marked_sent";
    }
    if (trade && step !== trade.lastKnownStep) {
      await upsertTrade(orderId, { lastKnownStep: step });
    }

    return {
      ...parseTradeMessages(redactSensitive(output), orderId),
      lifecycle: {
        step,
        bondRequired: Boolean(bondInvoice) || trade?.lastKnownStep === "waiting_for_bond",
        bondInvoice,
        readyForInvoice
      }
    };
  }

  async fiatSent(orderId: string) {
    this.ensureConfigured();
    const trade = await getTrade(orderId);
    if (trade && ["fiat_marked_sent", "waiting_release", "completed"].includes(trade.lastKnownStep)) {
      return {
        message: "**Pago fiat ya notificado**\n\nMostro ya recibió esta confirmación. No se volvió a enviar.",
        orderId,
        alreadyConfirmed: true
      };
    }

    const command = fiatSentCommand(orderId);
    const result = await this.runner.run(command.args, {
      timeoutMs: command.timeoutMs,
      preservePeerPubkeys: true
    });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    const disclosedPeer = parsePeerDisclosures(this.resultOutput(result)).find((peer) => peer.orderId === orderId)?.pubkey;
    const validatedPeer = nostrPubkeySchema.safeParse(disclosedPeer);
    try {
      await upsertTrade(orderId, {
        lastKnownStep: "fiat_marked_sent",
        counterpartyPubkey: validatedPeer.success ? validatedPeer.data : undefined
      });
    } catch {
      // Mostro already accepted the declaration; local persistence must not make it look retryable.
    }
    return { message: commandSucceeded(result.stdout, "**Acción enviada**\n\nMostro recibió la confirmación del pago fiat."), orderId };
  }

  async configureChat(orderId: string, pubkey: string) {
    const trade = await this.requireLocalTrade(orderId);
    const parsedPubkey = nostrPubkeySchema.parse(pubkey);
    if (trade.counterpartyPubkey && trade.counterpartyPubkey !== parsedPubkey && (trade.chatMessages?.length ?? 0) > 0) {
      throw new AppError(
        "ACTION_NOT_ALLOWED",
        "Esta operación ya tiene mensajes enviados a otra contraparte.",
        { title: "Contraparte protegida", hint: "No se reemplazó la pubkey para evitar mezclar conversaciones entre operaciones." }
      );
    }
    await upsertTrade(orderId, { counterpartyPubkey: parsedPubkey });
    return { ready: true, counterpartyPubkey: parsedPubkey };
  }

  async chat(orderId: string, since = 60) {
    const trade = await this.requireLocalTrade(orderId);
    const outgoing = trade.chatMessages ?? [];
    if (!trade.counterpartyPubkey) {
      return { ready: false, counterpartyPubkey: undefined, messages: outgoing };
    }

    this.ensureConfigured();
    const relays = relayListSchema.parse(process.env.RELAYS ?? "");
    const command = getDmUserCommand({ orderId, pubkey: trade.counterpartyPubkey, since });
    let nativeIncoming = [] as Awaited<ReturnType<ChatTransport["receive"]>>;
    let nativeError: unknown;
    try {
      nativeIncoming = await this.chatTransport.receive({
        orderId,
        peerPubkey: trade.counterpartyPubkey,
        relays,
        since
      });
    } catch (error) {
      nativeError = error;
    }

    let legacyIncoming = [] as Awaited<ReturnType<ChatTransport["receive"]>>;
    let legacyError: unknown;
    const hasCurrentProtocolHistory = outgoing.some((message) => message.id.startsWith("chat-"));
    if (!hasCurrentProtocolHistory && nativeIncoming.length === 0) {
      try {
        const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
        this.ensureExitOk(result.exitCode, this.resultOutput(result));
        legacyIncoming = parseChatMessages(result.stdout);
      } catch (error) {
        legacyError = error;
      }
    }
    if (nativeError && legacyError) {
      throw nativeError;
    }
    const incoming = [
      ...nativeIncoming,
      ...legacyIncoming
    ];
    const persisted = incoming.length > 0
      ? await mergeChatMessages(orderId, incoming)
      : outgoing;
    const messages = persisted
      .filter((message, index, all) => all.findIndex((candidate) => candidate.id === message.id) === index)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    return { ready: true, counterpartyPubkey: trade.counterpartyPubkey, messages };
  }

  async sendChatMessage(orderId: string, message: string) {
    this.ensureConfigured();
    const trade = await this.requireLocalTrade(orderId);
    if (!trade.counterpartyPubkey) {
      throw new AppError(
        "ACTION_NOT_ALLOWED",
        "Todavía no conocemos la pubkey de la contraparte.",
        { title: "Chat no disponible", hint: "Actualiza la operación o configura la pubkey de intercambio de la contraparte." }
      );
    }

    const cleanMessage = chatMessageSchema.parse(message);
    const relays = relayListSchema.parse(process.env.RELAYS ?? "");
    const sentMessage = await this.chatTransport.send({
      orderId,
      peerPubkey: trade.counterpartyPubkey,
      relays,
      message: cleanMessage
    });

    try {
      await appendChatMessage(orderId, sentMessage);
    } catch {
      return { message: sentMessage, persisted: false };
    }
    return { message: sentMessage, persisted: true };
  }

  async rate(orderId: string, rating: number) {
    this.ensureConfigured();
    const command = rateCommand(orderId, rating);
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    return { message: commandSucceeded(result.stdout, "**Calificación enviada**\n\nMostro recibió tu calificación."), orderId };
  }

  async dispute(orderId: string) {
    this.ensureConfigured();
    const command = disputeCommand(orderId);
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    await upsertTrade(orderId, { lastKnownStep: "disputed" });
    return { message: commandSucceeded(result.stdout, "**Disputa enviada**\n\nMostro recibió la solicitud de disputa."), orderId };
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

  private async requireLocalTrade(orderId: string) {
    const trade = await getTrade(orderId);
    if (!trade) {
      throw new AppError("ORDER_NOT_FOUND", "No encontramos esta operación entre las gestionadas por Mostrico.");
    }
    return trade;
  }
}
