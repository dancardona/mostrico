import { normalizeFiatInput } from "@/lib/format";
import type { MostroOrder } from "@/lib/mostro/types";

export type MarketIntent = "buy" | "sell";
export type MarketSort = "premium" | "amount" | "newest" | "oldest";

const paymentMethods = [
  { label: "Nequi", pattern: /\bnequi\b/i },
  { label: "Bancolombia", pattern: /\bbancolombia\b/i },
  { label: "Daviplata", pattern: /\bdaviplata\b/i },
  { label: "Llaves BRE-B", pattern: /\bllaves\b|\bbre[\s-]?b\b/i },
  { label: "PSE", pattern: /\bpse\b/i },
  { label: "Transferencia bancaria", pattern: /\btransferencia bancaria\b/i },
  { label: "Efectivo", pattern: /\befectivo\b/i }
];

export function marketPaymentMethods(order: MostroOrder) {
  const labels = order.paymentMethods.flatMap((text) => {
    const matched = paymentMethods.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
    return matched.length ? matched : [text.trim().length <= 28 && text.trim() ? text.trim() : "Otros"];
  });
  return labels.length ? [...new Set(labels)] : ["Otros"];
}

function positiveAmount(value?: string) {
  if (!value?.trim()) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

export function fiatBounds(order: MostroOrder) {
  const fixed = positiveAmount(order.fiatAmount);
  return { min: fixed ?? positiveAmount(order.minFiatAmount), max: fixed ?? positiveAmount(order.maxFiatAmount) };
}

function parseOfferDate(value?: string) {
  if (!value?.trim()) return undefined;
  value = value.trim();
  const utc = /^\d{4}-\d\d-\d\d \d\d:\d\d(?::\d\d)?$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const parsed = Date.parse(utc);
  return Number.isFinite(parsed) ? new Date(parsed) : undefined;
}

export function marketOfferDate(order: MostroOrder) {
  // listedAt is our cache timestamp, not the publication time reported by Mostro.
  const date = parseOfferDate(order.createdAt);
  if (!date) return undefined;
  const label = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).format(date);
  return { dateTime: date.toISOString(), label, title: `Publicada: ${label} (hora de Colombia, UTC-5)` };
}

function createdTime(order: MostroOrder) {
  return parseOfferDate(order.createdAt ?? order.listedAt)?.getTime() ?? 0;
}

export function selectMarketOrders(orders: MostroOrder[], filters: {
  intent: MarketIntent;
  amount: string;
  method: string;
  sort: MarketSort;
  savedOnly: boolean;
  savedIds: string[];
}) {
  const normalized = normalizeFiatInput(filters.amount);
  const amount = normalized === undefined ? undefined : Number(normalized);
  return orders.filter((order) => {
    if (order.kind !== (filters.intent === "buy" ? "sell" : "buy") || order.currency !== "COP") return false;
    if (filters.savedOnly && !filters.savedIds.includes(order.id)) return false;
    if (filters.method && !marketPaymentMethods(order).includes(filters.method)) return false;
    if (filters.amount) {
      const { min, max } = fiatBounds(order);
      if (amount === undefined || !Number.isFinite(amount) || amount <= 0 || min === undefined || max === undefined || amount < min || amount > max) return false;
    }
    return true;
  }).sort((left, right) => {
    if (filters.sort === "newest" || filters.sort === "oldest") {
      const leftTime = parseOfferDate(left.createdAt)?.getTime();
      const rightTime = parseOfferDate(right.createdAt)?.getTime();
      if (leftTime === undefined || rightTime === undefined) {
        return leftTime !== undefined ? -1 : rightTime !== undefined ? 1 : left.id.localeCompare(right.id);
      }
      const direction = filters.sort === "oldest" ? 1 : -1;
      return direction * (leftTime - rightTime) || left.id.localeCompare(right.id);
    }
    const leftValue = filters.sort === "amount" ? fiatBounds(left).min : left.premiumPct;
    const rightValue = filters.sort === "amount" ? fiatBounds(right).min : right.premiumPct;
    const leftKnown = leftValue !== undefined && Number.isFinite(leftValue);
    const rightKnown = rightValue !== undefined && Number.isFinite(rightValue);
    if (!leftKnown || !rightKnown) return leftKnown ? -1 : rightKnown ? 1 : left.id.localeCompare(right.id);
    const direction = filters.sort === "premium" && filters.intent === "sell" ? -1 : 1;
    return direction * (leftValue! - rightValue!) || createdTime(right) - createdTime(left) || left.id.localeCompare(right.id);
  });
}
