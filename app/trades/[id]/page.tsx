"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, RefreshCw, Star, Zap } from "lucide-react";
import { Button, Card, ErrorNotice, Notice, TextArea, type ApiErrorData } from "@/components/ui";
import type { TradeMessage } from "@/lib/mostro/types";

export default function TradePage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [ambiguousMessages, setAmbiguousMessages] = useState<TradeMessage[]>([]);
  const [invoice, setInvoice] = useState("");
  const [invoiceState, setInvoiceState] = useState<"unknown" | "pending" | "added">("unknown");
  const [fiatChecked, setFiatChecked] = useState(false);
  const [disputeChecked, setDisputeChecked] = useState(false);
  const [rating, setRating] = useState(5);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<ApiErrorData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/trades/${orderId}/messages?since=30`);
    const body = await response.json();
    setLoading(false);
    if (!body.ok) {
      setError(body.error);
      return;
    }
    setMessages(body.data.messages);
    setAmbiguousMessages(body.data.ambiguousMessages);
  }, [orderId]);

  async function post(path: string, payload: unknown) {
    setError(null);
    setNotice("");
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (!body.ok) {
      setError(body.error);
      return false;
    }
    setNotice(body.data.message || "Acción enviada.");
    await load();
    return true;
  }

  async function addInvoice() {
    const added = await post("/api/trades/add-invoice", { orderId, invoice });
    if (added) {
      setInvoice("");
      setInvoiceState("added");
    }
  }

  useEffect(() => {
    const invoiceStatus = new URLSearchParams(window.location.search).get("invoice");
    if (invoiceStatus === "pending") {
      setInvoiceState("pending");
      setNotice("La oferta ya fue tomada. Agrega una invoice Lightning para continuar; no vuelvas a tomar la oferta.");
    } else if (invoiceStatus === "added") {
      setInvoiceState("added");
      setNotice("La invoice Lightning ya fue agregada. Espera la confirmación de Mostro antes de enviar fiat.");
    }
    void load();
    const interval = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Operación</h1>
          <p className="mt-2 break-all text-ink/70">{orderId}</p>
        </div>
        <Button onClick={load} className="border border-line bg-panel hover:border-accent" disabled={loading}>
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          Actualizar mensajes
        </Button>
      </div>

      {error && <ErrorNotice error={error} />}
      {notice && <Notice tone="ok">{notice}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <h2 className="font-semibold">Línea de tiempo</h2>
          <ol className="mt-4 space-y-4 text-sm">
            {["Oferta tomada", "Invoice Lightning agregada", "Operación lista / sats asegurados", "Pago fiat", "Esperando liberación", "Operación completada"].map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-raised font-semibold text-accent">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Notice className="mt-5" tone="warning">
            Revisa los mensajes de Mostro antes de transferir fiat. Esta app no ejecuta ni automatiza pagos bancarios.
          </Notice>
        </Card>

        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold">Mensajes recientes de Mostro</h2>
            <div className="mt-4 space-y-3">
              {messages.length === 0 && <p className="text-sm text-ink/60">No hay mensajes asociados de forma segura a esta operación.</p>}
              {messages.map((message) => (
                <article key={message.id} className="rounded border border-line bg-paper p-3 text-sm">
                  <div className="mb-1 flex flex-wrap gap-2 text-xs text-ink/50">
                    <span>{message.source}</span>
                    {message.timestamp && <span>{message.timestamp}</span>}
                  </div>
                  <p className="break-words">{message.text}</p>
                </article>
              ))}
            </div>
            {ambiguousMessages.length > 0 && (
              <Notice className="mt-4" tone="warning">
                Hay mensajes sin asociación confiable a esta operación. No se muestran como instrucciones de pago.
              </Notice>
            )}
          </Card>

          {invoiceState === "added" ? (
            <Notice tone="ok">
              <span className="flex items-center gap-2 font-semibold"><Zap size={18} /> Invoice Lightning agregada</span>
            </Notice>
          ) : (
            <Card className="space-y-5">
              <h2 className="flex items-center gap-2 font-semibold"><Zap size={18} /> Agregar invoice</h2>
              <TextArea value={invoice} onChange={(event) => setInvoice(event.target.value)} placeholder="lnbc..." />
              <Button className="bg-accent text-paper hover:bg-accent-dark" disabled={!invoice} onClick={addInvoice}>
                Agregar invoice
              </Button>
            </Card>
          )}

          <Card className="space-y-5">
            <h2 className="flex items-center gap-2 font-semibold"><CheckCircle2 size={18} /> ¿Ya hiciste la transferencia?</h2>
            <p className="text-sm text-ink/70">
              Este botón no envía dinero. Solo notifica a Mostro que ya pagaste al vendedor. Úsalo únicamente después de confirmar el método acordado y completar la transferencia fuera de esta aplicación.
            </p>
            <label className="flex items-start gap-3 rounded border border-line/70 bg-paper/50 p-4 text-sm leading-6">
              <input className="mt-1.5" type="checkbox" checked={fiatChecked} onChange={(event) => setFiatChecked(event.target.checked)} />
              Confirmo que ya envié el pago fiat.
            </label>
            <Button className="bg-accent text-paper hover:bg-accent-dark" disabled={!fiatChecked} onClick={() => post(`/api/trades/${orderId}/fiat-sent`, { confirmedActualFiatTransfer: true })}>
              Marcar fiat como enviado
            </Button>
          </Card>

          <Card className="space-y-5">
            <h2 className="flex items-center gap-2 font-semibold"><Star size={18} /> Calificar vendedor</h2>
            <select className="focus-ring min-h-11 w-full rounded border border-line bg-paper px-3" value={rating} onChange={(event) => setRating(Number(event.target.value))}>
              {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} estrellas</option>)}
            </select>
            <Button className="bg-accent text-paper hover:bg-accent-dark" onClick={() => post(`/api/trades/${orderId}/rate`, { rating })}>
              Enviar calificación
            </Button>
          </Card>

          <Card className="space-y-5 border-danger/30">
            <h2 className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle size={18} /> Abrir disputa</h2>
            <p className="text-sm text-ink/70">Una disputa puede requerir que un solver revise el caso. Úsala solo si no puedes resolver la operación normalmente.</p>
            <label className="flex items-start gap-3 rounded border border-danger/25 bg-paper/50 p-4 text-sm leading-6">
              <input className="mt-1.5" type="checkbox" checked={disputeChecked} onChange={(event) => setDisputeChecked(event.target.checked)} />
              Confirmo que quiero abrir disputa.
            </label>
            <Button className="bg-danger text-white hover:bg-[#8f1d14]" disabled={!disputeChecked} onClick={() => post(`/api/trades/${orderId}/dispute`, { confirmed: true })}>
              Abrir disputa
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
