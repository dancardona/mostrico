"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Copy, Plus, RefreshCw, RotateCcw, ShoppingCart, Tag, Zap } from "lucide-react";
import { AmountInput, Button, Card, ErrorNotice, Notice, TextArea, TextInput, type ApiErrorData } from "@/components/ui";
import { formatFiatAmount, formatFiatRange, formatNumber, formatPercentage, normalizeFiatInput } from "@/lib/format";
import type { CreatedOrderResult, OrderKind } from "@/lib/mostro/types";

type AmountMode = "fixed" | "range";
type PriceMode = "market" | "fixed";

function wholeNumber(value: string, allowZero = false) {
  const normalized = normalizeFiatInput(value);
  if (!normalized || !/^\d+$/.test(normalized)) return undefined;
  if (!allowZero && Number(normalized) <= 0) return undefined;
  return normalized;
}

export default function NewOrderPage() {
  const [kind, setKind] = useState<OrderKind>("buy");
  const [amountMode, setAmountMode] = useState<AmountMode>("fixed");
  const [priceMode, setPriceMode] = useState<PriceMode>("market");
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiErrorData | null>(null);
  const [result, setResult] = useState<CreatedOrderResult | null>(null);
  const [copied, setCopied] = useState(false);

  const fixed = wholeNumber(fiatAmount);
  const min = wholeNumber(minimum);
  const max = wholeNumber(maximum);
  const rangeIsValid = Boolean(min && max && Number(min) < Number(max));
  const normalizedSats = priceMode === "market" ? "0" : wholeNumber(satsAmount);
  const methods = paymentMethods.split(",").map((method) => method.trim()).filter(Boolean);
  const premiumNumber = Number(premium);
  const premiumIsValid = Number.isInteger(premiumNumber) && premiumNumber >= -99 && premiumNumber <= 100;
  const expirationNumber = Number(expirationDays);
  const expirationIsValid = Number.isInteger(expirationNumber) && expirationNumber >= 0 && expirationNumber <= 90;
  const selectedFiat = amountMode === "fixed" ? fixed : rangeIsValid ? `${min}-${max}` : undefined;
  const canSubmit = confirmed && !submitting && Boolean(selectedFiat && normalizedSats) && methods.length > 0 && methods.length <= 5 && premiumIsValid && expirationIsValid;

  const fiatSummary = useMemo(() => {
    if (amountMode === "fixed") return formatFiatAmount(fixed, currency);
    return formatFiatRange(min, max, currency);
  }, [amountMode, currency, fixed, max, min]);

  function changeKind(nextKind: OrderKind) {
    setKind(nextKind);
    setInvoice("");
    setConfirmed(false);
  }

  async function createOrder() {
    if (!canSubmit || !selectedFiat || !normalizedSats) return;
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        currency,
        fiatAmount: selectedFiat,
        satsAmount: normalizedSats,
        paymentMethods: methods,
        premium: premiumNumber,
        invoice: kind === "buy" && invoice.trim() ? invoice.trim() : undefined,
        expirationDays: expirationNumber,
        confirmed: true
      })
    });
    const body = await response.json();
    setSubmitting(false);
    if (!body.ok) {
      setError(body.error);
      return;
    }
    setResult(body.data);
  }

  async function copyInvoice() {
    if (!result?.paymentInvoice) return;
    await navigator.clipboard.writeText(result.paymentInvoice);
    setCopied(true);
  }

  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-medium text-accent">Orden {result.kind}</p>
          <h1 className="mt-1 text-3xl font-bold">Orden creada</h1>
          <p className="mt-2 break-all text-ink/70">{result.orderId}</p>
        </div>

        {result.partial && (
          <Notice tone="warning">Mostro confirmó la orden, aunque el CLI terminó con un error local. No vuelvas a publicarla.</Notice>
        )}

        {result.paymentInvoice ? (
          <Card className="space-y-4 border-bitcoin/40">
            <div>
              <h2 className="flex items-center gap-2 font-semibold"><Zap size={18} /> Hold invoice por pagar</h2>
              <p className="mt-2 text-sm text-ink/70">Págala desde tu wallet Lightning para bloquear los sats. Mostrico no realiza este pago.</p>
            </div>
            <TextArea readOnly value={result.paymentInvoice} aria-label="Hold invoice" />
            <Button className="border border-bitcoin/50 bg-paper hover:border-bitcoin" onClick={copyInvoice}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? "Invoice copiada" : "Copiar invoice"}
            </Button>
          </Card>
        ) : (
          <Notice tone="ok">{result.message}</Notice>
        )}

        <div className="flex flex-wrap gap-3">
          <Link href={`/my-orders/${result.orderId}`} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded bg-accent px-4 py-2 font-semibold text-paper hover:bg-accent-dark">
            Ver mi orden
            <ArrowRight size={18} />
          </Link>
          <Button className="border border-line bg-panel hover:border-accent" onClick={() => { setResult(null); setConfirmed(false); }}>
            <RotateCcw size={18} />
            Crear otra
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Crear orden</h1>
        <p className="mt-2 text-ink/70">Publica una oferta propia en Mostro usando tu identidad local.</p>
      </div>

      {error && <ErrorNotice error={error} />}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-7">
          <section>
            <h2 className="mb-4 font-semibold">Quiero</h2>
            <div className="grid grid-cols-2 rounded border border-line bg-paper p-1" role="group" aria-label="Tipo de orden">
              <button type="button" aria-pressed={kind === "buy"} onClick={() => changeKind("buy")} className={`focus-ring min-h-11 rounded px-3 font-semibold ${kind === "buy" ? "bg-accent text-paper" : "text-ink/70 hover:bg-panel"}`}>
                Comprar BTC
              </button>
              <button type="button" aria-pressed={kind === "sell"} onClick={() => changeKind("sell")} className={`focus-ring min-h-11 rounded px-3 font-semibold ${kind === "sell" ? "bg-bitcoin text-paper" : "text-ink/70 hover:bg-panel"}`}>
                Vender BTC
              </button>
            </div>
          </section>

          <section className="grid gap-5 sm:grid-cols-[120px_1fr]">
            <label>
              <span className="mb-2 block text-sm font-medium">Moneda</span>
              <TextInput value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} />
            </label>
            <div>
              <span className="mb-2 block text-sm font-medium">Monto fiat</span>
              <div className="mb-4 flex gap-2" role="group" aria-label="Tipo de monto">
                <ModeButton selected={amountMode === "fixed"} onClick={() => setAmountMode("fixed")}>Fijo</ModeButton>
                <ModeButton selected={amountMode === "range"} onClick={() => setAmountMode("range")}>Rango</ModeButton>
              </div>
              {amountMode === "fixed" ? (
                <AmountInput value={fiatAmount} onValueChange={setFiatAmount} suffix={currency} placeholder="100.000" />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <AmountInput aria-label="Monto mínimo" value={minimum} onValueChange={setMinimum} suffix={currency} placeholder="Mínimo" />
                  <AmountInput aria-label="Monto máximo" value={maximum} onValueChange={setMaximum} suffix={currency} placeholder="Máximo" />
                </div>
              )}
              {amountMode === "range" && minimum && maximum && !rangeIsValid && <p className="mt-2 text-sm text-danger">El máximo debe ser mayor que el mínimo.</p>}
            </div>
          </section>

          <section>
            <span className="mb-2 block text-sm font-medium">Precio</span>
            <div className="mb-4 flex gap-2" role="group" aria-label="Tipo de precio">
              <ModeButton selected={priceMode === "market"} onClick={() => setPriceMode("market")}>Mercado</ModeButton>
              <ModeButton selected={priceMode === "fixed"} onClick={() => setPriceMode("fixed")}>Sats fijos</ModeButton>
            </div>
            {priceMode === "fixed" && (
              <label>
                <span className="sr-only">Cantidad de sats</span>
                <AmountInput value={satsAmount} onValueChange={setSatsAmount} suffix="sats" placeholder="Cantidad de sats" />
              </label>
            )}
          </section>

          <section className="grid gap-5 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm font-medium">Métodos de pago</span>
              <TextInput value={paymentMethods} onChange={(event) => setPaymentMethods(event.target.value)} placeholder="Nequi, Bancolombia" />
            </label>
            <label>
              <span className="mb-2 block text-sm font-medium">Premium</span>
              <div className="relative">
                <TextInput className="pr-10" inputMode="numeric" value={premium} onChange={(event) => setPremium(event.target.value)} aria-invalid={!premiumIsValid} />
                <span className="pointer-events-none absolute right-3 top-2.5 text-ink/50">%</span>
              </div>
            </label>
          </section>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Expiración</span>
            <select className="focus-ring min-h-11 w-full rounded border border-line bg-paper px-3" value={expirationDays} onChange={(event) => setExpirationDays(event.target.value)}>
              <option value="0">Predeterminada por Mostro</option>
              <option value="1">1 día</option>
              <option value="3">3 días</option>
              <option value="7">7 días</option>
              <option value="14">14 días</option>
              <option value="30">30 días</option>
            </select>
          </label>

          {kind === "buy" && (
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Invoice o Lightning Address <span className="text-ink/45">(opcional)</span></span>
              <TextArea value={invoice} onChange={(event) => setInvoice(event.target.value)} placeholder="lnbc... o nombre@wallet.com" />
            </label>
          )}

          <Notice tone="warning">
            {kind === "sell"
              ? "Al publicar una venta, Mostro puede solicitar una hold invoice. Debes pagarla desde tu wallet para bloquear los sats."
              : "Al publicar una compra, pagarás el fiat fuera de Mostrico cuando un vendedor tome la orden y Mostro confirme los sats."}
          </Notice>

          <label className="flex items-start gap-3 rounded border border-line/70 bg-paper/50 p-4 text-sm leading-6">
            <input className="mt-1.5" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            Confirmo que quiero publicar esta orden en Mostro.
          </label>

          <Button className="w-full bg-accent text-paper hover:bg-accent-dark" disabled={!canSubmit} onClick={createOrder}>
            {submitting ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} />}
            {submitting ? "Publicando..." : "Publicar orden"}
          </Button>
        </Card>

        <div className="space-y-5">
          <Card>
            <h2 className="flex items-center gap-2 font-semibold"><ShoppingCart size={18} /> Resumen</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <Summary label="Operación" value={kind === "buy" ? "Comprar Bitcoin" : "Vender Bitcoin"} />
              <Summary label="Monto" value={fiatSummary} />
              <Summary label="Precio" value={priceMode === "market" ? "Precio de mercado" : normalizedSats ? `${formatNumber(normalizedSats, 0)} sats` : undefined} />
              <Summary label="Premium" value={premiumIsValid ? formatPercentage(premiumNumber) : undefined} />
              <Summary label="Métodos" value={methods.join(", ")} />
              <Summary label="Expiración" value={expirationNumber === 0 ? "Predeterminada" : `${expirationNumber} días`} />
            </dl>
          </Card>
          <Notice>
            <span className="flex items-center gap-2 font-semibold"><Tag size={16} /> Premium</span>
            <span className="mt-1 block">Un valor positivo publica por encima del precio de mercado; uno negativo aplica descuento.</span>
          </Notice>
        </div>
      </div>
    </div>
  );
}

function ModeButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`focus-ring min-h-9 rounded border px-3 text-sm ${selected ? "border-accent bg-raised text-accent" : "border-line bg-paper text-ink/65 hover:border-accent"}`}>
      {children}
    </button>
  );
}

function Summary({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/60 pb-3 last:border-0 last:pb-0">
      <dt className="text-ink/50">{label}</dt>
      <dd className="text-right font-medium">{value || "Pendiente"}</dd>
    </div>
  );
}
