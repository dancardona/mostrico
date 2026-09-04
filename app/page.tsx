import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <section className="relative min-h-[calc(100vh-7rem)] overflow-hidden py-4 sm:py-10">
      <div className="relative lg:flex lg:min-h-[27rem] lg:items-center">
        <Image
          src="/mostrico-logo.png"
          alt="Mostrico, un pequeño mostro verde con un rayo naranja"
          width={720}
          height={720}
          className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 object-contain lg:left-auto lg:right-0 lg:top-1/2 lg:h-[27rem] lg:w-[27rem] lg:translate-x-0 lg:-translate-y-1/2"
          priority
        />

        <div className="relative z-10 max-w-2xl pt-64 lg:max-w-[55%] lg:pt-0">
          <p className="mb-3 inline-flex items-center gap-2 rounded border border-accent/20 bg-panel px-3 py-1 text-sm text-accent shadow-soft">
            <ShieldCheck size={16} />
            Local-first, sin custodia
          </p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-normal text-ink md:text-6xl">Mostrico</h1>
          <p className="mt-5 max-w-2xl text-lg text-ink/75">
            Compra o vende Bitcoin con Mostro desde tu navegador local. Mostrico usa tu instalación de <code className="font-mono font-semibold text-bitcoin">mostro-cli</code>, no pide mnemonic y no mueve dinero por ti.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/market" className="focus-ring inline-flex items-center gap-2 rounded bg-accent px-5 py-3 font-semibold text-paper shadow-soft hover:bg-accent-dark">
              Comprar BTC
              <ArrowRight size={18} />
            </Link>
            <Link href="/setup" className="focus-ring inline-flex items-center gap-2 rounded border border-line bg-panel px-5 py-3 font-semibold hover:border-accent">
              Revisar setup
            </Link>
            <Link href="/orders/new" className="focus-ring inline-flex items-center gap-2 rounded border border-line bg-panel px-5 py-3 font-semibold hover:border-accent">
              Crear orden
            </Link>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-12 border-t border-line/70 pt-6 lg:mt-4">
        <h2 className="text-sm font-semibold uppercase text-ink/50">Flujo seguro</h2>
        <ol className="mt-4 grid gap-4 text-sm text-ink/75 sm:grid-cols-2 lg:grid-cols-4">
          <li className="flex gap-3"><strong className="text-accent">01</strong><span>Exploras ofertas o publicas la tuya.</span></li>
          <li className="flex gap-3"><strong className="text-accent">02</strong><span>Mostro coordina el intercambio y el escrow.</span></li>
          <li className="flex gap-3"><strong className="text-accent">03</strong><span>Confirmas cada acción sensible.</span></li>
          <li className="flex gap-3"><strong className="text-accent">04</strong><span>Los pagos ocurren fuera de Mostrico.</span></li>
        </ol>
      </div>
    </section>
  );
}
