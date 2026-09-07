import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { PageHeader, Section } from "@/components/ui";

export default function NotFound() {
  return <><PageHeader title="Página no encontrada" eyebrow="Mostrico / 404" /><Section className="space-y-5"><SearchX size={28} className="text-muted" /><p className="text-muted">Esta dirección no está disponible.</p><Link href="/market" className="ds-button ds-button-primary"><ArrowLeft size={17} /> Volver al mercado</Link></Section></>;
}
