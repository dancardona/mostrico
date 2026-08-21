import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Activity, CirclePlus, Home, ShoppingBag } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mostrico",
  description: "Interfaz local para operar Bitcoin P2P con mostro-cli"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">
        <header className="sticky top-0 z-20 border-b border-accent/15 bg-paper/95 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/market" className="flex items-center gap-2 text-lg font-bold text-ink">
              <Image src="/mostrico-logo.png" alt="" width={40} height={40} className="h-10 w-10 object-contain" priority />
              Mostrico
            </Link>
            <div className="flex items-center gap-1">
              <Link className="focus-ring inline-flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-panel sm:px-3" href="/market">
                <ShoppingBag size={16} />
                <span className="hidden sm:inline">Mercado</span>
              </Link>
              <Link className="focus-ring inline-flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-panel sm:px-3" href="/orders/new">
                <CirclePlus size={16} />
                <span className="hidden sm:inline">Crear</span>
              </Link>
              <Link className="focus-ring inline-flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-panel sm:px-3" href="/setup">
                <Activity size={16} />
                <span className="hidden sm:inline">Setup</span>
              </Link>
              <Link className="focus-ring inline-flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-panel sm:px-3" href="/">
                <Home size={16} />
                <span className="hidden sm:inline">Inicio</span>
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
