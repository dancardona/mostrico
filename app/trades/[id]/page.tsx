"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Ban, Check, CheckCircle2, Clock3, LoaderCircle, MessageCircle, RefreshCw, ShieldCheck, Star, Zap } from "lucide-react";
import { Button, PageHeader, ErrorNotice, MarkdownText, Notice, TextArea, type ApiErrorData } from "@/components/ui";
import { LightningPayment } from "@/components/lightning-payment";
import { TradeChat } from "@/components/trade-chat";
import { getTradeFlow } from "@/lib/trade-flow";
import { formatNumber } from "@/lib/format";
import type { TradeLifecycleStatus, TradeMessage } from "@/lib/mostro/types";

export default function TradePage() {
  const { id } = useParams<{ id: string }>();
  return <TradeWizard key={id} orderId={id} />;
}

function TradeWizard({ orderId }: { orderId: string }) {
  const [lifecycle, setLifecycle] = useState<TradeLifecycleStatus | null>(null);
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [ambiguousMessages, setAmbiguousMessages] = useState<TradeMessage[]>([]);
  const [sellerHint, setSellerHint] = useState(false);
  const [bondSeen, setBondSeen] = useState(false);
  const [bondChecked, setBondChecked] = useState(false);
  const [continueAfterBond, setContinueAfterBond] = useState(false);
  const [invoice, setInvoice] = useState("");
  const [fiatChecked, setFiatChecked] = useState(false);
  const [releaseChecked, setReleaseChecked] = useState(false);
  const [disputeChecked, setDisputeChecked] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [rated, setRated] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<ApiErrorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const actingRef = useRef(false);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async (clearError = false) => {
    if (clearError) setError(null);
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const response = await fetch(`/api/trades/${orderId}/messages?since=30`, { signal: controller.signal });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (!body.ok) {
        setError(body.error);
        return;
      }
      setMessages(body.data.messages ?? []);
      setAmbiguousMessages(body.data.ambiguousMessages ?? []);
      const next = body.data.lifecycle as TradeLifecycleStatus | undefined;
      setLifecycle(next ?? null);
      if (next?.bondRequired || next?.bondInvoice) setBondSeen(true);
    } catch {
      if (!controller.signal.aborted) setError({ code: "NETWORK_ERROR", message: "No pudimos actualizar el estado de la operación. Intenta de nuevo." });
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [orderId]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setSellerHint(query.get("role") === "seller");
    if (query.get("bond") === "pending") setBondSeen(true);
    void load();
    const refresh = () => {
      if (!document.hidden && !actingRef.current) void load();
    };
    const interval = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      request.current?.abort();
      request.current = null;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  async function post(path: string, payload: unknown) {
    if (actingRef.current) return false;
    actingRef.current = true;
    setActing(true);
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setError(null);
    setNotice("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      if (!body.ok) {
        setError(body.error);
        if (body.error?.code === "ACTION_NOT_ALLOWED") await load();
        return false;
      }
      setNotice(body.data.message || "Acción enviada.");
      await load();
      return true;
    } catch {
      setError({ code: "NETWORK_ERROR", message: "No pudimos confirmar la respuesta. Actualiza el estado antes de volver a intentarlo." });
      return false;
    } finally {
      actingRef.current = false;
      setActing(false);
    }
  }

  async function addInvoice() {
    if (await post("/api/trades/add-invoice", { orderId, invoice })) {
      setInvoice("");
    }
  }

  const { isSeller, stage, steps, activeIndex, bondRequired, bondPending } = getTradeFlow(lifecycle, {
    sellerHint, bondSeen, continueAfterBond
  });
  const interrupted = stage === "canceled" || stage === "disputed";
  const canMarkFiatSent = lifecycle?.step === "ready_for_fiat" && !isSeller;
  const canRelease = isSeller && ["fiat_marked_sent", "waiting_release"].includes(lifecycle?.step ?? "");
  const needsPayoutInvoice = lifecycle?.step === "needs_payout_invoice";
  const stageTitle = {
    syncing: "Consultando tu operación",
    bond: "Garantía anti-abuso",
    invoice: "¿Dónde recibirás tus sats?",
    lock: isSeller ? "Hold invoice de la operación" : "Espera a que se aseguren los sats",
    fiat: isSeller ? "Espera el pago del comprador" : "Envía el pago fiat",
    release: isSeller ? "Verifica el pago y libera los sats" : "Espera la liberación de tus sats",
    payout: isSeller ? "Sats liberados; cobro pendiente" : needsPayoutInvoice ? "Agrega una nueva invoice para cobrar" : "Esperando el pago a tu wallet",
    completed: "Operación completada",
    canceled: "Operación cancelada",
    disputed: "Operación en disputa"
  }[stage];
  const StageIcon = stage === "completed" ? CheckCircle2 : stage === "canceled" ? Ban : stage === "disputed" ? AlertTriangle : stage === "bond" || stage === "lock" ? ShieldCheck : stage === "invoice" ? Zap : Clock3;

  return (
    <div className="space-y-6 pb-24">
      <PageHeader title="Operación" eyebrow="Mostro / Intercambio" description={isSeller ? "Venta de Bitcoin" : "Compra de Bitcoin"} identifier={orderId} actions={<>
        <Link href="/market" className="ds-button text-muted hover:text-ink"><ArrowLeft size={15} /> Mercado</Link>
        <button type="button" title="Actualizar estado" aria-label="Actualizar estado" className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line bg-panel text-muted hover:border-accent disabled:opacity-50" onClick={() => void load(true)} disabled={loading || acting}>
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </>} />

      <nav aria-label="Progreso de la operación" className="border-y border-line/70 py-5">
        <ol className="flex">
          {steps.map((step, index) => {
            const done = !interrupted && activeIndex > index && !(step.id === "bond" && bondPending);
            const current = index === activeIndex;
            return (
              <li key={step.id} aria-current={current ? "step" : undefined} className="relative flex min-w-0 flex-1 flex-col items-center gap-2 px-1 text-center">
                {index < steps.length - 1 && <span aria-hidden="true" className={`absolute left-1/2 top-4 h-px w-full ${done ? "bg-accent/60" : "bg-line"}`} />}
                <span className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-semibold ${done ? "border-accent bg-accent text-paper" : current ? "border-accent bg-paper text-accent ring-4 ring-accent/10" : "border-line bg-paper text-ink/45"}`}>
                  {done ? <Check size={16} aria-hidden="true" /> : index + 1}
                </span>
                <span className={`max-w-full break-words text-[11px] leading-4 sm:text-sm ${current ? "font-semibold text-ink" : "text-ink/55"}`}>{step.label}</span>
                <span className="sr-only">{done ? "Completado" : current ? "Paso actual" : "Pendiente"}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      {error && <ErrorNotice error={error} />}
      {notice && <Notice tone="ok"><MarkdownText>{notice}</MarkdownText></Notice>}

      <section aria-labelledby="trade-step-title" className="mx-auto max-w-2xl space-y-6 py-2 sm:py-5">
        <div>
          <p className="mb-3 flex items-center gap-2 text-xs font-medium text-accent">
            <StageIcon size={17} />
            {stage === "completed" ? "Todo listo" : interrupted ? "Estado de la operación" : activeIndex >= 0 ? `Paso ${activeIndex + 1} de ${steps.length}` : "Conectando con Mostro"}
          </p>
          <h2 id="trade-step-title" className="text-xl font-semibold sm:text-2xl" aria-live="polite">{stageTitle}</h2>
        </div>

        {stage === "syncing" && <Notice><span className="flex items-center gap-2"><LoaderCircle size={18} className={loading ? "animate-spin" : ""} /> {loading ? "Consultando el estado en Mostro..." : "Aún no hay un paso confirmado para esta operación. Espera una actualización de Mostro."}</span></Notice>}

        {stage === "bond" && (
          <>
            <p className="text-sm leading-6 text-ink/70">Esta garantía debe quedar retenida para continuar con la operación. Tu wallet puede mostrarla como un pago pendiente.</p>
            {lifecycle?.bondInvoice ? <LightningPayment key={lifecycle.bondInvoice} invoice={lifecycle.bondInvoice} label="Invoice de garantía anti-abuso" /> : <Notice>Esperando la invoice de garantía de Mostro.</Notice>}
            {lifecycle?.bondInvoice && !isSeller && (
              <>
                <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1.5 accent-accent" type="checkbox" checked={bondChecked} onChange={(event) => setBondChecked(event.target.checked)} /> Confirmo que pagué o inicié el pago de la garantía en mi wallet.</label>
                <Button className="w-full bg-accent text-paper hover:bg-accent-dark sm:w-auto" disabled={!bondChecked} onClick={() => setContinueAfterBond(true)}>Continuar con mi invoice <ArrowRight size={18} /></Button>
              </>
            )}
            <p className="flex items-center gap-2 text-xs text-ink/50"><Clock3 size={15} /> Esperando confirmación de Mostro</p>
          </>
        )}

        {stage === "invoice" && (
          <>
            <p className="text-sm leading-6 text-ink/70">Genera una invoice Lightning en tu wallet por el monto de la operación y agrégala aquí para recibir los sats.</p>
            {bondPending && <Notice tone="warning">Garantía pendiente de confirmación. Mostro comprobará que esté retenida al recibir tu invoice.</Notice>}
            {!bondPending && bondRequired && <p className="flex items-center gap-2 text-sm text-accent"><ShieldCheck size={17} /> Garantía aceptada por Mostro</p>}
            <div>
              <label htmlFor="receiving-invoice" className="mb-2 block text-sm font-medium">Invoice para recibir sats</label>
              <TextArea id="receiving-invoice" value={invoice} onChange={(event) => setInvoice(event.target.value)} placeholder="lnbc..." spellCheck={false} />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button className="bg-accent text-paper hover:bg-accent-dark" disabled={!invoice.trim() || acting} onClick={() => void addInvoice()}>{acting ? <LoaderCircle size={18} className="animate-spin" /> : <Zap size={18} />} Agregar invoice</Button>
              {bondPending && <Button className="text-ink/65 hover:text-ink" onClick={() => setContinueAfterBond(false)} disabled={acting}><ArrowLeft size={16} /> Ver garantía</Button>}
            </div>
          </>
        )}

        {stage === "lock" && (
          <>
            {isSeller ? (
              <>
                <p className="text-sm leading-6 text-ink/70">Paga esta hold invoice para asegurar los sats que venderás. Mostro detectará el pago y avisará al comprador.</p>
                {lifecycle?.paymentInvoice ? <LightningPayment key={lifecycle.paymentInvoice} invoice={lifecycle.paymentInvoice} label="Hold invoice de la operación" /> : <Notice>Esperando la hold invoice de Mostro.</Notice>}
                <Notice>El pago puede quedar pendiente en tu wallet hasta finalizar la operación.</Notice>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm text-accent"><CheckCircle2 size={18} /> Invoice Lightning agregada</p>
                <p className="text-sm leading-6 text-ink/70">El vendedor debe bloquear los sats antes de que puedas continuar con el pago fiat.</p>
                <Notice tone="warning">Espera la confirmación de Mostro antes de transferir dinero.</Notice>
              </>
            )}
            <p className="flex items-center gap-2 text-xs text-ink/50"><Clock3 size={15} /> Esperando confirmación de Mostro</p>
          </>
        )}

        {stage === "fiat" && (
          <>
            <p className="flex items-center gap-2 text-sm text-accent"><ShieldCheck size={18} /> Sats asegurados</p>
            <p className="text-sm leading-6 text-ink/70">{isSeller ? "Comparte tus datos de pago en el chat y espera a que el comprador notifique la transferencia." : "Confirma los datos con el vendedor en el chat y realiza la transferencia por el método acordado."}</p>
            {!isSeller && (
              <>
                <Notice>Este botón solo notifica el pago a Mostro. La transferencia se realiza desde tu banco o app de pagos.</Notice>
                <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1.5 accent-accent" type="checkbox" disabled={!canMarkFiatSent || acting} checked={fiatChecked} onChange={(event) => setFiatChecked(event.target.checked)} /> Confirmo que ya envié el pago fiat.</label>
                <Button className="w-full bg-accent text-paper hover:bg-accent-dark sm:w-auto" disabled={!fiatChecked || !canMarkFiatSent || acting} onClick={() => void post(`/api/trades/${orderId}/fiat-sent`, { confirmedActualFiatTransfer: true })}>{acting ? <LoaderCircle size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} Marcar fiat como enviado</Button>
              </>
            )}
          </>
        )}

        {stage === "release" && (
          <>
            <p className="flex items-center gap-2 text-sm text-accent"><CheckCircle2 size={18} /> {isSeller ? "Pago fiat notificado" : "Pago fiat ya notificado"}</p>
            <p className="text-sm leading-6 text-ink/70">{isSeller ? "Comprueba directamente en tu cuenta que recibiste el monto acordado antes de liberar los sats." : "El vendedor verificará la transferencia y liberará los sats hacia tu wallet. Te mostraremos aquí la confirmación de Mostro."}</p>
            {isSeller && (
              <>
                <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1.5 accent-accent" type="checkbox" disabled={acting} checked={releaseChecked} onChange={(event) => setReleaseChecked(event.target.checked)} /> Confirmo que recibí y verifiqué el pago fiat.</label>
                <Button className="bg-accent text-paper hover:bg-accent-dark" disabled={!releaseChecked || !canRelease || acting} onClick={() => void post(`/api/trades/${orderId}/release`, { confirmedFiatReceived: true })}>{acting ? <LoaderCircle size={18} className="animate-spin" /> : <ShieldCheck size={18} />} Liberar sats</Button>
              </>
            )}
          </>
        )}

        {stage === "payout" && (
          <>
            <p className="flex items-center gap-2 text-sm text-accent"><ShieldCheck size={18} /> Liberación registrada por Mostro</p>
            <p className="text-sm leading-6 text-ink/70">{isSeller
              ? "Los sats ya fueron liberados. Mostro aún debe confirmar el pago a la wallet del comprador; no necesitas liberarlos otra vez."
              : "El vendedor ya liberó los sats, pero el cobro aún no está confirmado. No vuelvas a enviar el pago fiat."}</p>
            {needsPayoutInvoice ? isSeller ? (
              <Notice>Mostro solicitó una nueva invoice al comprador para completar el pago.</Notice>
            ) : (
              <>
                <Notice tone="warning">Mostro no pudo completar el pago con la invoice anterior y solicitó una nueva. Puede haber vencido o fallado el pago Lightning.</Notice>
                {lifecycle?.payoutSats !== undefined && <dl className="border-y border-line/70 py-4"><dt className="text-sm text-ink/60">Monto neto a recibir</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(lifecycle.payoutSats, 0)} sats</dd></dl>}
                <p className="text-sm leading-6 text-ink/70">Genera una invoice nueva en tu wallet por el monto solicitado por Mostro y con suficiente tiempo de vigencia.</p>
                <div>
                  <label htmlFor="payout-invoice" className="mb-2 block text-sm font-medium">Nueva invoice para cobrar</label>
                  <TextArea id="payout-invoice" value={invoice} disabled={acting} onChange={(event) => setInvoice(event.target.value)} placeholder="lnbc..." spellCheck={false} />
                </div>
                <Button className="w-full bg-accent text-paper hover:bg-accent-dark sm:w-auto" disabled={!invoice.trim() || acting} onClick={() => void addInvoice()}>{acting ? <LoaderCircle size={18} className="animate-spin" /> : <Zap size={18} />} Actualizar invoice</Button>
              </>
            ) : (
              <Notice>Esperando confirmación del pago Lightning. Si Mostro solicita otra invoice, aparecerá aquí.</Notice>
            )}
          </>
        )}

        {stage === "completed" && (
          <>
            <p className="text-sm leading-6 text-ink/70">Mostro confirmó el cierre de esta operación.</p>
            <div className="space-y-4 border-t border-line/60 pt-6">
              <h3 className="font-semibold">Calificar {isSeller ? "comprador" : "vendedor"}</h3>
              {rated ? <Notice tone="ok">Calificación enviada</Notice> : (
                <>
                  <div className="flex w-fit gap-1" role="radiogroup" aria-label={`Calificación del ${isSeller ? "comprador" : "vendedor"}`}>
                    {[1, 2, 3, 4, 5].map((value) => {
                      const active = value <= (hoveredRating || rating);
                      const label = `${value} ${value === 1 ? "estrella" : "estrellas"}`;
                      return <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={label} title={label} disabled={acting} className={`focus-ring grid h-11 w-11 shrink-0 place-items-center rounded ${active ? "text-bitcoin" : "text-ink/30 hover:text-bitcoin"}`} onClick={() => setRating(value)} onMouseEnter={() => setHoveredRating(value)} onMouseLeave={() => setHoveredRating(0)} onFocus={() => setHoveredRating(value)} onBlur={() => setHoveredRating(0)}><Star size={27} fill={active ? "currentColor" : "none"} /></button>;
                    })}
                  </div>
                  <Button className="bg-accent text-paper hover:bg-accent-dark" disabled={!rating || acting} onClick={async () => { if (await post(`/api/trades/${orderId}/rate`, { rating })) setRated(true); }}>Enviar calificación</Button>
                </>
              )}
            </div>
            <Link href="/market" className="focus-ring inline-flex items-center gap-2 text-sm text-accent">Volver al mercado <ArrowRight size={16} /></Link>
          </>
        )}

        {interrupted && <Notice tone={stage === "disputed" ? "warning" : "neutral"}>{stage === "disputed" ? "La operación está en revisión. Puedes seguir conversando con la contraparte y consultar los mensajes de Mostro." : "Esta operación está cancelada. Puedes consultar su historial o volver al mercado."}</Notice>}
      </section>

      <div className="border-t border-line/70">
        <details className="border-b border-line/70 py-4">
          <summary className="focus-ring cursor-pointer text-sm font-medium"><span className="ml-2 inline-flex items-center gap-2"><MessageCircle size={16} /> Actividad de Mostro <span className="text-ink/45">{formatNumber(messages.length, 0)}</span></span></summary>
          <div className="mt-4 space-y-3">
            {messages.length === 0 && <p className="text-sm text-ink/55">No hay mensajes asociados de forma segura a esta operación.</p>}
            {messages.map((message, index) => <article key={message.id ?? index} className="border-l-2 border-line py-1 pl-4 text-sm"><p className="mb-1 text-xs text-ink/45">{message.source} {message.timestamp}</p><p className="break-words">{message.text}</p></article>)}
            {ambiguousMessages.length > 0 && <Notice tone="warning">Hay mensajes sin asociación confiable a esta operación. No se muestran como instrucciones de pago.</Notice>}
          </div>
        </details>
        {!interrupted && stage !== "completed" && stage !== "syncing" && stage !== "payout" && (
          <details className="border-b border-line/70 py-4">
            <summary className="focus-ring cursor-pointer text-sm text-ink/65">¿Hay un problema con la operación?</summary>
            <div className="mt-4 space-y-4">
              <h3 className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle size={18} /> Abrir disputa</h3>
              <p className="text-sm text-ink/65">Una disputa permite que un solver revise el caso si no puedes resolverlo con la contraparte.</p>
              <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={disputeChecked} disabled={acting} onChange={(event) => setDisputeChecked(event.target.checked)} /> Confirmo que quiero abrir disputa.</label>
              <Button className="bg-danger text-paper" disabled={!disputeChecked || acting} onClick={() => void post(`/api/trades/${orderId}/dispute`, { confirmed: true })}>Abrir disputa</Button>
            </div>
          </details>
        )}
      </div>

      <TradeChat key={orderId} orderId={orderId} floating />
    </div>
  );
}
