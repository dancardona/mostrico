import {
  addInvoiceCommand,
  cancelOrderCommand,
  disputeCommand,
  fiatSentCommand,
  getDmCommand,
  getDmUserCommand,
  listOrdersCommand,
  machineCapabilitiesCommand,
  machineFiatSentCommand,
  machineRestoreCommand,
  newOrderCommand,
  orderInfoCommand,
  rateCommand,
  releaseOrderCommand,
  syncTradeIndexCommand,
  takeBuyCommand,
  takeSellCommand
} from "./commands";
import {
  commandSucceeded,
  parseCliTradeEvents,
  parseChatMessages,
  parseNewOrderResult,
  parseOrders,
  parsePeerDisclosures,
  parseTakeBuyResult,
  parseTakeSellResult,
  parseTradeMessages
} from "./parsers";
import { chatMessageSchema, mostroPubkeySchema, nostrPubkeySchema, relayListSchema, type NewOrderInput } from "./schemas";
import { getRunner } from "./runner";
import { isPayoutStep, normalizeStatus, reconcilePayout } from "./payout";
import { AppError, type CreatedOrderResult, Diagnostics, MostroCliRunner, type TakeBuyResult, type TakeSellResult } from "./types";
import { appendChatMessage, getTrade, mergeChatMessages, upsertTrade } from "@/lib/store/local-state";
import { cacheOrders, getCachedOrder } from "./order-cache";
import { parseCliError } from "./cli-error";
import { redactSensitive } from "./redact";
import { cacheBondInvoice, clearCachedBondInvoice, getCachedBondInvoice } from "./bond-cache";
import { cachePaymentInvoice, clearCachedPaymentInvoice, getCachedPaymentInvoice } from "./payment-invoice-cache";
import { getChatTransport, type ChatTransport } from "./chat-transport";
import {
  machineCapabilitiesSchema,
  machineFiatSentSchema,
  machineRestoreSchema,
  parseMachineApiEnvelope,
  type MachineApiEnvelope
} from "./machine-api";

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
      const capabilitiesCommand = machineCapabilitiesCommand();
      const [version, capabilitiesResult, ...helpChecks] = await Promise.all([
        this.runner.run(["--version"], { timeoutMs: 10_000 }),
        this.runner.run(capabilitiesCommand.args, { timeoutMs: capabilitiesCommand.timeoutMs }),
        this.runner.run(["listorders", "--help"], { timeoutMs: 10_000 }),
        this.runner.run(["neworder", "--help"], { timeoutMs: 10_000 }),
        this.runner.run(["ordersinfo", "--help"], { timeoutMs: 10_000 }),
        this.runner.run(["takesell", "--help"], { timeoutMs: 10_000 }),
        this.runner.run(["getdm", "--help"], { timeoutMs: 10_000 }),
        this.runner.run(["getdmuser", "--help"], { timeoutMs: 10_000 }),
        this.runner.run(["senddm", "--help"], { timeoutMs: 10_000 })
      ]);
      const capabilitiesEnvelope = parseMachineApiEnvelope(capabilitiesResult.stdout, machineCapabilitiesSchema);
      const capabilities = capabilitiesEnvelope?.ok ? capabilitiesEnvelope.data : undefined;
      if (!capabilities) {
        warnings.push("El CLI funciona con compatibilidad básica, pero no expone la API para aplicaciones de Mostrico.");
      } else if (capabilities.api_version !== 1) {
        warnings.push(`La API para aplicaciones v${capabilities.api_version} no es compatible con esta versión de Mostrico.`);
      }
      const supported = version.exitCode === 0 && helpChecks.every((result) => result.exitCode === 0);
      return {
        cliFound: true,
        cliVersion: version.stdout.trim(),
        supported,
        machineApiVersion: capabilities?.api_version,
        machineFeatures: capabilities?.features ?? [],
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
          machineFeatures: [],
          mostroConfigured,
          relayCount,
          connection: "error",
          warnings: ["No se encontró mostro-cli en PATH o MOSTRO_CLI_PATH.", ...warnings]
        };
      }
      throw error;
    }
  }

  async listOrders(currency = "COP", kind: "buy" | "sell" = "sell") {
    this.ensureConfigured();
    const command = listOrdersCommand({ currency, kind });
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
    const order = parseOrders(result.stdout).find((candidate) => candidate.id === orderId);
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

  async takeBuy(input: { orderId: string; fiatAmount?: string; confirmed: true }): Promise<TakeBuyResult> {
    this.ensureConfigured();
    const makerPubkey = getCachedOrder(input.orderId)?.makerPubkey;
    const parsedMakerPubkey = nostrPubkeySchema.safeParse(makerPubkey);
    const counterpartyPubkey = parsedMakerPubkey.success ? parsedMakerPubkey.data : undefined;
    const command = takeBuyCommand(input);
    const result = await this.runner.run(command.args, {
      timeoutMs: command.timeoutMs,
      preserveInvoices: true
    });
    const output = this.resultOutput(result);
    this.ensureExitOk(result.exitCode, output);
    const { bondInvoice, paymentInvoice } = parseTakeBuyResult(output);

    if (bondInvoice) cacheBondInvoice(input.orderId, bondInvoice);
    if (paymentInvoice) cachePaymentInvoice(input.orderId, paymentInvoice);

    const lastKnownStep = bondInvoice ? "waiting_for_bond" : "waiting_for_lock";
    try {
      await upsertTrade(input.orderId, {
        currency: "COP",
        role: "taker",
        kind: "buy",
        selectedFiatAmount: input.fiatAmount,
        counterpartyPubkey,
        lastKnownStep
      });
    } catch {
      // Mostro already accepted the order; local persistence must not make it look retryable.
    }

    return {
      orderId: input.orderId,
      message: bondInvoice
        ? "Mostro requiere una garantía anti-abuso antes de entregar la hold invoice de la operación."
        : paymentInvoice
          ? "Oferta tomada. Paga la hold invoice para bloquear los sats."
          : "Oferta tomada. Espera la hold invoice de Mostro.",
      bondInvoice,
      paymentInvoice,
      nextStep: bondInvoice ? "pay_bond" : paymentInvoice ? "pay_invoice" : "waiting_for_lock"
    };
  }

  async addInvoice(input: { orderId: string; invoice: string }) {
    this.ensureConfigured();
    const command = addInvoiceCommand(input);
    const trade = await getTrade(input.orderId);
    const payout = isPayoutStep(trade?.lastKnownStep);
    const seller = trade?.role === "maker" ? trade.kind === "sell" : trade?.kind === "buy";
    if (trade?.payoutConfirmed || trade?.lastKnownStep === "canceled" || (payout && seller)) {
      throw new AppError("ACTION_NOT_ALLOWED", "Esta operación no permite agregar una invoice de cobro.");
    }
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    const invoiceUpdated = result.stdout.match(/^Order ID:\s*([0-9a-f-]{36})\r?\nInvoice updated successfully\./im)?.[1] === input.orderId;
    if (payout && !invoiceUpdated) {
      throw new AppError("CLI_OUTPUT_UNRECOGNIZED", "No recibimos la confirmación de la nueva invoice. Actualiza el estado antes de volver a enviarla.");
    }
    await upsertTrade(input.orderId, invoiceUpdated ? {
      lastKnownStep: "waiting_for_payout",
      payoutEventAt: Date.now()
    } : { lastKnownStep: "waiting_for_lock" });
    clearCachedBondInvoice(input.orderId);
    return {
      message: invoiceUpdated
        ? "Invoice actualizada. Mostro confirmó el reemplazo; el pago a tu wallet sigue pendiente."
        : commandSucceeded(result.stdout, "**Invoice enviada**\n\nMostro recibió la solicitud. Actualiza la operación para confirmar el siguiente paso."),
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

  async restoreSession() {
    this.ensureConfigured();
    const capabilities = await this.machineCapabilities();
    if (!capabilities || capabilities.api_version !== 1 || !capabilities.features.includes("restore-persist")) {
      throw new AppError(
        "CLI_VERSION_UNSUPPORTED",
        "Esta versión de mostro-cli no puede restaurar operaciones desde Mostrico.",
        { title: "Actualiza el fork", hint: "Compila la rama del fork que incluye `mostro-cli api restore`." }
      );
    }

    const command = machineRestoreCommand();
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    const restored = this.requireMachineSuccess(
      parseMachineApiEnvelope(result.stdout, machineRestoreSchema),
      "No pudimos interpretar la restauración de mostro-cli."
    );

    const restoredOrderIds = new Set<string>();
    for (const order of restored.orders) {
      restoredOrderIds.add(order.order_id);
      const local = await getTrade(order.order_id);
      const step = this.restoredStep(order.status);
      await upsertTrade(order.order_id, {
        lastKnownStep: local?.payoutConfirmed ? "completed"
          : step === "waiting_for_payout" && local?.lastKnownStep === "needs_payout_invoice" ? "needs_payout_invoice" : step,
        ...(step === "completed" ? { payoutConfirmed: true } : {})
      });
    }
    for (const dispute of restored.disputes) {
      if (!restoredOrderIds.has(dispute.order_id)) {
        await upsertTrade(dispute.order_id, { lastKnownStep: "disputed" });
      }
    }

    return {
      message: `Restauración completada: ${restored.persisted.orders} operación(es) y ${restored.persisted.disputes} disputa(s).`,
      ...restored.persisted,
      orderIds: restored.orders.map((order) => order.order_id)
    };
  }

  async messages(orderId: string, since = 30) {
    this.ensureConfigured();
    const beforeSync = await getTrade(orderId);
    const syncStartedAt = Date.now();
    const syncFrom = beforeSync?.lastMessageSyncAt ?? (beforeSync ? Date.parse(beforeSync.createdAt) : syncStartedAt);
    const lookback = Number.isFinite(syncFrom) ? Math.ceil((syncStartedAt - syncFrom) / 60_000) + 2 : since;
    const command = getDmCommand(Math.min(10080, Math.max(since, lookback)));
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
    const readyForInvoice = exactEvents.some((event) => event.action === "AddInvoice" && normalizeStatus(event.status) !== "settledholdinvoice");
    const readyForFiat = exactEvents.some((event) => event.action === "HoldInvoicePaymentAccepted");
    const fiatSentAccepted = hasContextualTradeEvent(events, orderId, "FiatSentOk");
    const paymentEvent = exactEvents
      .filter((event) => event.action === "PayInvoice" && event.invoice)
      .at(-1);
    const bondEvent = events
      .filter((event) => event.action === "PayBondInvoice" && event.invoice)
      .map((event) => ({ event, timestamp: cliTimestampMs(event.timestamp) }))
      .filter(({ event, timestamp }) => event.orderId === orderId || (
        trade && timestamp !== undefined && Number.isFinite(createdAt) && Math.abs(timestamp - createdAt) <= bondEventMatchWindowMs
      ))
      .sort((left, right) => Math.abs((left.timestamp ?? 0) - createdAt) - Math.abs((right.timestamp ?? 0) - createdAt))[0]?.event;
    const bondInvoice = bondEvent?.invoice ?? getCachedBondInvoice(orderId);
    const paymentInvoice = paymentEvent?.invoice ?? getCachedPaymentInvoice(orderId);
    if (paymentEvent?.invoice) {
      cachePaymentInvoice(orderId, paymentEvent.invoice);
      clearCachedBondInvoice(orderId);
    }

    let step = trade?.lastKnownStep ?? "unknown";
    if (bondEvent && !isPayoutStep(step) && !["waiting_for_lock", "ready_for_fiat", "fiat_marked_sent", "waiting_release", "completed", "canceled", "disputed"].includes(step)) {
      step = "waiting_for_bond";
    }
    if (paymentEvent && step === "waiting_for_bond") step = "waiting_for_lock";
    if (readyForInvoice && step === "waiting_for_bond") step = "needs_invoice";
    if (readyForFiat && !isPayoutStep(step) && !["fiat_marked_sent", "waiting_release", "completed", "canceled", "disputed"].includes(step)) {
      step = trade?.kind === "buy" && trade.role === "taker" ? "waiting_for_fiat" : "ready_for_fiat";
      if (trade?.kind === "buy" && trade.role === "taker") clearCachedPaymentInvoice(orderId);
    }
    if (fiatSentAccepted && !isPayoutStep(step) && !["waiting_release", "completed", "canceled", "disputed"].includes(step)) {
      step = "fiat_marked_sent";
    }
    let payout = reconcilePayout({ ...trade, lastKnownStep: step }, exactEvents);
    if (isPayoutStep(payout.lastKnownStep) || (payout.lastKnownStep === "completed" && !payout.payoutConfirmed)) {
      try {
        // Older CLIs omit the order ID on PurchaseCompleted. Verify against this order's node snapshot.
        const remote = await this.orderInfo(orderId);
        if (remote.id === orderId && remote.verification === "verified") {
          if (normalizeStatus(remote.status) === "success") {
            payout = { ...payout, lastKnownStep: "completed", payoutConfirmed: true };
          } else if (normalizeStatus(remote.status) === "settledholdinvoice" && !isPayoutStep(payout.lastKnownStep)) {
            payout = { ...payout, lastKnownStep: "waiting_for_payout" };
          }
        }
      } catch {
        // A failed lookup cannot turn a pending payout into a completed trade.
      }
    }
    // A command may have finished while the network reads above were in flight.
    const latest = await getTrade(orderId);
    if ((latest?.payoutEventAt ?? 0) > (payout.payoutEventAt ?? 0) && !payout.payoutConfirmed) {
      payout = reconcilePayout(latest ?? {}, exactEvents);
    }
    step = payout.lastKnownStep;
    if (trade) await upsertTrade(orderId, { ...payout, lastMessageSyncAt: syncStartedAt });

    return {
      ...parseTradeMessages(redactSensitive(output), orderId),
      lifecycle: {
        step,
        kind: trade?.kind,
        role: trade?.role,
        bondRequired: Boolean(bondInvoice) || trade?.lastKnownStep === "waiting_for_bond",
        bondInvoice,
        paymentInvoice,
        readyForInvoice: !isPayoutStep(step) && readyForInvoice,
        payoutSats: payout.payoutSats
      }
    };
  }

  async fiatSent(orderId: string) {
    this.ensureConfigured();
    const trade = await getTrade(orderId);
    if (trade && (isPayoutStep(trade.lastKnownStep) || ["fiat_marked_sent", "waiting_release", "completed"].includes(trade.lastKnownStep))) {
      return {
        message: "**Pago fiat ya notificado**\n\nMostro ya recibió esta confirmación. No se volvió a enviar.",
        orderId,
        alreadyConfirmed: true
      };
    }

    const capabilities = await this.machineCapabilities();
    if (capabilities && capabilities.api_version !== 1) {
      throw new AppError(
        "CLI_VERSION_UNSUPPORTED",
        `Mostrico no reconoce la API para aplicaciones v${capabilities.api_version} de mostro-cli.`
      );
    }

    if (capabilities?.features.includes("fiat-sent")) {
      const command = machineFiatSentCommand(orderId);
      const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
      const confirmation = this.requireMachineSuccess(
        parseMachineApiEnvelope(result.stdout, machineFiatSentSchema),
        "No pudimos confirmar la respuesta estructurada de mostro-cli."
      );
      if (confirmation.order_id !== orderId) {
        throw new AppError("CLI_OUTPUT_UNRECOGNIZED", "mostro-cli confirmó una operación distinta a la solicitada.");
      }
      try {
        await upsertTrade(orderId, { lastKnownStep: "fiat_marked_sent" });
      } catch {
        // Mostro already acknowledged the declaration; local persistence must not make it look retryable.
      }
      return {
        message: "**Pago fiat confirmado**\n\nMostro respondió con `FiatSentOk` para esta operación.",
        orderId,
        acknowledged: true,
        alreadyConfirmed: confirmation.already_acknowledged
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
    const trade = await getTrade(orderId);
    if (isPayoutStep(trade?.lastKnownStep) || trade?.lastKnownStep === "completed") {
      return { message: "La liberación ya fue registrada. No se volvió a enviar.", orderId };
    }
    const command = releaseOrderCommand(orderId);
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    this.ensureExitOk(result.exitCode, this.resultOutput(result));
    await upsertTrade(orderId, { lastKnownStep: "waiting_for_payout" });
    return { message: "Liberación registrada. Falta la confirmación del pago a la wallet del comprador.", orderId };
  }

  private ensureExitOk(exitCode: number, output: string) {
    if (exitCode !== 0) {
      const message = output.trim() || "mostro-cli devolvió un error.";
      throw parseCliError(message);
    }
  }

  private async machineCapabilities() {
    const command = machineCapabilitiesCommand();
    const result = await this.runner.run(command.args, { timeoutMs: command.timeoutMs });
    const envelope = parseMachineApiEnvelope(result.stdout, machineCapabilitiesSchema);
    if (!envelope) return undefined;
    if (!envelope.ok) throw this.machineApiError(envelope.error);
    return envelope.data;
  }

  private requireMachineSuccess<T>(
    envelope: MachineApiEnvelope<T> | undefined,
    invalidMessage: string
  ): T {
    if (!envelope) throw new AppError("CLI_OUTPUT_UNRECOGNIZED", invalidMessage);
    if (!envelope.ok) throw this.machineApiError(envelope.error);
    return envelope.data;
  }

  private machineApiError(error: { code: string; message: string }) {
    const codeByMachineError: Record<string, "ORDER_NOT_FOUND" | "NETWORK_ERROR" | "MOSTRO_REJECTED" | "CLI_EXIT_ERROR"> = {
      ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
      NETWORK_ERROR: "NETWORK_ERROR",
      MOSTRO_REJECTED: "MOSTRO_REJECTED",
      CLI_ERROR: "CLI_EXIT_ERROR"
    };
    const code = codeByMachineError[error.code] ?? "CLI_EXIT_ERROR";
    const messageByCode = {
      ORDER_NOT_FOUND: "No encontramos la operación en la base local de mostro-cli.",
      NETWORK_ERROR: "No recibimos respuesta de Mostro o de los relays.",
      MOSTRO_REJECTED: "Mostro rechazó la acción solicitada.",
      CLI_EXIT_ERROR: "mostro-cli no pudo completar la acción."
    };
    return new AppError(code, messageByCode[code], { reason: error.message });
  }

  private restoredStep(status: string) {
    const normalized = normalizeStatus(status);
    if (normalized === "fiatsent") return "fiat_marked_sent" as const;
    if (normalized === "settledholdinvoice" || normalized === "settled") return "waiting_for_payout" as const;
    if (normalized === "success" || normalized === "completed") return "completed" as const;
    if (["canceled", "cancelled"].includes(normalized)) return "canceled" as const;
    if (normalized?.includes("dispute")) return "disputed" as const;
    return "unknown" as const;
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
