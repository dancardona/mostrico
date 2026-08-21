"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { Button, Card, Notice, TextInput } from "@/components/ui";
import { formatFiatAmount, formatFiatRange, formatNumber, formatPercentage } from "@/lib/format";
import type { MostroOrder } from "@/lib/mostro/types";

export default function MarketPage() {
  const [currency, setCurrency] = useState("COP");
  const [orders, setOrders] = useState<MostroOrder[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/orders?currency=${encodeURIComponent(currency)}`);
    const body = await response.json();
    setLoading(false);
    if (!body.ok) {
      setError(body.error.message);
      setOrders([]);
      return;
    }
    setOrders(body.data);
  }, [currency]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Comprar Bitcoin</h1>
          <p className="mt-2 text-ink/70">Estas son ofertas de personas vendiendo sats. Mostro y el CLI siguen siendo la fuente de verdad.</p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <Link href="/orders/new" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded border border-accent/40 bg-panel px-4 py-2 font-semibold hover:border-accent">
            <Plus size={18} />
            Crear orden
          </Link>
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void load(); }}>
            <label className="min-w-28">
              <span className="mb-1 block text-sm font-medium">Moneda fiat</span>
              <TextInput value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} />
            </label>
            <Button className="mt-6 bg-accent text-paper hover:bg-accent-dark" type="submit" disabled={loading}>
              {loading ? <RefreshCw size={18} className="animate-spin" /> : <Search size={18} />}
              Buscar
            </Button>
          </form>
        </div>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {!error && !loading && orders.length === 0 && <Notice>No hay ofertas sell visibles para {currency}. Prueba de nuevo más tarde o revisa el setup.</Notice>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orders.map((order) => (
          <Card key={order.id} className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-accent">Oferta sell</p>
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
