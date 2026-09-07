"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CirclePlus, Home, ShoppingBag } from "lucide-react";

const destinations = [
  { href: "/market", label: "Mercado", Icon: ShoppingBag },
  { href: "/orders/new", label: "Crear", Icon: CirclePlus },
  { href: "/setup", label: "Setup", Icon: Activity },
  { href: "/", label: "Inicio", Icon: Home }
];

export function AppNav() {
  const pathname = usePathname();
  return <header className="ds-nav"><nav aria-label="Navegación principal" className="ds-nav-inner">
    <Link href="/market" className="ds-nav-brand"><Image src="/mostrico-logo.png" alt="" width={40} height={40} className="h-10 w-10 object-contain" priority />Mostrico</Link>
    <div className="ds-nav-links">{destinations.map(({ href, label, Icon }) => <Link key={href} href={href} className="ds-nav-link" aria-label={label} title={label} aria-current={pathname === href ? "page" : undefined}><Icon size={16} /><span className="hidden sm:inline">{label}</span></Link>)}</div>
  </nav></header>;
}
