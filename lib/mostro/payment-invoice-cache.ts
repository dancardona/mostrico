const invoiceTtlMs = 20 * 60_000;

type InvoiceEntry = {
  invoice: string;
  cachedAt: number;
};

const cacheScope = globalThis as typeof globalThis & {
  __mostricoPaymentInvoiceCache?: Map<string, InvoiceEntry>;
};

const paymentInvoiceCache = cacheScope.__mostricoPaymentInvoiceCache ?? new Map<string, InvoiceEntry>();
cacheScope.__mostricoPaymentInvoiceCache = paymentInvoiceCache;

export function cachePaymentInvoice(orderId: string, invoice: string) {
  paymentInvoiceCache.set(orderId, { invoice, cachedAt: Date.now() });
}

export function getCachedPaymentInvoice(orderId: string) {
  const entry = paymentInvoiceCache.get(orderId);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > invoiceTtlMs) {
    paymentInvoiceCache.delete(orderId);
    return undefined;
  }
  return entry.invoice;
}

export function clearCachedPaymentInvoice(orderId: string) {
  paymentInvoiceCache.delete(orderId);
}
