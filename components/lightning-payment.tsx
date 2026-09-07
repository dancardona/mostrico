"use client";

import { useRef, useState } from "react";
import { Check, Copy, ExternalLink, Maximize2, Share2, X, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button, TextArea } from "@/components/ui";

export function LightningPayment({ invoice, label }: { invoice: string; label: string }) {
  const [feedback, setFeedback] = useState("");
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const qrDialog = useRef<HTMLDialogElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(invoice);
      setCopied(true);
      setFeedback("Invoice copiada.");
    } catch {
      setFeedback("No pudimos copiarla. Puedes seleccionar la invoice completa abajo.");
    }
  }

  async function share() {
    if (!navigator.share) {
      await copy();
      setFeedback("Tu navegador no permite compartir directamente. Usa la invoice para enviarla desde tu app.");
      return;
    }
    setSharing(true);
    setFeedback("");
    try {
      await navigator.share({ title: label, text: invoice });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setFeedback("No pudimos compartir la invoice. Puedes copiarla o abrir tu wallet.");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[280px]">
          <div className="aspect-square overflow-hidden rounded bg-white">
            <QRCodeSVG
              value={invoice.toUpperCase()}
              size={280}
              level="M"
              marginSize={4}
              className="h-full w-full"
              role="img"
              aria-label={`QR: ${label}`}
              title={label}
            />
          </div>
          <button type="button" className="focus-ring mt-2 flex min-h-9 w-full items-center justify-center gap-2 rounded text-xs text-ink/60 hover:text-ink" onClick={() => qrDialog.current?.showModal()} aria-label="Ampliar QR"><Maximize2 size={15} /> Ampliar QR</button>
        </div>
        <div className="min-w-0 space-y-3">
          <a className="ds-button ds-button-primary w-full" href={`lightning:${invoice}`}>
            <Zap size={18} /> Abrir wallet <ExternalLink size={16} />
          </a>
          <Button className="w-full border border-line hover:border-accent" onClick={() => void copy()}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? "Invoice copiada" : "Copiar invoice"}
          </Button>
          <Button className="w-full border border-line hover:border-accent" disabled={sharing} onClick={() => void share()}>
            <Share2 size={18} /> Compartir
          </Button>
          <p className="text-sm text-ink/65" role="status">{feedback}</p>
        </div>
      </div>
      <details className="border-y border-line/60 py-3">
        <summary className="focus-ring cursor-pointer text-sm text-ink/70">Ver invoice completa</summary>
        <TextArea className="mt-3 min-h-24 font-mono text-xs" readOnly value={invoice} aria-label={label} onFocus={(event) => event.currentTarget.select()} />
      </details>
      <dialog ref={qrDialog} className="fixed inset-0 !m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border border-line bg-panel p-4 text-ink shadow-soft backdrop:bg-black/75" aria-label="QR de pago ampliado" onClick={(event) => { if (event.target === event.currentTarget) qrDialog.current?.close(); }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{label}</h3>
          <button type="button" autoFocus className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded border border-line" aria-label="Cerrar QR" title="Cerrar QR" onClick={() => qrDialog.current?.close()}><X size={18} /></button>
        </div>
        <QRCodeSVG value={invoice.toUpperCase()} size={400} marginSize={4} level="M" className="aspect-square h-auto w-full rounded bg-white" role="img" aria-label={`QR ampliado: ${label}`} />
      </dialog>
    </div>
  );
}
