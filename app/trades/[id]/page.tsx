"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, RefreshCw, ShieldCheck, Star, Zap } from "lucide-react";
import { Button, Card, ErrorNotice, MarkdownText, Notice, TextArea, type ApiErrorData } from "@/components/ui";
import { TradeChat } from "@/components/trade-chat";
import type { TradeLifecycleStatus, TradeMessage } from "@/lib/mostro/types";

type BondState = "none" | "payment_required" | "acknowledged" | "accepted";

export default function TradePage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [ambiguousMessages, setAmbiguousMessages] = useState<TradeMessage[]>([]);
  const [invoice, setInvoice] = useState("");
  const [invoiceState, setInvoiceState] = useState<"unknown" | "pending" | "added">("unknown");
  const [bondInvoice, setBondInvoice] = useState("");
  const [bondState, setBondState] = useState<BondState>("none");
  const [bondCopied, setBondCopied] = useState(false);
  const [fiatChecked, setFiatChecked] = useState(false);
  const [disputeChecked, setDisputeChecked] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<ApiErrorData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (options: { preserveError?: boolean } = {}) => {
    setLoading(true);
    if (!options.preserveError) setError(null);
    const response = await fetch(`/api/trades/${orderId}/messages?since=30`);
    const body = await response.json();
    setLoading(false);
    if (!body.ok) {
      setError(body.error);
      return false;
    }
    setMessages(body.data.messages);
    setAmbiguousMessages(body.data.ambiguousMessages);
    const lifecycle = body.data.lifecycle as TradeLifecycleStatus | undefined;
    if (lifecycle?.bondInvoice) {
      setBondInvoice(lifecycle.bondInvoice);
    }
    if (lifecycle?.step === "waiting_for_bond") {
      setBondState((current) => current === "acknowledged" ? current : "payment_required");
    } else if (lifecycle?.bondRequired && lifecycle.readyForInvoice) {
      setBondState("accepted");
    }
    if (["waiting_for_lock", "ready_for_fiat", "fiat_marked_sent", "waiting_release", "completed"].includes(lifecycle?.step ?? "")) {
      setBondState((current) => current === "none" ? "none" : "accepted");
      setInvoiceState("added");
    }
    return true;
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
      if (body.error?.code === "ACTION_NOT_ALLOWED") {
        await load({ preserveError: true });
      }
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
      setBondState((current) => current === "none" ? "none" : "accepted");
    }
  }

  async function copyBondInvoice() {
    if (!bondInvoice) return;
    await navigator.clipboard.writeText(bondInvoice);
    setBondCopied(true);
  }

  useEffect(() => {
    const invoiceStatus = new URLSearchParams(window.location.search).get("invoice");
    const bondStatus = new URLSearchParams(window.location.search).get("bond");
    if (bondStatus === "pending") {
      setBondState("payment_required");
      setNotice("Mostro requiere una garantía anti-abuso antes de avisar al vendedor.");
    }
    if (invoiceStatus === "pending") {
      setInvoiceState("pending");
      if (bondStatus !== "pending") {
        setNotice("La oferta ya fue tomada. Agrega una invoice Lightning para continuar; no vuelvas a tomar la oferta.");
      }
    } else if (invoiceStatus === "added") {
      setInvoiceState("added");
      setNotice("La invoice Lightning ya fue agregada. Espera la confirmación de Mostro antes de enviar fiat.");
    }
    void load();
    const interval = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [load, orderId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Operación</h1>
          <p className="mt-2 break-all text-ink/70">{orderId}</p>
        </div>
        <Button onClick={() => void load()} className="border border-line bg-panel hover:border-accent" disabled={loading}>
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          Actualizar mensajes
        </Button>
      </div>

      {error && (
        <ErrorNotice error={error}>
          {error.code === "ACTION_NOT_ALLOWED" && (
            <div className="mt-4">
              <Button onClick={() => void load()} className="border border-danger/40 bg-paper text-ink hover:border-danger" disabled={loading}>
                <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                Actualizar estado
              </Button>
            </div>
          )}
        </ErrorNotice>
      )}
      {notice && <Notice tone="ok"><MarkdownText>{notice}</MarkdownText></Notice>}

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <h2 className="font-semibold">Línea de tiempo</h2>
          <ol className="mt-4 space-y-4 text-sm">
            {["Oferta tomada", "Garantía anti-abuso (si aplica)", "Invoice Lightning agregada", "Sats asegurados", "Pago fiat", "Liberación y cierre"].map((step, index) => (
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
          {bondInvoice && bondState !== "accepted" && (
            <Card className="space-y-5 border-bitcoin/50">
              <div>
                <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} /> Garantía anti-abuso</h2>
                <p className="mt-2 text-sm leading-6 text-ink/70">
                  Mostro exige esta hold invoice antes de avisar al vendedor. No es una comisión: los sats quedan bloqueados y normalmente se liberan al finalizar la operación.
                </p>
              </div>
              <TextArea readOnly value={bondInvoice} aria-label="Invoice de garantía anti-abuso" />
              <div className="flex flex-wrap gap-3">
                <Button className="border border-bitcoin/50 bg-paper hover:border-bitcoin" onClick={copyBondInvoice}>
                  {bondCopied ? <Check size={18} /> : <Copy size={18} />}
                  {bondCopied ? "Invoice copiada" : "Copiar invoice"}
                </Button>
                <a
                  className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded bg-bitcoin px-4 py-2 font-semibold text-[#211b16] hover:bg-[#ffad3d]"
                  href={`lightning:${bondInvoice}`}
                >
                  <Zap size={18} />
                  Abrir wallet
                  <ExternalLink size={16} />
                </a>
              </div>
              <Notice tone="warning">
                Tu wallet puede mostrar el pago como pendiente o retenido. Eso es normal para una hold invoice.
              </Notice>
              <label className="flex items-start gap-3 rounded border border-line/70 bg-paper/50 p-4 text-sm leading-6">
                <input
                  className="mt-1.5"
                  type="checkbox"
                  checked={bondState === "acknowledged"}
                  onChange={(event) => setBondState(event.target.checked ? "acknowledged" : "payment_required")}
                />
                Confirmo que pagué o inicié el pago de la garantía en mi wallet.
              </label>
            </Card>
          )}

          {bondState === "accepted" && (
            <Notice tone="ok">
              <span className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} /> Garantía aceptada por Mostro</span>
            </Notice>
          )}

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

          <TradeChat orderId={orderId} />

          {invoiceState === "added" ? (
            <Notice tone="ok">
              <span className="flex items-center gap-2 font-semibold"><Zap size={18} /> Invoice Lightning agregada</span>
            </Notice>
          ) : bondState === "payment_required" ? (
            <Notice>
              Paga primero la garantía. Después podrás agregar la invoice donde recibirás los sats.
            </Notice>
          ) : (
            <Card className="space-y-5">
              <h2 className="flex items-center gap-2 font-semibold"><Zap size={18} /> Agregar invoice</h2>
              {bondState === "acknowledged" && (
                <p className="text-sm leading-6 text-ink/70">Vuelve a pegar la invoice donde recibirás los sats. Mostro validará que la garantía ya esté retenida al enviarla.</p>
              )}
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
              <input className="mt-1.5" type="checkbox" disabled={invoiceState !== "added"} checked={fiatChecked} onChange={(event) => setFiatChecked(event.target.checked)} />
              Confirmo que ya envié el pago fiat.
            </label>
            <Button className="bg-accent text-paper hover:bg-accent-dark" disabled={!fiatChecked || invoiceState !== "added"} onClick={() => post(`/api/trades/${orderId}/fiat-sent`, { confirmedActualFiatTransfer: true })}>
              Marcar fiat como enviado
            </Button>
          </Card>

          <Card className="space-y-5">
            <h2 className="flex items-center gap-2 font-semibold"><Star size={18} /> Calificar vendedor</h2>
            <div>
              <div className="flex w-fit gap-1 rounded border border-line/70 bg-paper/50 p-2" role="radiogroup" aria-label="Calificación del vendedor">
                {[1, 2, 3, 4, 5].map((value) => {
                  const active = value <= (hoveredRating || rating);
                  const label = `${value} ${value === 1 ? "estrella" : "estrellas"}`;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={rating === value}
                      aria-label={label}
                      title={label}
                      className={`focus-ring grid h-11 w-11 shrink-0 place-items-center rounded transition-colors ${active ? "text-bitcoin" : "text-ink/30 hover:text-bitcoin/70"}`}
                      onClick={() => setRating(value)}
                      onMouseEnter={() => setHoveredRating(value)}
                      onMouseLeave={() => setHoveredRating(0)}
                      onFocus={() => setHoveredRating(value)}
                      onBlur={() => setHoveredRating(0)}
                    >
                      <Star size={27} strokeWidth={2} fill={active ? "currentColor" : "none"} />
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-sm text-ink/60" aria-live="polite">
                {rating ? `${rating} de 5 estrellas` : "Selecciona una puntuación"}
              </p>
            </div>
            <Button className="bg-accent text-paper hover:bg-accent-dark" disabled={!rating} onClick={() => post(`/api/trades/${orderId}/rate`, { rating })}>
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
