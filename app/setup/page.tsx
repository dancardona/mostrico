"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, RotateCcw, TriangleAlert, XCircle } from "lucide-react";
import { Button, Card, Notice, PageHeader, Section } from "@/components/ui";
import { formatNumber } from "@/lib/format";

type Diagnostics = {
  cliFound: boolean;
  cliVersion?: string;
  supported: boolean;
  machineApiVersion?: number;
  machineFeatures: string[];
  mostroConfigured: boolean;
  relayCount: number;
  connection?: "ok" | "error" | "unknown";
  warnings: string[];
};

export default function SetupPage() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [restoreError, setRestoreError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/diagnostics");
    const body = await response.json();
    setLoading(false);
    if (!body.ok) {
      setError(body.error.message);
      return;
    }
    setData(body.data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function restoreSession() {
    setRestoring(true);
    setRestoreMessage("");
    setRestoreError("");
    try {
      const response = await fetch("/api/trades/restore", { method: "POST" });
      const body = await response.json();
      if (!body.ok) {
        setRestoreError(body.error.message);
        return;
      }
      setRestoreMessage(body.data.message);
    } catch {
      setRestoreError("No pudimos comunicarnos con el servidor local.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Setup local" eyebrow="Mostro / Configuración" description="Instancia, conexión y entorno local." actions={
        <Button onClick={load} disabled={loading} className="border border-line bg-panel hover:border-accent">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          Probar conexión
        </Button>
      } />

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && <Section role="status">Cargando diagnóstico...</Section>}

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <StatusCard label="CLI instalado" ok={data.cliFound} detail={data.cliVersion || "Sin versión detectada"} />
          <StatusCard label="Comandos compatibles" ok={data.supported} detail={data.supported ? "listorders, ordersinfo, takesell y getdm disponibles" : "Falta algún comando requerido"} />
          <StatusCard
            label="API para aplicaciones"
            ok={data.machineApiVersion === 1}
            detail={data.machineApiVersion === 1
              ? `v1: ${data.machineFeatures.join(", ")}`
              : "No disponible; se usará compatibilidad básica"}
          />
          <StatusCard label="MOSTRO_PUBKEY" ok={data.mostroConfigured} detail={data.mostroConfigured ? "Configurado" : "Pendiente en .env.local"} />
          <StatusCard label="Relays wss://" ok={data.relayCount > 0} detail={`${formatNumber(data.relayCount, 0)} relay(s) configurado(s)`} />
          <Section className="md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">Restaurar operaciones activas</h2>
                <p className="mt-1 max-w-2xl text-sm text-ink/70">
                  Recupera desde Mostro las operaciones y disputas activas, y vuelve a derivar sus claves locales de intercambio.
                </p>
              </div>
              <Button
                onClick={restoreSession}
                disabled={restoring || data.machineApiVersion !== 1 || !data.machineFeatures.includes("restore-persist") || !data.mostroConfigured || data.relayCount === 0}
                className="bg-accent text-black hover:bg-accent/90"
              >
                <RotateCcw size={18} className={restoring ? "animate-spin" : ""} />
                {restoring ? "Restaurando" : "Restaurar"}
              </Button>
            </div>
            {restoreMessage && <p className="mt-4 text-sm text-mint" role="status">{restoreMessage}</p>}
            {restoreError && <p className="mt-4 text-sm text-danger" role="alert">{restoreError}</p>}
          </Section>
          <Section className="md:col-span-2">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-1 text-bitcoin" size={22} />
              <div>
                <h2 className="font-semibold">Notas de seguridad</h2>
                <p className="mt-2 text-sm text-ink/70">
                  Esta app no pide mnemonic, nsec ni ADMIN_NSEC. Las acciones y la restauración pasan por mostro-cli; el chat solo lee localmente la clave de la operación. No expongas este servidor a LAN o internet.
                </p>
              </div>
            </div>
          </Section>
          {data.warnings.length > 0 && (
            <Notice tone="warning">
              <ul className="space-y-1">
                {data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </Notice>
          )}
        </div>
      )}
    </div>
  );
}

function StatusCard({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        {ok ? <CheckCircle2 className="mt-1 text-mint" size={22} /> : <XCircle className="mt-1 text-danger" size={22} />}
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <h2 className="font-semibold">{label}</h2>
          <p className="mt-1 text-sm text-ink/70">{detail}</p>
        </div>
      </div>
    </Card>
  );
}
