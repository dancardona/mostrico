import type { MostroOrder } from "./types";

const cacheTtlMs = 5 * 60_000;

type CacheEntry = {
  order: MostroOrder;
  cachedAt: number;
};

const cacheScope = globalThis as typeof globalThis & {
  __mostricoOrderCache?: Map<string, CacheEntry>;
};

const orderCache = cacheScope.__mostricoOrderCache ?? new Map<string, CacheEntry>();
cacheScope.__mostricoOrderCache = orderCache;

export function cacheOrders(orders: MostroOrder[]) {
  const cachedAt = Date.now();
  const listedAt = new Date(cachedAt).toISOString();
  for (const order of orders) {
    orderCache.set(order.id, {
      order: { ...order, listedAt },
      cachedAt
    });
  }
}

export function getCachedOrder(orderId: string) {
  const entry = orderCache.get(orderId);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > cacheTtlMs) {
    orderCache.delete(orderId);
    return undefined;
  }
  return entry.order;
}

export function clearOrderCache() {
  orderCache.clear();
}
