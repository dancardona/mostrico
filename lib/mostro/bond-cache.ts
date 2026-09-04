const bondTtlMs = 20 * 60_000;

type BondEntry = {
  invoice: string;
  cachedAt: number;
};

const cacheScope = globalThis as typeof globalThis & {
  __mostricoBondCache?: Map<string, BondEntry>;
};

const bondCache = cacheScope.__mostricoBondCache ?? new Map<string, BondEntry>();
cacheScope.__mostricoBondCache = bondCache;

export function cacheBondInvoice(orderId: string, invoice: string) {
  bondCache.set(orderId, { invoice, cachedAt: Date.now() });
}

export function getCachedBondInvoice(orderId: string) {
  const entry = bondCache.get(orderId);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > bondTtlMs) {
    bondCache.delete(orderId);
    return undefined;
  }
  return entry.invoice;
}

export function clearCachedBondInvoice(orderId: string) {
  bondCache.delete(orderId);
}
