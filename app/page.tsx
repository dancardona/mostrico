import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowUpRight, Bitcoin, CirclePlus, LockKeyhole, ShoppingBag, Zap } from "lucide-react";
import { PageHeader, Section } from "@/components/ui";

export default function HomePage() {
  return (
    <div>
      <PageHeader title="Mostrico" eyebrow="Mostro / Tu espacio P2P" description="Bitcoin entre personas. Colombia / COP." actions={<Image src="/mostrico-logo.png" alt="Logo de Mostrico" width={72} height={72} priority />} />
      <div className="grid grid-cols-1 gap-5 border-y border-line py-6 sm:grid-cols-3">
        <div className="flex items-center gap-3"><Bitcoin className="text-bitcoin" size={23} /><div><strong className="font-semibold">BTC / COP</strong><p className="mt-1 text-xs text-muted">Bitcoin / Peso colombiano</p></div></div>
        <div className="flex items-center gap-3 sm:border-l sm:border-line sm:pl-6"><Zap className="text-bitcoin" size={21} /><div><strong className="font-semibold">Lightning Network</strong><p className="mt-1 text-xs text-muted">Pagos en sats</p></div></div>
        <div className="flex items-center gap-3 sm:border-l sm:border-line sm:pl-6"><LockKeyhole className="text-sell" size={21} /><div><strong className="font-semibold">Entorno local</strong><p className="mt-1 text-xs text-muted">Identidad de mostro-cli</p></div></div>
      </div>
      <Section className="mt-8 border-t-0" aria-label="Tu espacio">
        <h2>Tu espacio</h2>
        <nav aria-label="Accesos de Mostrico" className="mt-3">
          <Link href="/market" className="ds-home-link"><ShoppingBag /><div><strong>Mercado Bitcoin</strong><small>Ofertas de compra y venta / COP</small></div><ArrowUpRight size={19} /></Link>
          <Link href="/orders/new" className="ds-home-link"><CirclePlus /><div><strong>Crear orden</strong><small>Compra o venta / Precio y métodos de pago</small></div><ArrowUpRight size={19} /></Link>
          <Link href="/setup" className="ds-home-link"><Activity /><div><strong>Setup local</strong><small>Mostro / CLI / Relays</small></div><ArrowUpRight size={19} /></Link>
        </nav>
      </Section>
    </div>
  );
}
