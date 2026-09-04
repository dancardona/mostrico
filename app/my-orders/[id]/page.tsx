"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Ban, CheckCircle2, RefreshCw, Send, Unlock } from "lucide-react";
import { Button, Card, ErrorNotice, Notice, type ApiErrorData } from "@/components/ui";
import { TradeChat } from "@/components/trade-chat";
import { formatFiatAmount, formatFiatRange, formatNumber, formatPercentage } from "@/lib/format";
import type { LocalTradeMetadata, LocalTradeStep, TradeLifecycleStatus, TradeMessage } from "@/lib/mostro/types";

type LocalOrder = LocalTradeMetadata & { orderId: string };

export default function MyOrderPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [lifecycleStep, setLifecycleStep] = useState<LocalTradeStep>("unknown");
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [error, setError] = useState<ApiErrorData | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState("");
  const [fiatChecked, setFiatChecked] = useState(false);
  const [releaseChecked, setReleaseChecked] = useState(false);
  const [cancelChecked, setCancelChecked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [orderResponse, messagesResponse] = await Promise.all([
      fetch(`/api/my-orders/${orderId}`),
      fetch(`/api/trades/${orderId}/messages?since=30`)
    ]);
    const orderBody = await orderResponse.json();
    const messagesBody = await messagesResponse.json();
    setLoading(false);
    if (!orderBody.ok) {
      setError(orderBody.error);
      return;
    }
    setOrder(orderBody.data);
    if (messagesBody.ok) {
      setMessages(messagesBody.data.messages);
      setLifecycleStep((messagesBody.data.lifecycle as TradeLifecycleStatus | undefined)?.step ?? "unknown");
    }
  }, [orderId]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function post(action: string, path: string, payload: unknown) {
    setActing(action);
    setError(null);
    setNotice("");
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    setActing("");
    if (!body.ok) {
      setError(body.error);
      return;
    }
    setNotice(body.data.message);
    await load();
  }

  if (loading && !order) return <Card>Cargando orden...</Card>;

  const closed = order?.lastKnownStep === "canceled" || order?.lastKnownStep === "completed";
  const effectiveStep = lifecycleStep === "unknown" ? order?.lastKnownStep : lifecycleStep;
  const fiatAlreadySent = effectiveStep ? ["fiat_marked_sent", "waiting_release", "completed"].includes(effectiveStep) : false;
  const canMarkFiatSent = effectiveStep === "ready_for_fiat";
  const fiatValue = order?.selectedFiatAmount?.includes("-")
    ? formatFiatRange(...order.selectedFiatAmount.split("-") as [string, string], order.currency)
    : formatFiatAmount(order?.selectedFiatAmount, order?.currency || "COP");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-accent">Orden propia</p>
          <h1 className="mt-1 text-3xl font-bold">{order?.kind === "sell" ? "Venta de Bitcoin" : "Compra de Bitcoin"}</h1>
          <p className="mt-2 break-all text-ink/70">{orderId}</p>
        </div>
        <Button className="border border-line bg-panel hover:border-accent" disabled={loading} onClick={load}>
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          Actualizar
        </Button>
      </div>

      {error && <ErrorNotice error={error} />}
      {notice && <Notice tone="ok">{notice}</Notice>}

      {order && (
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-5">
            <Card>
              <h2 className="font-semibold">Resumen</h2>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <Field label="Tipo" value={order.kind === "sell" ? "Vender BTC" : "Comprar BTC"} />
                <Field label="Estado local" value={statusLabel(order.lastKnownStep)} />
                <Field label="Fiat" value={fiatValue} />
                <Field label="Sats" value={order.satsAmount === "0" ? "Precio de mercado" : `${formatNumber(order.satsAmount, 0)} sats`} />
                <Field label="Premium" value={formatPercentage(order.premiumPct)} />
                <Field label="Métodos" value={order.paymentMethods?.join(", ")} />
              </dl>
            </Card>

            <Card>
              <h2 className="font-semibold">Secuencia</h2>
              <ol className="mt-4 space-y-3 text-sm">
                {(order.kind === "sell"
                  ? ["Orden publicada", "Sats bloqueados", "Fiat recibido", "Verificación bancaria", "Liberación de sats"]
                  : ["Orden publicada", "Sats asegurados", "Pago fiat", "Confirmación de pago", "Recepción de sats"]
                ).map((step, index) => (
                  <li key={step} className="flex items-center gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-raised font-semibold text-accent">{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </Card>
          </div>

          <div className="space-y-5">
            <Card>
              <h2 className="font-semibold">Mensajes recientes de Mostro</h2>
              <div className="mt-4 space-y-3">
                {messages.length === 0 && <p className="text-sm text-ink/60">Todavía no hay mensajes asociados de forma segura a esta orden.</p>}
                {messages.map((message) => (
                  <article key={message.id} className="rounded border border-line bg-paper p-3 text-sm">
                    {message.timestamp && <p className="mb-1 text-xs text-ink/45">{message.timestamp}</p>}
                    <p className="break-words">{message.text}</p>
                  </article>
                ))}
              </div>
            </Card>

            <TradeChat orderId={orderId} />

            {!closed && order.kind === "buy" && fiatAlreadySent && (
              <Notice tone="ok">
                <span className="flex items-center gap-2 font-semibold"><CheckCircle2 size={18} /> Pago fiat ya notificado</span>
                <p className="mt-2 text-sm">Mostro recibió la confirmación. Ahora corresponde esperar la liberación de los sats.</p>
              </Notice>
            )}

            {!closed && order.kind === "buy" && !fiatAlreadySent && (
              <Card className="space-y-5">
                <h2 className="flex items-center gap-2 font-semibold"><Send size={18} /> Confirmar pago fiat</h2>
                <p className="text-sm text-ink/70">Esta acción solo notifica a Mostro. Debes haber realizado la transferencia fuera de la aplicación.</p>
                {!canMarkFiatSent && (
                  <Notice tone="warning">Espera a que Mostro confirme que los sats están asegurados antes de transferir y notificar el pago fiat.</Notice>
                )}
                <label className="flex items-start gap-3 rounded border border-line/70 bg-paper/50 p-4 text-sm leading-6">
                  <input className="mt-1.5" type="checkbox" disabled={!canMarkFiatSent} checked={fiatChecked} onChange={(event) => setFiatChecked(event.target.checked)} />
                  Confirmo que ya envié el pago fiat.
                </label>
                <Button className="bg-accent text-paper hover:bg-accent-dark" disabled={!fiatChecked || !canMarkFiatSent || Boolean(acting)} onClick={() => post("fiat", `/api/trades/${orderId}/fiat-sent`, { confirmedActualFiatTransfer: true })}>
                  {acting === "fiat" ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  Marcar fiat como enviado
                </Button>
              </Card>
            )}

            {!closed && order.kind === "sell" && (
              <Card className="space-y-5 border-bitcoin/30">
                <h2 className="flex items-center gap-2 font-semibold"><Unlock size={18} /> Liberar sats</h2>
                <p className="text-sm text-ink/70">Libera únicamente después de comprobar en tu cuenta que el fiat fue recibido de forma irreversible.</p>
                <label className="flex items-start gap-3 rounded border border-bitcoin/25 bg-paper/50 p-4 text-sm leading-6">
                  <input className="mt-1.5" type="checkbox" checked={releaseChecked} onChange={(event) => setReleaseChecked(event.target.checked)} />
                  Confirmo que recibí y verifiqué el pago fiat.
                </label>
                <Button className="bg-bitcoin text-paper hover:bg-[#d87d13]" disabled={!releaseChecked || Boolean(acting)} onClick={() => post("release", `/api/my-orders/${orderId}/release`, { confirmedFiatReceived: true })}>
                  {acting === "release" ? <RefreshCw size={18} className="animate-spin" /> : <Unlock size={18} />}
                  Liberar sats
                </Button>
              </Card>
            )}

            {!closed && (
              <Card className="space-y-5 border-danger/30">
                <h2 className="flex items-center gap-2 font-semibold text-danger"><Ban size={18} /> Cancelar orden pendiente</h2>
                <p className="text-sm text-ink/70">Mostro solo permite cancelar mientras la orden continúa pendiente y no tiene contraparte activa.</p>
                <label className="flex items-start gap-3 rounded border border-danger/25 bg-paper/50 p-4 text-sm leading-6">
                  <input className="mt-1.5" type="checkbox" checked={cancelChecked} onChange={(event) => setCancelChecked(event.target.checked)} />
                  Confirmo que quiero cancelar esta orden.
                </label>
                <Button className="bg-danger text-white hover:bg-[#b5413d]" disabled={!cancelChecked || Boolean(acting)} onClick={() => post("cancel", `/api/my-orders/${orderId}/cancel`, { confirmed: true })}>
                  {acting === "cancel" ? <RefreshCw size={18} className="animate-spin" /> : <Ban size={18} />}
                  Cancelar orden
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function statusLabel(status: LocalTradeMetadata["lastKnownStep"]) {
  const labels: Record<LocalTradeMetadata["lastKnownStep"], string> = {
    maker_pending: "Pendiente",
    taken: "Tomada",
    waiting_for_bond: "Esperando garantía",
    needs_invoice: "Requiere invoice",
    waiting_for_lock: "Esperando bloqueo",
    waiting_for_fiat: "Esperando pago fiat",
    ready_for_fiat: "Lista para pago fiat",
    fiat_marked_sent: "Fiat marcado como enviado",
    waiting_release: "Esperando liberación",
    completed: "Completada",
    canceled: "Cancelada",
    disputed: "En disputa",
    unknown: "Sin confirmar"
  };
  return labels[status];
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-ink/50">{label}</dt>
      <dd className="mt-1 font-medium">{value || "No disponible"}</dd>
    </div>
  );
}
