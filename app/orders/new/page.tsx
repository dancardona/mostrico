"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Bitcoin, Check, CheckCircle2, ChevronDown, Clock3, Copy, Eye, Landmark, Minus, Pencil, Plus, RefreshCw, RotateCcw, ShieldCheck, Zap } from "lucide-react";
import { AmountInput, Button, ErrorNotice, Notice, PageHeader, Section, TextArea, TextInput, type ApiErrorData } from "@/components/ui";
import { formatFiatAmount, formatFiatRange, formatNumber, formatPercentage, normalizeFiatInput } from "@/lib/format";
import { newOrderInputSchema } from "@/lib/mostro/schemas";
import type { CreatedOrderResult, OrderKind } from "@/lib/mostro/types";
import styles from "./new-order.module.css";

const steps = ["Operación", "Condiciones", "Revisión"];
const popularMethods = ["Nequi", "Bancolombia", "Llaves BRE-B", "Daviplata", "PSE"];
const fieldMessages: Record<string, string> = {
  currency: "Usa un código de tres letras, como COP.",
  fiatAmount: "Agrega un monto entero positivo. En un rango, el máximo debe ser mayor que el mínimo.",
  satsAmount: "Ingresa una cantidad entera de sats dentro del límite de Bitcoin.",
  premium: "El premium debe ser un entero entre -99 % y 100 %.",
  paymentMethods: "Agrega de uno a cinco métodos, con máximo 80 caracteres cada uno.",
  invoice: "Usa una invoice Lightning o una Lightning Address válida.",
  expirationDays: "Selecciona una vigencia válida."
};
const operationFields = ["currency", "fiatAmount", "satsAmount", "premium"];
const conditionFields = ["paymentMethods", "invoice", "expirationDays"];

function wholeNumber(value: string) {
  const normalized = normalizeFiatInput(value);
  return normalized && /^[1-9]\d*$/.test(normalized) ? normalized : undefined;
}

export default function NewOrderPage() {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<OrderKind>("buy");
  const [amountMode, setAmountMode] = useState<"fixed" | "range">("fixed");
  const [priceMode, setPriceMode] = useState<"market" | "fixed">("market");
  const [currency, setCurrency] = useState("COP");
  const [fiatAmount, setFiatAmount] = useState("");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [satsAmount, setSatsAmount] = useState("");
  const [paymentMethods, setPaymentMethods] = useState("");
  const [premium, setPremium] = useState("0");
  const [expirationDays, setExpirationDays] = useState("0");
  const [invoice, setInvoice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiErrorData | null>(null);
  const [result, setResult] = useState<CreatedOrderResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const sending = useRef(false);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const invoiceDetails = useRef<HTMLDetailsElement>(null);

  const fixed = wholeNumber(fiatAmount);
  const min = wholeNumber(minimum);
  const max = wholeNumber(maximum);
  const selectedFiat = amountMode === "fixed" ? fixed : min && max ? `${min}-${max}` : undefined;
  const normalizedSats = priceMode === "market" ? "0" : wholeNumber(satsAmount);
  const methods = paymentMethods.split(",").map((method) => method.trim()).filter(Boolean);
  const premiumNumber = premium.trim() ? Number(premium) : NaN;
  const expirationNumber = Number(expirationDays);
  const parsed = newOrderInputSchema.safeParse({
    kind, currency, fiatAmount: selectedFiat ?? "", satsAmount: normalizedSats ?? "",
    paymentMethods: methods, premium: premiumNumber,
    invoice: kind === "buy" && invoice.trim() ? invoice.trim() : undefined,
    expirationDays: expirationNumber, confirmed: true
  });
  const errors: Record<string, string> = {};
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const field = String(issue.path[0]);
    errors[field] = fieldMessages[field] ?? "Revisa este dato.";
  }
  const operationValid = !operationFields.some((field) => errors[field]);
  const conditionsValid = !conditionFields.some((field) => errors[field]);
  const fiatSummary = !errors.fiatAmount && !errors.currency
    ? amountMode === "fixed" ? formatFiatAmount(fixed, currency) : formatFiatRange(min, max, currency)
    : undefined;
  const priceSummary = priceMode === "market" ? "Precio de mercado" : !errors.satsAmount ? `${formatNumber(normalizedSats, 0)} sats` : "Por definir";
  const premiumSummary = !errors.premium ? `${premiumNumber > 0 ? "+" : ""}${formatPercentage(premiumNumber)}` : "Por definir";
  const expirySummary = expirationNumber === 0 ? "Predeterminada por Mostro" : `${formatNumber(expirationNumber, 0)} ${expirationNumber === 1 ? "día" : "días"}`;

  function navigate(next: number) {
    if (sending.current) return;
    setStep(next);
    setConfirmed(false);
    setAttempted(false);
    setError(null);
    requestAnimationFrame(() => stepTitle.current?.focus());
  }

  function nextStep() {
    if ((step === 0 && !operationValid) || (step === 1 && !conditionsValid)) {
      setAttempted(true);
      if (step === 1 && errors.invoice && invoiceDetails.current) invoiceDetails.current.open = true;
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    navigate(step + 1);
  }

  function changeKind(nextKind: OrderKind) {
    if (kind === nextKind) return;
    setKind(nextKind);
    setInvoice("");
    setConfirmed(false);
  }

  function toggleMethod(method: string) {
    const selected = methods.some((item) => item.toLowerCase() === method.toLowerCase());
    setPaymentMethods((selected ? methods.filter((item) => item.toLowerCase() !== method.toLowerCase()) : [...methods, method]).join(", "));
  }

  async function createOrder() {
    if (step !== 2 || !confirmed || !parsed.success || sending.current) return;
    sending.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        setError(body.error ?? { code: "MOSTRO_ERROR", message: "Mostro no confirmó la publicación." });
        setConfirmed(false);
        return;
      }
      if (typeof body.data?.orderId !== "string") throw new Error("Missing order confirmation");
      setResult(body.data);
    } catch {
      setConfirmed(false);
      setError({ code: "NETWORK_ERROR", message: "No pudimos confirmar si la orden se publicó. Revisa tus operaciones en Mostro antes de volver a intentarlo." });
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  }

  async function copyInvoice() {
    if (!result?.paymentInvoice) return;
    try { await navigator.clipboard.writeText(result.paymentInvoice); setCopied(true); setCopyError(""); }
    catch { setCopyError("No pudimos copiar la invoice. Puedes seleccionarla directamente."); }
  }

  if (result) return (
    <div className={styles.success}>
      <PageHeader title="Orden creada" eyebrow={result.kind === "buy" ? "Mostro / Compra" : "Mostro / Venta"} identifier={result.orderId} />
      <div className={styles.successMark}><CheckCircle2 size={24} /><span>Publicación confirmada por Mostro</span></div>
      {result.partial && <Notice tone="warning">Mostro confirmó la orden, aunque el CLI terminó con un error local. No vuelvas a publicarla.</Notice>}
      {result.paymentInvoice ? <Section className="space-y-4 border-bitcoin/40">
        <div><h2 className="flex items-center gap-2 font-semibold"><Zap size={18} /> Hold invoice por pagar</h2><p className="mt-2 text-sm text-muted">Págala desde tu wallet Lightning para bloquear los sats. Mostrico no realiza este pago.</p></div>
        <TextArea readOnly value={result.paymentInvoice} aria-label="Hold invoice" className="font-mono text-xs" />
        <Button className="ds-button-secondary" onClick={copyInvoice}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? "Invoice copiada" : "Copiar invoice"}</Button>
        {copyError && <p role="status" className="text-sm text-danger">{copyError}</p>}
      </Section> : <Notice tone="ok">{result.message}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Link href={`/my-orders/${result.orderId}`} className="ds-button ds-button-primary">Ver mi orden <ArrowRight size={18} /></Link>
        <Button className="ds-button-secondary" onClick={() => { setResult(null); setInvoice(""); setCopied(false); setCopyError(""); navigate(0); }}><RotateCcw size={18} /> Crear otra</Button>
      </div>
    </div>
  );

  return (
    <div className={styles.builder} data-side={kind}>
      <PageHeader title="Crear orden" eyebrow="Mostro / Nueva oferta" actions={<Link href="/market" className={styles.backMarket}><ArrowLeft size={15} /> Mercado</Link>} />
      <nav aria-label="Progreso de creación" className={styles.progress}>
        <ol>{steps.map((label, index) => <li key={label}><button type="button" aria-current={step === index ? "step" : undefined} disabled={submitting || (index > 0 && !operationValid) || (index > 1 && !conditionsValid)} onClick={() => navigate(index)}><span className={styles.stepNumber} data-complete={index < step}>{index < step ? <Check size={14} /> : formatNumber(index + 1, 0)}</span><span>{label}</span>{index < 2 && <span className={styles.stepLine} aria-hidden="true" />}</button></li>)}</ol>
        <span className={styles.privateNote}><ShieldCheck size={14} /> Publicación manual</span>
      </nav>

      <div className={styles.layout}>
        <form className={styles.form} noValidate onSubmit={(event) => { event.preventDefault(); if (step < 2) nextStep(); else void createOrder(); }}>
          <fieldset disabled={submitting} className={styles.fields}>
            <div className={styles.stageHeading}><span className={styles.stageOverline}>PASO {formatNumber(step + 1, 0)} / {formatNumber(steps.length, 0)}</span><h2 ref={stepTitle} tabIndex={-1}>{["Monto y precio", "Pago y vigencia", "Todo listo para publicar"][step]}</h2></div>

            {step === 0 && <>
              <div className={styles.direction} role="group" aria-label="Tipo de orden">
                <button type="button" aria-pressed={kind === "buy"} onClick={() => changeKind("buy")}><ArrowDownLeft size={20} /> Comprar BTC <Bitcoin size={16} /></button>
                <button type="button" aria-pressed={kind === "sell"} onClick={() => changeKind("sell")}><ArrowUpRight size={20} /> Vender BTC <Bitcoin size={16} /></button>
              </div>

              <section className={styles.amountSection} aria-label="Monto de la oferta">
                <div className={styles.fieldHeading}><label htmlFor={amountMode === "fixed" ? "fiatAmount" : "minimum"}>Monto fiat</label><div className={styles.modes} role="group" aria-label="Tipo de monto"><ModeButton selected={amountMode === "fixed"} onClick={() => setAmountMode("fixed")}>Fijo</ModeButton><ModeButton selected={amountMode === "range"} onClick={() => setAmountMode("range")}>Rango</ModeButton></div></div>
                <div className={styles.amountRow}>
                  <div className={styles.amounts} data-range={amountMode === "range"}>
                    {amountMode === "fixed" ? <AmountInput id="fiatAmount" aria-label="Monto fiat" className={styles.largeAmount} value={fiatAmount} onValueChange={setFiatAmount} placeholder="100.000" aria-invalid={attempted && Boolean(errors.fiatAmount)} aria-describedby={attempted && errors.fiatAmount ? "fiatAmount-error" : undefined} /> : <>
                      <label><span>Mínimo</span><AmountInput id="minimum" aria-label="Monto mínimo" className={styles.largeAmount} value={minimum} onValueChange={setMinimum} placeholder="100.000" aria-invalid={attempted && Boolean(errors.fiatAmount)} aria-describedby={attempted && errors.fiatAmount ? "fiatAmount-error" : undefined} /></label>
                      <label><span>Máximo</span><AmountInput aria-label="Monto máximo" className={styles.largeAmount} value={maximum} onValueChange={setMaximum} placeholder="500.000" aria-invalid={attempted && Boolean(errors.fiatAmount)} /></label>
                    </>}
                  </div>
                  <label className={styles.currency}><span>Moneda</span><TextInput aria-label="Moneda" value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} aria-invalid={attempted && Boolean(errors.currency)} aria-describedby={attempted && errors.currency ? "currency-error" : undefined} /></label>
                </div>
                <FieldError name="fiatAmount" message={attempted ? errors.fiatAmount : undefined} /><FieldError name="currency" message={attempted ? errors.currency : undefined} />
              </section>

              <section className={styles.priceSection} aria-label="Precio de la oferta">
                <div className={styles.fieldHeading}><span>Precio</span><div className={styles.modes} role="group" aria-label="Tipo de precio"><ModeButton selected={priceMode === "market"} onClick={() => setPriceMode("market")}>Mercado</ModeButton><ModeButton selected={priceMode === "fixed"} onClick={() => setPriceMode("fixed")}>Sats fijos</ModeButton></div></div>
                {priceMode === "fixed" && <div className={styles.fixedSats}><AmountInput aria-label="Cantidad de sats" value={satsAmount} onValueChange={setSatsAmount} suffix="sats" placeholder="Cantidad de sats" aria-invalid={attempted && Boolean(errors.satsAmount)} aria-describedby={attempted && errors.satsAmount ? "satsAmount-error" : undefined} /><FieldError name="satsAmount" message={attempted ? errors.satsAmount : undefined} /></div>}
                <div className={styles.premiumRow}><div><label htmlFor="premium">Premium</label><p>{errors.premium ? "Por definir" : premiumNumber === 0 ? "Sin ajuste sobre el precio" : premiumNumber > 0 ? "Por encima del precio de mercado" : "Descuento sobre el precio de mercado"}</p></div><div className={styles.stepper}>
                  <button type="button" title="Disminuir premium" aria-label="Disminuir premium" disabled={premiumNumber <= -99} onClick={() => setPremium(String(Math.max(-99, (Number.isFinite(premiumNumber) ? premiumNumber : 0) - 1)))}><Minus size={16} /></button>
                  <input id="premium" aria-label="Premium" type="number" min={-99} max={100} step={1} inputMode="numeric" value={premium} onChange={(event) => setPremium(event.target.value)} aria-invalid={attempted && Boolean(errors.premium)} aria-describedby={attempted && errors.premium ? "premium-error" : undefined} /><span>%</span>
                  <button type="button" title="Aumentar premium" aria-label="Aumentar premium" disabled={premiumNumber >= 100} onClick={() => setPremium(String(Math.min(100, (Number.isFinite(premiumNumber) ? premiumNumber : 0) + 1)))}><Plus size={16} /></button>
                </div></div>
                <FieldError name="premium" message={attempted ? errors.premium : undefined} />
              </section>
            </>}

            {step === 1 && <>
              <section className={styles.paymentSection} aria-label="Selección de métodos de pago">
                <div className={styles.fieldHeading}><span className={styles.iconLabel}><Landmark size={16} /> Métodos de pago</span><span className={styles.count}>{formatNumber(methods.length, 0)} / {formatNumber(5, 0)}</span></div>
                <div className={styles.methodChoices} role="group" aria-label="Métodos habituales">{popularMethods.map((method) => { const selected = methods.some((item) => item.toLowerCase() === method.toLowerCase()); return <label key={method} data-selected={selected}><input type="checkbox" checked={selected} onChange={() => toggleMethod(method)} disabled={!selected && methods.length >= 5} /><span className={styles.choiceCheck}>{selected ? <Check size={12} /> : <Plus size={12} />}</span>{method}</label>; })}</div>
                <label className={styles.customMethods}><span>Personalizar métodos</span><TextInput aria-label="Métodos de pago" value={paymentMethods} onChange={(event) => setPaymentMethods(event.target.value)} placeholder="Nequi, Bancolombia" aria-invalid={attempted && Boolean(errors.paymentMethods)} aria-describedby={attempted && errors.paymentMethods ? "paymentMethods-error" : undefined} /></label>
                <FieldError name="paymentMethods" message={attempted ? errors.paymentMethods : undefined} />
              </section>
              <label className={styles.expiry}><span className={styles.iconLabel}><Clock3 size={16} /> Expiración</span><select aria-label="Expiración" className="ds-input" value={expirationDays} onChange={(event) => setExpirationDays(event.target.value)}>{[0, 1, 3, 7, 14, 30].map((days) => <option key={days} value={days}>{days === 0 ? "Predeterminada por Mostro" : `${formatNumber(days, 0)} ${days === 1 ? "día" : "días"}`}</option>)}</select></label>
              {kind === "buy" && <details ref={invoiceDetails} className={styles.invoiceOption}><summary><Zap size={17} /><span>Invoice o Lightning Address <small>Opcional</small></span><ChevronDown size={16} /></summary><div><TextArea aria-label="Invoice o Lightning Address" value={invoice} onChange={(event) => setInvoice(event.target.value)} placeholder="lnbc... o nombre@wallet.com" aria-invalid={attempted && Boolean(errors.invoice)} aria-describedby={attempted && errors.invoice ? "invoice-error" : undefined} /></div></details>}
              <FieldError name="invoice" message={attempted ? errors.invoice : undefined} />
            </>}

            {step === 2 && <>
              <div className={styles.reviewHeading}><span className={styles.reviewSymbol}>{kind === "buy" ? <ArrowDownLeft size={23} /> : <ArrowUpRight size={23} />}</span><div><span>{kind === "buy" ? "Compra de Bitcoin" : "Venta de Bitcoin"}</span><strong>{fiatSummary}</strong></div><button type="button" onClick={() => navigate(0)} aria-label="Editar operación" title="Editar operación"><Pencil size={17} /></button></div>
              <dl className={styles.reviewDetails}><Summary label="Precio" value={priceSummary} /><Summary label="Premium" value={premiumSummary} /><Summary label="Métodos de pago" value={methods.join(", ")} /><Summary label="Expiración" value={expirySummary} />{kind === "buy" && <Summary label="Cobro Lightning" value={invoice.trim() ? "Invoice o dirección agregada" : "Agregar después"} />}</dl>
              <button type="button" className={styles.editConditions} onClick={() => navigate(1)}><Pencil size={14} /> Editar condiciones</button>
              <Notice tone="warning">{kind === "sell" ? "Al publicar una venta, Mostro puede solicitar una hold invoice. Debes pagarla desde tu wallet para bloquear los sats." : "Al publicar una compra, pagarás el fiat fuera de Mostrico cuando un vendedor tome la orden y Mostro confirme los sats."}</Notice>
              <label className={styles.confirmation}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Confirmo que quiero publicar esta orden en Mostro.</span></label>
            </>}
          </fieldset>

          {error && <div role="alert" className={styles.apiError}><ErrorNotice error={error} /></div>}
          <footer className={styles.actions}>
            {step > 0 ? <Button type="button" className={styles.backButton} disabled={submitting} onClick={() => navigate(step - 1)}><ArrowLeft size={16} /> Atrás</Button> : <span className={styles.actionNote}><ShieldCheck size={14} /> Sin publicar todavía</span>}
            <Button type="submit" className={styles.primaryButton} disabled={submitting || (step === 2 && (!confirmed || !parsed.success))}>{submitting ? <RefreshCw size={17} className="animate-spin" /> : step === 2 ? <Plus size={17} /> : null}{submitting ? "Publicando..." : step === 2 ? "Publicar orden" : step === 1 ? "Revisar oferta" : "Continuar"}{step < 2 && <ArrowRight size={17} />}</Button>
          </footer>
        </form>

        <aside className={styles.preview} aria-label="Vista previa de la oferta">
          <div className={styles.previewLabel}><span><Eye size={15} /> Vista previa</span><span>Sin publicar</span></div>
          <button type="button" className={styles.previewToggle} aria-expanded={previewOpen} aria-controls="offer-preview" onClick={() => setPreviewOpen(!previewOpen)}><span>{kind === "buy" ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />} {fiatSummary ?? "Tu oferta"}</span><ChevronDown size={16} /></button>
          <div id="offer-preview" className={styles.previewBody} data-open={previewOpen}>
            <div className={styles.offerPreview}>
              <div className={styles.previewIdentity}><Image src="/mostrico-logo.png" alt="" width={32} height={32} /><div><strong>Tu oferta</strong><span>{kind === "buy" ? "Compra" : "Venta"} de Bitcoin</span></div><span className={styles.pair}>BTC / {currency || "..."}</span></div>
              <div className={styles.previewAmount}><span>{amountMode === "range" ? "Rango de la oferta" : "Monto de la oferta"}</span><strong>{fiatSummary ?? "Por definir"}</strong><span>{priceSummary}</span></div>
              <div className={styles.previewPremium}><span>Premium</span><strong>{premiumSummary}</strong></div>
              <div className={styles.previewMethods}><span>Métodos de pago</span><div>{methods.length ? methods.map((method, index) => <span key={`${method}-${index}`}>{method}</span>) : <p>Por seleccionar</p>}</div></div>
              <div className={styles.previewFooter}><Zap size={13} /> Lightning Network</div>
            </div>
            <dl className={styles.checklist}><div data-complete={operationValid}><CheckCircle2 size={15} /><dt>Monto y precio</dt><dd>{operationValid ? "Listo" : "Pendiente"}</dd></div><div data-complete={conditionsValid}><CheckCircle2 size={15} /><dt>Condiciones</dt><dd>{conditionsValid ? "Listo" : "Pendiente"}</dd></div><div data-complete={confirmed}><ShieldCheck size={15} /><dt>Confirmación</dt><dd>{confirmed ? "Listo" : "Pendiente"}</dd></div></dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ModeButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={selected} onClick={onClick}>{children}</button>;
}

function FieldError({ name, message }: { name: string; message?: string }) {
  return message ? <p id={`${name}-error`} className={styles.fieldError} role="alert">{message}</p> : null;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
