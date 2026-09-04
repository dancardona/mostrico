"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Button, Card, Notice } from "@/components/ui";
import { formatFiatAmount, formatFiatRange, formatNumber, formatPercentage } from "@/lib/format";
import type { MostroOrder, OrderKind } from "@/lib/mostro/types";

type MarketIntent = "buy" | "sell";

const tabs: Array<{ id: MarketIntent; label: string; orderKind: OrderKind }> = [
  { id: "buy", label: "Comprar", orderKind: "sell" },
  { id: "sell", label: "Vender", orderKind: "buy" }
];

export default function MarketPage() {
  const [intent, setIntent] = useState<MarketIntent>("buy");
  const [orders, setOrders] = useState<MostroOrder[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const activeRequest = useRef<AbortController | null>(null);
  const orderKind = tabs.find((tab) => tab.id === intent)?.orderKind ?? "sell";

  const load = useCallback(async (replaceActive = false) => {
    if (activeRequest.current && !replaceActive) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    if (replaceActive) setOrders([]);

    try {
      const response = await fetch(`/api/orders?currency=COP&kind=${orderKind}`, {
        cache: "no-store",
        signal: controller.signal
      });
      const body = await response.json();
      if (!body.ok) {
        setError(body.error.message);
        setOrders([]);
        return;
      }
      setOrders(body.data);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setError("No pudimos actualizar las ofertas. Revisa la conexión e inténtalo de nuevo.");
      setOrders([]);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, [orderKind]);

  useEffect(() => {
    void load(true);
    const interval = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const emptyLabel = intent === "buy" ? "venta" : "compra";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mercado Bitcoin</h1>
          <p className="mt-2 text-ink/70">
            {intent === "buy"
              ? "Explora personas que venden sats en Colombia."
              : "Explora personas que compran sats en Colombia."}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link href="/orders/new" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded border border-accent/40 bg-panel px-4 py-2 font-semibold hover:border-accent">
            <Plus size={18} />
            Crear orden
          </Link>
          <Button className="border border-line bg-panel hover:border-accent" type="button" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            Refrescar
          </Button>
        </div>
      </div>

      <div className="inline-grid w-full grid-cols-2 rounded border border-line bg-panel p-1 sm:w-80" role="tablist" aria-label="Tipo de operación">
        {tabs.map((tab) => {
          const active = intent === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="market-orders"
              id={`market-tab-${tab.id}`}
              className={`focus-ring min-h-11 rounded px-4 py-2 font-semibold transition-colors ${active ? "bg-accent text-paper" : "text-ink/65 hover:bg-raised hover:text-ink"}`}
              onClick={() => setIntent(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {!error && !loading && orders.length === 0 && (
        <Notice>No hay ofertas de {emptyLabel} disponibles en COP. Prueba de nuevo más tarde.</Notice>
      )}

      <div
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        role="tabpanel"
        id="market-orders"
        aria-labelledby={`market-tab-${intent}`}
      >
        {loading && orders.length === 0 && <Card className="md:col-span-2 xl:col-span-3">Actualizando ofertas...</Card>}
        {orders.map((order) => (
          <Card key={order.id} className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-accent">Oferta de {order.kind === "sell" ? "venta" : "compra"}</p>
                <h2 className="mt-1 break-all font-semibold">{order.id}</h2>
              </div>
              {order.status && <span className="rounded border border-accent/20 bg-[#253326] px-2 py-1 text-xs font-medium text-[#b8e86c]">{order.status}</span>}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Fiat" value={order.fiatAmount ? formatFiatAmount(order.fiatAmount, order.currency) : range(order)} />
              <Field label="Sats" value={formatNumber(order.sats, 0)} />
              <Field label="Premium" value={formatPercentage(order.premiumPct)} />
              <Field label="Métodos" value={order.paymentMethods.join(", ")} />
            </dl>
            <Link href={`/orders/${order.id}`} className="focus-ring mt-auto inline-flex min-h-11 items-center justify-center rounded bg-accent px-4 py-2 font-semibold text-paper hover:bg-accent-dark">
              Ver oferta
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}

function range(order: MostroOrder) {
  return formatFiatRange(order.minFiatAmount, order.maxFiatAmount, order.currency);
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-ink/50">{label}</dt>
      <dd className="mt-1 font-medium">{value || "No disponible"}</dd>
    </div>
  );
}
