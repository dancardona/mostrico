"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Check, FileText, RefreshCw } from "lucide-react";
import { AmountInput, Button, Card, ErrorNotice, Notice, TextArea, type ApiErrorData } from "@/components/ui";
import { formatFiatAmount, formatFiatRange, formatNumber, formatPercentage, normalizeFiatInput } from "@/lib/format";
import type { MostroOrder } from "@/lib/mostro/types";

export default function OrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;
  const [order, setOrder] = useState<MostroOrder | null>(null);
  const [fiatAmount, setFiatAmount] = useState("");
  const [invoice, setInvoice] = useState("");
  const [deferInvoice, setDeferInvoice] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<ApiErrorData | null>(null);
  const [syncNotice, setSyncNotice] = useState("");
  const [syncingIndex, setSyncingIndex] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const needsAmount = Boolean(order?.minFiatAmount && order?.maxFiatAmount && !order?.fiatAmount);
  const selectedAmount = needsAmount ? normalizeFiatInput(fiatAmount) : order?.fiatAmount;
  const amountError = useMemo(() => {
    if (!needsAmount || !fiatAmount || !order) return "";
    if (!selectedAmount) return "Escribe un monto válido. Puedes usar 100.000 o 100000.";
    const numericAmount = Number(selectedAmount);
    if (order.minFiatAmount && numericAmount < Number(order.minFiatAmount)) return "El monto está por debajo del mínimo de la oferta.";
    if (order.maxFiatAmount && numericAmount > Number(order.maxFiatAmount)) return "El monto supera el máximo de la oferta.";
    return "";
  }, [fiatAmount, needsAmount, order, selectedAmount]);
  const canSubmit = confirmed && !submitting && (!needsAmount || Boolean(selectedAmount && !amountError)) && (deferInvoice || invoice);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/orders/${orderId}`);
    const body = await response.json();
    setLoading(false);
    if (!body.ok) {
      setError(body.error);
      return;
    }
    setOrder(body.data);
    if (body.data.fiatAmount) setFiatAmount(body.data.fiatAmount);
  }, [orderId]);

  async function takeSell() {
    setSubmitting(true);
    setError(null);
    setSyncNotice("");
    const response = await fetch("/api/trades/take-sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        fiatAmount: needsAmount ? selectedAmount : undefined,
        invoice: deferInvoice ? undefined : invoice,
        confirmed: true
      })
    });
    const body = await response.json();
    setSubmitting(false);
    if (!body.ok) {
      setError(body.error);
      return;
    }
    const invoiceStatus = body.data.invoiceAdded ? "added" : "pending";
    router.push(`/trades/${orderId}?invoice=${invoiceStatus}`);
  }

  async function syncTradeIndex() {
    setSyncingIndex(true);
    setSyncNotice("");
    const response = await fetch("/api/trades/sync-index", { method: "POST" });
    const body = await response.json();
    setSyncingIndex(false);
    if (!body.ok) {
      setError(body.error);
      return;
    }
    setError(null);
    setSyncNotice(body.data.message);
  }

  useEffect(() => {
    void load();
  }, [load]);

  const rangeHelp = useMemo(() => {
    if (!order?.minFiatAmount || !order?.maxFiatAmount) return "";
    return `Entre ${formatFiatAmount(order.minFiatAmount, order.currency)} y ${formatFiatAmount(order.maxFiatAmount, order.currency)}`;
  }, [order]);

  if (loading) return <Card>Cargando oferta...</Card>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Tomar oferta</h1>
          <p className="mt-2 break-all text-ink/70">{orderId}</p>
        </div>
        <Button onClick={load} className="border border-line bg-panel hover:border-accent">
          <RefreshCw size={18} />
          Actualizar
        </Button>
      </div>

      {error && (
        <ErrorNotice error={error}>
          {error.code === "TRADE_INDEX_OUT_OF_SYNC" && (
            <Button
              className="mt-3 border border-danger/50 bg-paper text-ink hover:border-danger"
              disabled={syncingIndex}
              onClick={syncTradeIndex}
            >
              <RefreshCw size={18} className={syncingIndex ? "animate-spin" : ""} />
              {syncingIndex ? "Sincronizando..." : "Sincronizar índice"}
            </Button>
          )}
        </ErrorNotice>
      )}
      {syncNotice && <Notice tone="ok">{syncNotice}</Notice>}
      {!order && !error && <Notice>No pudimos cargar esta oferta.</Notice>}
      {order?.verification === "unverified" && (
        <Notice tone="warning">
          {order.verificationMessage} Puedes revisar los datos, pero Mostro hará la validación definitiva al confirmar.
        </Notice>
      )}

      {order && (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <h2 className="font-semibold">Detalle</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Field label="Moneda" value={order.currency} />
              <Field label="Fiat" value={order.fiatAmount ? formatFiatAmount(order.fiatAmount, order.currency) : formatFiatRange(order.minFiatAmount, order.maxFiatAmount, order.currency)} />
              <Field label="Sats" value={formatNumber(order.sats, 0)} />
              <Field label="Premium" value={formatPercentage(order.premiumPct)} />
              <Field label="Métodos" value={order.paymentMethods.join(", ")} />
              <Field label="Estado" value={order.status} />
            </dl>
          </Card>

          <Card className="space-y-7">
            <section className="border-b border-line/60 pb-7">
              <div className="mb-4 flex items-center gap-2 font-semibold"><span className="grid h-7 w-7 place-items-center rounded bg-accent text-sm text-paper">1</span> Monto</div>
              {needsAmount ? (
                <label>
                  <span className="mb-2 block text-sm leading-6 text-ink/70">{rangeHelp}</span>
                  <AmountInput allowDecimals value={fiatAmount} onValueChange={setFiatAmount} suffix={order.currency} placeholder="100.000" aria-invalid={Boolean(amountError)} />
                  {selectedAmount && !amountError && <p className="mt-2 text-sm text-accent">Monto: {formatFiatAmount(selectedAmount, order.currency)}</p>}
                  {amountError && <p className="mt-2 text-sm text-danger">{amountError}</p>}
                </label>
              ) : (
                <Notice>{formatFiatAmount(order.fiatAmount, order.currency) || "Monto fijo no disponible en la salida del CLI."}</Notice>
              )}
            </section>

            <section className="border-b border-line/60 pb-7">
              <div className="mb-4 flex items-center gap-2 font-semibold"><span className="grid h-7 w-7 place-items-center rounded bg-accent text-sm text-paper">2</span> Invoice Lightning</div>
              <p className="mb-4 text-sm leading-6 text-ink/70">Esta factura Lightning es donde recibirás los sats cuando el vendedor libere la operación.</p>
              <TextArea value={invoice} onChange={(event) => setInvoice(event.target.value)} disabled={deferInvoice} placeholder="lnbc..." />
              <label className="mt-4 flex items-center gap-3 rounded border border-line/70 bg-paper/50 p-4 text-sm leading-6">
                <input type="checkbox" checked={deferInvoice} onChange={(event) => setDeferInvoice(event.target.checked)} />
                Agregar invoice después
              </label>
            </section>

            <section>
              <div className="mb-4 flex items-center gap-2 font-semibold"><FileText size={18} /> Revisión</div>
              <div className="space-y-2 rounded border border-line bg-paper p-4 text-sm leading-6 sm:p-5">
                <p><strong>Oferta:</strong> <span className="break-all">{orderId}</span></p>
                <p><strong>Monto fiat:</strong> {selectedAmount ? formatFiatAmount(selectedAmount, order.currency) : "Pendiente"}</p>
                <p><strong>Invoice:</strong> {deferInvoice ? "Se agregará después" : invoice ? "Lista para enviar al CLI" : "Pendiente"}</p>
              </div>
              <Notice className="mt-5" tone="warning">Tomar la oferta inicia la operación, pero no envía dinero fiat.</Notice>
              <label className="mt-5 flex items-start gap-3 rounded border border-line/70 bg-paper/50 p-4 text-sm leading-6">
                <input className="mt-1.5" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                Confirmo que quiero tomar esta oferta como comprador.
              </label>
              <Button className="mt-5 w-full bg-accent text-paper hover:bg-accent-dark" disabled={!canSubmit} onClick={takeSell}>
                {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
                Tomar oferta
                <ArrowRight size={18} />
              </Button>
            </section>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-ink/50">{label}</dt>
      <dd className="mt-1 font-medium">{value || "No disponible"}</dd>
    </div>
  );
}
