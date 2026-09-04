import {
  addInvoiceInputSchema,
  amountSchema,
  newOrderInputSchema,
  nostrPubkeySchema,
  ratingSchema,
  chatMessageSchema,
  chatSinceSchema,
  listOrdersInputSchema,
  sinceSchema,
  takeBuyInputSchema,
  takeSellInputSchema,
  uuidSchema
} from "./schemas";
import type { NewOrderInput } from "./schemas";

export interface CommandSpec {
  action: string;
  args: readonly string[];
  timeoutMs?: number;
  mutating: boolean;
}

export function listOrdersCommand(input: { currency?: string; kind?: "buy" | "sell" } = {}): CommandSpec {
  const parsed = listOrdersInputSchema.parse(input);
  return {
    action: "listorders",
    args: ["listorders", "-k", parsed.kind, "-c", parsed.currency.toLowerCase()],
    timeoutMs: 45_000,
    mutating: false
  };
}

export function takeBuyCommand(input: {
  orderId: string;
  fiatAmount?: string;
  confirmed: true;
}): CommandSpec {
  const parsed = takeBuyInputSchema.parse(input);
  const args = ["takebuy", "-o", parsed.orderId];
  if (parsed.fiatAmount) args.push("-a", amountSchema.parse(parsed.fiatAmount));
  return { action: "takebuy", args, timeoutMs: 45_000, mutating: true };
}

export function orderInfoCommand(orderId: string): CommandSpec {
  const id = uuidSchema.parse(orderId);
  return {
    action: "ordersinfo",
    args: ["ordersinfo", "-o", id],
    timeoutMs: 45_000,
    mutating: false
  };
}

export function newOrderCommand(input: NewOrderInput): CommandSpec {
  const parsed = newOrderInputSchema.parse(input);
  const args = [
    "neworder",
    "-k", parsed.kind,
    "-c", parsed.currency.toLowerCase(),
    "-f", parsed.fiatAmount,
    "-m", parsed.paymentMethods.join(","),
    "-a", parsed.satsAmount,
    "-p", String(parsed.premium),
    "-e", String(parsed.expirationDays)
  ];
  if (parsed.invoice) args.push("-i", parsed.invoice);
  return { action: "neworder", args, timeoutMs: 60_000, mutating: true };
}

export function takeSellCommand(input: {
  orderId: string;
  fiatAmount?: string;
  confirmed: true;
}): CommandSpec {
  const parsed = takeSellInputSchema.omit({ invoice: true }).parse(input);
  const args = ["takesell", "-o", parsed.orderId];
  if (parsed.fiatAmount) args.push("-a", amountSchema.parse(parsed.fiatAmount));
  return { action: "takesell", args, timeoutMs: 45_000, mutating: true };
}

export function addInvoiceCommand(input: { orderId: string; invoice: string }): CommandSpec {
  const parsed = addInvoiceInputSchema.parse(input);
  return {
    action: "addinvoice",
    args: ["addinvoice", "-o", parsed.orderId, "-i", parsed.invoice],
    timeoutMs: 45_000,
    mutating: true
  };
}

export function getDmCommand(sinceMinutes: number): CommandSpec {
  const since = String(sinceSchema.parse(sinceMinutes));
  return {
    action: "getdm",
    args: ["getdm", "--since", since],
    timeoutMs: 45_000,
    mutating: false
  };
}

export function getDmUserCommand(input: {
  orderId: string;
  pubkey: string;
  since: number;
}): CommandSpec {
  const orderId = uuidSchema.parse(input.orderId);
  const pubkey = nostrPubkeySchema.parse(input.pubkey);
  const since = String(chatSinceSchema.parse(input.since));
  return {
    action: "getdmuser",
    args: ["getdmuser", "-p", pubkey, "-o", orderId, "--since", since],
    timeoutMs: 45_000,
    mutating: false
  };
}

export function sendDmCommand(input: {
  orderId: string;
  pubkey: string;
  message: string;
}): CommandSpec {
  const orderId = uuidSchema.parse(input.orderId);
  const pubkey = nostrPubkeySchema.parse(input.pubkey);
  const message = chatMessageSchema.parse(input.message);
  return {
    action: "senddm",
    args: ["senddm", "-p", pubkey, "-o", orderId, "-m", message],
    timeoutMs: 45_000,
    mutating: true
  };
}

export function syncTradeIndexCommand(): CommandSpec {
  return {
    action: "getlasttradeindex",
    args: ["getlasttradeindex"],
    timeoutMs: 45_000,
    mutating: true
  };
}

export function fiatSentCommand(orderId: string): CommandSpec {
  const id = uuidSchema.parse(orderId);
  return { action: "fiatsent", args: ["fiatsent", "-o", id], timeoutMs: 45_000, mutating: true };
}

export function rateCommand(orderId: string, rating: number): CommandSpec {
  const id = uuidSchema.parse(orderId);
  const rate = String(ratingSchema.parse(rating));
  return { action: "rate", args: ["rate", "-o", id, "-r", rate], timeoutMs: 45_000, mutating: true };
}

export function disputeCommand(orderId: string): CommandSpec {
  const id = uuidSchema.parse(orderId);
  return { action: "dispute", args: ["dispute", "-o", id], timeoutMs: 45_000, mutating: true };
}

export function cancelOrderCommand(orderId: string): CommandSpec {
  const id = uuidSchema.parse(orderId);
  return { action: "cancel", args: ["cancel", "-o", id], timeoutMs: 45_000, mutating: true };
}

export function releaseOrderCommand(orderId: string): CommandSpec {
  const id = uuidSchema.parse(orderId);
  return { action: "release", args: ["release", "-o", id], timeoutMs: 45_000, mutating: true };
}
