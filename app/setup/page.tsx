"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { Button, Card, Notice } from "@/components/ui";

type Diagnostics = {
  cliFound: boolean;
  cliVersion?: string;
  supported: boolean;
  mostroConfigured: boolean;
  relayCount: number;
  connection?: "ok" | "error" | "unknown";
  warnings: string[];
};

export default function SetupPage() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Setup local</h1>
          <p className="mt-2 max-w-2xl text-ink/70">Revisa que esta máquina pueda ejecutar mostro-cli y tenga la configuración pública de la instancia Mostro.</p>
        </div>
        <Button onClick={load} disabled={loading} className="border border-line bg-panel hover:border-accent">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          Probar conexión
        </Button>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {loading && <Card>Cargando diagnóstico...</Card>}

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <StatusCard label="CLI instalado" ok={data.cliFound} detail={data.cliVersion || "Sin versión detectada"} />
          <StatusCard label="Comandos compatibles" ok={data.supported} detail={data.supported ? "listorders, ordersinfo, takesell y getdm disponibles" : "Falta algún comando requerido"} />
          <StatusCard label="MOSTRO_PUBKEY" ok={data.mostroConfigured} detail={data.mostroConfigured ? "Configurado" : "Pendiente en .env.local"} />
          <StatusCard label="Relays wss://" ok={data.relayCount > 0} detail={`${data.relayCount} relay(s) configurado(s)`} />
          <Card className="md:col-span-2">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-1 text-bitcoin" size={22} />
              <div>
                <h2 className="font-semibold">Notas de seguridad</h2>
                <p className="mt-2 text-sm text-ink/70">
                  Esta app no pide mnemonic, nsec ni ADMIN_NSEC. Tampoco abre <code>~/.mcli/mcli.db</code>. No expongas este servidor a LAN o internet.
                </p>
              </div>
            </div>
          </Card>
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
        <div>
          <h2 className="font-semibold">{label}</h2>
          <p className="mt-1 text-sm text-ink/70">{detail}</p>
        </div>
      </div>
    </Card>
  );
}
