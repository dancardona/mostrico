"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowUpDown, Bitcoin, Bookmark, ChevronDown, FilterX, Globe2, Landmark, LoaderCircle, Plus, RefreshCw, Search, SlidersHorizontal, WifiOff, X, Zap } from "lucide-react";
import { AmountInput, PageHeader } from "@/components/ui";
import { formatNumber, formatPercentage } from "@/lib/format";
import { fiatBounds, marketPaymentMethods, selectMarketOrders, type MarketIntent, type MarketSort } from "@/lib/market";
import type { MostroOrder } from "@/lib/mostro/types";
import styles from "./market.module.css";

const savedStorageKey = "mostrico.market.saved-orders";
const intents = [{ id: "buy", label: "Comprar", Icon: ArrowDownLeft }, { id: "sell", label: "Vender", Icon: ArrowUpRight }] as const;

export default function MarketPage() {
  const [intent, setIntent] = useState<MarketIntent>("buy");
  const [orders, setOrders] = useState<MostroOrder[]>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [sort, setSort] = useState<MarketSort>("premium");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [storageNotice, setStorageNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const orderKind = intent === "buy" ? "sell" : "buy";

  const load = useCallback(async (replaceActive = false) => {
    if (activeRequest.current && !replaceActive) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    if (replaceActive) {
      setOrders([]);
      setUpdatedAt(null);
    }
    try {
      const response = await fetch(`/api/orders?currency=COP&kind=${orderKind}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || !body.ok || !Array.isArray(body.data)) {
        setError(body.error?.message || "No pudimos consultar las ofertas de Mostro.");
        return;
      }
      setOrders(body.data.filter((order: MostroOrder) => order.kind === orderKind && order.currency === "COP"));
      setUpdatedAt(new Date());
    } catch {
      if (!controller.signal.aborted) setError("No pudimos actualizar las ofertas. Revisa la conexión e inténtalo de nuevo.");
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, [orderKind]);

  useEffect(() => {
    void load(true);
    const refresh = () => { if (!document.hidden) void load(); };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(savedStorageKey) ?? "[]");
      if (Array.isArray(stored)) setSavedIds(stored.filter((id): id is string => typeof id === "string").slice(-500));
    } catch { setStorageNotice("Las ofertas guardadas solo estarán disponibles durante esta sesión."); }
  }, []);

  function toggleSaved(orderId: string) {
    const next = savedIds.includes(orderId) ? savedIds.filter((id) => id !== orderId) : [...savedIds, orderId].slice(-500);
    setSavedIds(next);
    try { localStorage.setItem(savedStorageKey, JSON.stringify(next)); }
    catch { setStorageNotice("Las ofertas guardadas solo estarán disponibles durante esta sesión."); }
  }

  function clearFilters() {
    setAmount("");
    setMethod("");
    setSavedOnly(false);
  }

  const methods = [...new Set(orders.flatMap(marketPaymentMethods))].sort((a, b) => a.localeCompare(b, "es"));
  const filtered = selectMarketOrders(orders, { intent, amount, method, sort, savedOnly, savedIds });
  const minima = orders.map((order) => fiatBounds(order).min).filter((value): value is number => value !== undefined);
  const premiums = orders.map((order) => order.premiumPct).filter((value): value is number => value !== undefined && Number.isFinite(value));
  const bestPremium = premiums.length ? (intent === "buy" ? Math.min(...premiums) : Math.max(...premiums)) : undefined;
  const savedCount = orders.filter((order) => savedIds.includes(order.id)).length;
  const filtersActive = Boolean(amount || method || savedOnly);
  const advancedFilterCount = Number(Boolean(method)) + Number(savedOnly) + Number(sort !== "premium");
  const initialLoading = loading && updatedAt === null;

  return (
    <div className={styles.market} data-intent={intent}>
      <PageHeader title="Mercado Bitcoin" description={<p className={styles.location}><Globe2 size={14} /> Colombia <span aria-hidden="true">/</span> Pesos colombianos</p>} actions={<Link href="/orders/new" className={styles.createButton}><Plus size={18} /> Crear orden <ArrowUpRight size={16} className={styles.createArrow} /></Link>} />

      <section className={styles.overview} aria-label="Resumen del mercado">
        <div className={styles.pair}>
          <span className={styles.bitcoinMark}><Bitcoin size={27} strokeWidth={1.8} /></span>
          <div><strong>BTC <span>/</span> COP</strong><span className={styles.statLabel}>Bitcoin / Peso colombiano</span></div>
        </div>
        <div className={styles.stat}><span className={styles.statLabel}>Ofertas de {intent === "buy" ? "venta" : "compra"}</span><strong>{initialLoading ? "..." : updatedAt === null ? "Sin datos" : formatNumber(orders.length, 0)}{updatedAt !== null && <span className={styles.statUnit}>ofertas</span>}</strong></div>
        <div className={styles.stat}><span className={styles.statLabel}>Monto mínimo</span><strong>{initialLoading ? "..." : minima.length ? formatNumber(Math.min(...minima), 2) : "Sin datos"}{!initialLoading && minima.length > 0 && <span className={styles.statUnit}>COP</span>}</strong></div>
        <div className={styles.stat}><span className={styles.statLabel}>{intent === "buy" ? "Premium más bajo" : "Premium más alto"}</span><strong className={styles.premiumStat}>{initialLoading ? "..." : formatPercentage(bestPremium) ?? "Sin datos"}</strong></div>
      </section>

      <section aria-label="Ofertas de Bitcoin" className={styles.book}>
        <div className={styles.bookTop}>
          <div className={styles.tabs} role="tablist" aria-label="Tipo de operación">
            {intents.map(({ id, label, Icon }) => <button key={id} type="button" role="tab" id={`market-tab-${id}`} aria-label={label} aria-controls="market-orders" aria-selected={intent === id} tabIndex={intent === id ? 0 : -1} onClick={() => setIntent(id)} onKeyDown={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const next = event.key === "Home" ? "buy" : event.key === "End" ? "sell" : id === "buy" ? "sell" : "buy";
                setIntent(next);
                document.getElementById(`market-tab-${next}`)?.focus();
              }
            }}><Icon size={18} /> {label}<span className={styles.tabAsset}>BTC</span></button>)}
          </div>
          <div className={styles.sync}>
            <span className={error ? styles.syncError : ""}>{loading ? <LoaderCircle size={13} className={styles.spin} /> : error ? <WifiOff size={13} /> : <span className={styles.syncDot} />}<span>{loading ? "Actualizando" : error ? "Sin actualizar" : updatedAt ? <>Actualizado <time dateTime={updatedAt.toISOString()}>{updatedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false })}</time></> : "Sin sincronizar"}</span></span>
            <button type="button" className={styles.iconButton} title="Refrescar" aria-label="Refrescar" disabled={loading} onClick={() => void load()}><RefreshCw size={16} className={loading ? styles.spin : ""} /></button>
          </div>
        </div>

        <div className={styles.filters} data-expanded={filtersExpanded}>
          <div className={styles.filterField}>
            <label htmlFor="market-amount">{intent === "buy" ? "Quiero comprar por" : "Quiero vender por"}</label>
            <div className={styles.amountControls}>
              <div className={styles.amountField}><Search size={16} aria-hidden="true" /><AmountInput id="market-amount" value={amount} onValueChange={setAmount} allowDecimals suffix="COP" placeholder="Cualquier monto" className={styles.amountInput} />{amount && <button type="button" className={styles.clearAmount} aria-label="Borrar monto" title="Borrar monto" onClick={() => setAmount("")}><X size={14} /></button>}</div>
              <button type="button" className={styles.filterToggle} aria-label={filtersExpanded ? "Ocultar filtros" : "Mostrar filtros"} title={filtersExpanded ? "Ocultar filtros" : "Mostrar filtros"} aria-expanded={filtersExpanded} aria-controls="market-method-field market-sort-field market-saved" onClick={() => setFiltersExpanded(!filtersExpanded)}><SlidersHorizontal size={18} />{advancedFilterCount > 0 && <span>{formatNumber(advancedFilterCount, 0)}</span>}</button>
            </div>
          </div>
          <div id="market-method-field" className={`${styles.filterField} ${styles.advancedFilter}`}>
            <label htmlFor="market-method">Método de pago</label>
            <div className={styles.selectField}><Landmark size={16} aria-hidden="true" /><select id="market-method" value={method} onChange={(event) => setMethod(event.target.value)}><option value="">Todos los métodos</option>{method && !methods.includes(method) && <option value={method}>{method}</option>}{methods.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></div>
          </div>
          <div id="market-sort-field" className={`${styles.filterField} ${styles.advancedFilter}`}>
            <label htmlFor="market-sort">Ordenar por</label>
            <div className={styles.selectField}><ArrowUpDown size={16} aria-hidden="true" /><select id="market-sort" value={sort} onChange={(event) => setSort(event.target.value as MarketSort)}><option value="premium">{intent === "buy" ? "Menor premium" : "Mayor premium"}</option><option value="amount">Menor monto</option><option value="newest">Más recientes</option></select><ChevronDown size={15} aria-hidden="true" /></div>
          </div>
          <button type="button" id="market-saved" className={`${styles.savedFilter} ${styles.advancedFilter}`} aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}><Bookmark size={16} fill={savedOnly ? "currentColor" : "none"} /> Guardadas <span>{formatNumber(savedCount, 0)}</span></button>
        </div>

        {storageNotice && <p className={styles.storageNotice} role="status">{storageNotice}</p>}
        {error && <div role="alert" className={styles.error}><WifiOff size={19} /><div><strong>No se pudo actualizar el mercado</strong><p>{error}{orders.length > 0 && " Se conservan las últimas ofertas consultadas."}</p></div><button type="button" onClick={() => void load()} disabled={loading}>Reintentar <RefreshCw size={14} /></button></div>}

        <div className={styles.resultsBar}>
          <h2>{savedOnly ? "Ofertas guardadas" : "Todas las ofertas"} <span>{initialLoading ? "..." : formatNumber(filtered.length, 0)}</span></h2>
          {filtersActive ? <button type="button" onClick={clearFilters}><FilterX size={14} /> Limpiar filtros</button> : <span className={styles.resultsNote}><SlidersHorizontal size={13} /> BTC / COP</span>}
        </div>

        <div role="tabpanel" id="market-orders" aria-labelledby={`market-tab-${intent}`} aria-busy={loading}>
          <div className={styles.columnHeaders} aria-hidden="true"><span>Oferta</span><span>Monto en COP</span><span>Premium</span><span>Métodos de pago</span><span /></div>
          {initialLoading ? <div role="status" aria-label="Cargando ofertas" className={styles.skeletons}>{[0, 1, 2, 3].map((index) => <div key={index} className={styles.skeletonRow}><i /><i /><i /><i /></div>)}</div> : filtered.length > 0 ? (
            <ul className={styles.orders} aria-label="Lista de ofertas">
              {filtered.map((order) => <OfferRow key={order.id} order={order} intent={intent} saved={savedIds.includes(order.id)} onSave={() => toggleSaved(order.id)} />)}
            </ul>
          ) : (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>{error ? <WifiOff size={26} /> : savedOnly ? <Bookmark size={26} /> : <Search size={26} />}</span>
              <h3>{error ? "El mercado no está disponible" : filtersActive ? "No hay ofertas con estos filtros" : `Todavía no hay ofertas de ${intent === "buy" ? "venta" : "compra"}`}</h3>
              <p>{error ? "Vuelve a consultar cuando se restablezca la conexión." : savedOnly ? "No hay ofertas guardadas que coincidan con esta búsqueda." : filtersActive ? "Prueba otro monto o método de pago." : "Puedes publicar tu propia orden en COP."}</p>
              {filtersActive ? <button type="button" className={styles.emptyAction} onClick={clearFilters}><FilterX size={16} /> Limpiar filtros</button> : !error && <Link href="/orders/new" className={styles.emptyAction}><Plus size={16} /> Crear orden</Link>}
            </div>
          )}
        </div>
        <footer className={styles.bookFooter}><span><Zap size={13} /> Lightning Network</span><span>{initialLoading ? "Consultando Mostro" : `${formatNumber(filtered.length, 0)} de ${formatNumber(orders.length, 0)} ofertas`}</span><span><Globe2 size={13} /> Colombia · COP</span></footer>
      </section>
    </div>
  );
}

function OfferRow({ order, intent, saved, onSave }: { order: MostroOrder; intent: MarketIntent; saved: boolean; onSave: () => void }) {
  const methods = marketPaymentMethods(order);
  const premiumKnown = order.premiumPct !== undefined && Number.isFinite(order.premiumPct);
  const favorable = premiumKnown && (intent === "buy" ? order.premiumPct! <= 0 : order.premiumPct! >= 0);
  const { min, max } = fiatBounds(order);
  const isRange = min !== undefined && max !== undefined && min !== max;
  const rawMethods = order.paymentMethods.join(" · ");
  const hasConditions = methods.includes("Otros") || order.paymentMethods.some((value) => !methods.some((label) => label.toLowerCase() === value.trim().toLowerCase()));
  return (
    <li className={styles.offer}>
      <div className={styles.offerMain}>
        <div className={styles.offerIdentity}>
          <span className={styles.offerSymbol}>{intent === "buy" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
          <div><span className={styles.offerType}>Oferta de {order.kind === "sell" ? "venta" : "compra"}</span><span className={styles.orderId} title={order.id}>#{order.id.slice(0, 8)}</span></div>
        </div>
        <div className={styles.offerAmount}>
          <span className={styles.mobileLabel}>Monto en COP</span>
          <strong>{min !== undefined ? <>{formatNumber(min, 2)}{isRange && <><span className={styles.rangeSeparator}> - </span><wbr />{formatNumber(max, 2)}</>}</> : "Por confirmar"}</strong>
          <span className={styles.sats}>{order.sats !== undefined && order.sats > 0 ? `${formatNumber(order.sats, 0)} sats${isRange ? " de referencia" : ""}` : "Sats a precio de mercado"}</span>
        </div>
        <div className={styles.offerPremium}><span className={styles.mobileLabel}>Premium</span><strong data-tone={!premiumKnown ? "muted" : favorable ? "favorable" : "standard"}>{premiumKnown ? `${order.premiumPct! > 0 ? "+" : ""}${formatPercentage(order.premiumPct)}` : "Sin datos"}</strong><span className={styles.premiumCaption}>{!premiumKnown ? "Por confirmar" : order.premiumPct === 0 ? "Sin premium" : order.premiumPct! < 0 ? "Bajo mercado" : "Sobre mercado"}</span></div>
        <div className={styles.offerPayments}><div className={styles.paymentTags}>{methods.map((item) => <span key={item} data-method={item}><i aria-hidden="true" />{item}</span>)}</div></div>
        <div className={styles.offerActions}>
          <button type="button" className={styles.bookmarkButton} aria-label={`${saved ? "Quitar" : "Guardar"} oferta ${order.id.slice(0, 8)}`} title={saved ? "Quitar de guardadas" : "Guardar oferta"} aria-pressed={saved} onClick={onSave}><Bookmark size={17} fill={saved ? "currentColor" : "none"} /></button>
          <Link href={`/orders/${order.id}`} className={styles.offerLink}>Ver oferta <ArrowUpRight size={16} /></Link>
        </div>
      </div>
      {hasConditions && <details className={styles.conditions}><summary><ChevronDown size={13} /> Condiciones del anunciante</summary><p>{rawMethods || "El anunciante no especificó un método de pago."}</p><span className={styles.fullId}>ID: {order.id}</span></details>}
    </li>
  );
}
