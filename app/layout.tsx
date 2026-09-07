import type { Metadata } from "next";
import { AppNav } from "@/components/app-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mostrico",
  description: "Interfaz local para operar Bitcoin P2P con mostro-cli"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">
        <a href="#main-content" className="sr-only z-50 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:bg-accent focus:p-3 focus:text-paper">Saltar al contenido</a>
        <AppNav />
        <main id="main-content" tabIndex={-1} className="ds-shell">{children}</main>
      </body>
    </html>
  );
}
