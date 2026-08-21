import { MostroOrder, TradeMessage } from "./types";

const ansiPattern = /\u001b\[[0-9;]*m/g;
const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

export function stripAnsi(value: string) {
  return value.replace(ansiPattern, "");
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseNumber(value: string | undefined) {
  if (!value) return undefined;
  const cleaned = value.replace(/[,%]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseMethods(value: string | undefined) {
  if (!value) return [];
  return value.split(/[,|/]/).map((method) => method.trim()).filter(Boolean);
}

function parseUnicodeTable(text: string): MostroOrder[] | undefined {
  const rows = text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("│")) return undefined;
    const cells = trimmed.split(/[│┆]/);
    if (cells[0] === "") cells.shift();
    if (cells.at(-1) === "") cells.pop();
    return cells.map((cell) => cell.trim());
  }).filter(Boolean) as string[][];

  const headerIndex = rows.findIndex((cells) => cells.some((cell) => normalizeKey(cell) === "order_id"));
  if (headerIndex < 0) return undefined;

  const headers = rows[headerIndex].map(normalizeKey);
  const column = (name: string) => headers.indexOf(name);
  const indexes = {
    kind: column("kind"),
    id: column("order_id"),
    status: column("status"),
    sats: column("amount"),
    currency: column("fiat"),
    fiatAmount: column("fiat_amt"),
    paymentMethods: column("payment_method"),
    premium: column("premium"),
    createdAt: column("created")
  };
  if (indexes.id < 0 || indexes.fiatAmount < 0) return undefined;

  const orders: MostroOrder[] = [];
  let currentFields: Record<string, string> | undefined;

  const flush = () => {
    if (!currentFields) return;
    const order = orderFromFields(currentFields);
    if (order) orders.push(order);
    currentFields = undefined;
  };

  const valueAt = (cells: string[], index: number) => index >= 0 ? cells[index] : "";
  for (const cells of rows.slice(headerIndex + 1)) {
    const id = valueAt(cells, indexes.id).match(uuidPattern)?.[0];
    if (id) {
      flush();
      const sats = valueAt(cells, indexes.sats);
      currentFields = {
        id,
        kind: valueAt(cells, indexes.kind),
        status: valueAt(cells, indexes.status),
        currency: valueAt(cells, indexes.currency),
        amount: valueAt(cells, indexes.fiatAmount),
        payment_methods: valueAt(cells, indexes.paymentMethods),
        premium: valueAt(cells, indexes.premium),
        created_at: valueAt(cells, indexes.createdAt)
      };
      if (sats && sats.toLowerCase() !== "market") currentFields.sats = sats;
      continue;
    }

    if (currentFields) {
      const paymentMethod = valueAt(cells, indexes.paymentMethods);
      if (paymentMethod) {
        currentFields.payment_methods = `${currentFields.payment_methods} ${paymentMethod}`.trim();
      }
    }
  }
  flush();
  return orders;
}

function orderFromFields(fields: Record<string, string>): MostroOrder | undefined {
  const id = fields.order_id || fields.orderid || fields.id || Object.values(fields).find((value) => uuidPattern.test(value));
  if (!id || !uuidPattern.test(id)) return undefined;
  const range = fields.amount || fields.fiat_amount || fields.range;
  const rangeMatch = range?.match(/^([0-9.]+)\s*[-–]\s*([0-9.]+)$/);
  return {
    id: id.match(uuidPattern)?.[0] ?? id,
    kind: (fields.kind?.toLowerCase() === "buy" ? "buy" : "sell"),
    currency: (fields.currency || fields.fiat_code || "COP").toUpperCase(),
    fiatAmount: rangeMatch ? undefined : range,
    minFiatAmount: fields.min_amount || fields.min_fiat_amount || rangeMatch?.[1],
    maxFiatAmount: fields.max_amount || fields.max_fiat_amount || rangeMatch?.[2],
    sats: parseNumber(fields.sats || fields.amount_sats),
    premiumPct: parseNumber(fields.premium || fields.premium_pct),
    paymentMethods: parseMethods(fields.payment_methods || fields.payment_method || fields.methods),
    status: fields.status,
    createdAt: fields.created_at || fields.created,
    makerPubkey: fields.maker_pubkey || fields.maker,
    rawFields: fields
  };
}

function parseJsonOrders(text: string): MostroOrder[] | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    const object = parsed && typeof parsed === "object" ? parsed as { orders?: unknown } : {};
    const rows: unknown[] | undefined = Array.isArray(parsed) ? parsed : Array.isArray(object.orders) ? object.orders : undefined;
    if (!rows) return undefined;
    return rows.map((row) => orderFromFields(Object.fromEntries(
      Object.entries(row as Record<string, unknown>).map(([key, value]) => [normalizeKey(key), String(value)])
    ))).filter(Boolean) as MostroOrder[];
  } catch {
    return undefined;
  }
}

export function parseOrders(raw: string): MostroOrder[] {
  const text = stripAnsi(raw).trim();
  if (!text) return [];
  const jsonOrders = parseJsonOrders(text);
  if (jsonOrders) return jsonOrders;
  const tableOrders = parseUnicodeTable(text);
  if (tableOrders) return tableOrders;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const keyValueOrder = parseOrderDetail(text);
  if (keyValueOrder) return [keyValueOrder];

  const orders: MostroOrder[] = [];
  for (const line of lines) {
    const uuid = line.match(uuidPattern)?.[0];
    if (!uuid || /^id\b/i.test(line)) continue;
    const parts = line.split(/\s{2,}|\t+/).map((part) => part.trim()).filter(Boolean);
    const compactParts = parts.length > 1 ? parts : line.split(/\s+/);
    const fields: Record<string, string> = { id: uuid, kind: "sell" };
    const afterId = compactParts.slice(compactParts.findIndex((part) => part.includes(uuid)) + 1);
    if (afterId[0]?.toLowerCase() === "sell" || afterId[0]?.toLowerCase() === "buy") {
      fields.kind = afterId.shift() ?? "sell";
    }
    if (afterId[0]?.match(/^[A-Za-z]{3}$/)) fields.currency = afterId.shift() ?? "COP";
    const amount = afterId.find((part) => /^[0-9.]+(?:[-–][0-9.]+)?$/.test(part));
    if (amount) fields.amount = amount;
    const sats = afterId.find((part) => /^\d{4,}$/.test(part) && part !== amount);
    if (sats) fields.sats = sats;
    fields.payment_methods = afterId.filter((part) => /nequi|daviplata|bank|banco|cash|efectivo/i.test(part)).join(",");
    fields.status = afterId.find((part) => /active|pending|waiting|available|open|taken/i.test(part)) ?? "";
    const order = orderFromFields(fields);
    if (order) orders.push(order);
  }
  return orders;
}

export function parseOrderDetail(raw: string): MostroOrder | undefined {
  const text = stripAnsi(raw).trim();
  if (!text) return undefined;
  const fields: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]+):\s*(.+?)\s*$/);
    if (!match) continue;
    fields[normalizeKey(match[1])] = match[2];
  }
  return orderFromFields(fields);
}

export function parseTradeMessages(raw: string, orderId?: string): {
  messages: TradeMessage[];
  ambiguousMessages: TradeMessage[];
} {
  const text = stripAnsi(raw).trim();
  if (!text) return { messages: [], ambiguousMessages: [] };

  const all = text.split(/\r?\n/).map((line, index) => {
    const foundOrderId = line.match(uuidPattern)?.[0];
    const source = /counterparty|seller|vendedor|fromuser/i.test(line)
      ? "counterparty"
      : /mostro/i.test(line)
        ? "mostro"
        : "unknown";
    const timestamp = line.match(/\d{4}-\d{2}-\d{2}T[^\s]+/)?.[0];
    return {
      id: `${index}`,
      orderId: foundOrderId,
      timestamp,
      text: line,
      source
    } satisfies TradeMessage;
  });

  if (!orderId) return { messages: all, ambiguousMessages: [] };
  return {
    messages: all.filter((message) => message.orderId === orderId),
    ambiguousMessages: all.filter((message) => !message.orderId)
  };
}

export function commandSucceeded(raw: string) {
  const text = stripAnsi(raw).trim();
  return text || "Comando enviado a mostro-cli.";
}

export function parseNewOrderResult(raw: string) {
  const text = stripAnsi(raw);
  const labeledOrderId = text.match(/Order ID\s*:\s*([0-9a-f-]{36})/i)?.[1];
  const allOrderIds = [...text.matchAll(new RegExp(uuidPattern.source, "gi"))].map((match) => match[0]);
  const paymentInvoice = text.match(/LIGHTNING(?: BOND)? INVOICE TO PAY\s*:[\s─-]*((?:lnbc|lntb|lnbcrt)[a-z0-9]{20,})/i)?.[1];
  return {
    orderId: labeledOrderId ?? allOrderIds.at(-1),
    paymentInvoice
  };
}
