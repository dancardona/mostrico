"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, LockKeyhole, MessageCircle, RefreshCw, Send, X } from "lucide-react";
import { Button, Section, ErrorNotice, Notice, TextArea, TextInput, type ApiErrorData } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import type { ChatMessage } from "@/lib/mostro/types";

interface ChatResponse {
  ready: boolean;
  counterpartyPubkey?: string;
  messages: ChatMessage[];
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  return [...current, ...incoming]
    .filter((message, index, all) => all.findIndex((candidate) => candidate.id === message.id) === index)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function shortPubkey(pubkey: string) {
  return pubkey.length > 24 ? `${pubkey.slice(0, 12)}…${pubkey.slice(-8)}` : pubkey;
}

function messageTime(timestamp: string) {
  if (!timestamp) return "Hora no disponible";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function TradeChat({ orderId, floating = false }: { orderId: string; floating?: boolean }) {
  return <Conversation key={orderId} orderId={orderId} floating={floating} />;
}

function Conversation({ orderId, floating }: { orderId: string; floating: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [readReady, setReadReady] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [pubkey, setPubkey] = useState("");
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<ApiErrorData | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messageList = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const storageKey = `mostrico:chat-read:${orderId}`;
  const visible = !floating || expanded;
  const unread = readReady ? messages.filter((item) => item.direction === "incoming" && !readIds.has(item.id)).length : 0;

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(stored)) setReadIds(new Set(stored.filter((id): id is string => typeof id === "string")));
    } catch {
      // Reading messages still works when browser storage is unavailable.
    }
    setReadReady(true);
    const onVisibility = () => setPageVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [storageKey]);

  useEffect(() => {
    if (!visible || !pageVisible || !readReady) return;
    const incoming = messages.filter((item) => item.direction === "incoming");
    if (!incoming.some((item) => !readIds.has(item.id))) return;
    const next = new Set([...readIds, ...incoming.map((item) => item.id)]);
    setReadIds(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Keep the in-memory read state if storage is full or disabled.
    }
  }, [messages, pageVisible, readIds, readReady, storageKey, visible]);

  useEffect(() => {
    if (floating && expanded) panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [expanded, floating]);

  function close() {
    setExpanded(false);
    launcher.current?.focus();
  }

  const load = useCallback(async (fullHistory = false) => {
    setLoading(true);
    const since = fullHistory ? 10_080 : 60;
    try {
      const response = await fetch(`/api/trades/${orderId}/chat?since=${since}`);
      const body = await response.json();
      if (!body.ok) {
        setError(body.error);
        return;
      }
      const data = body.data as ChatResponse;
      setReady(data.ready);
      setPubkey(data.counterpartyPubkey ?? "");
      setMessages((current) => mergeMessages(current, data.messages));
      setError(null);
    } catch {
      setError({ code: "NETWORK_ERROR", message: "No pudimos actualizar la conversación." });
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load(true);
    const refresh = () => { if (!document.hidden) void load(false); };
    const interval = window.setInterval(() => {
      if (!document.hidden) void load(false);
    }, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  useEffect(() => {
    if (messages.length > 0) {
      messageList.current?.scrollTo({ top: messageList.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, visible]);

  async function configure() {
    setLoading(true);
    setError(null);
    setNotice("");
    try {
      const response = await fetch(`/api/trades/${orderId}/chat`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: pubkeyInput, confirmed: true })
      });
      const body = await response.json();
      if (!body.ok) {
        setError(body.error);
        return;
      }
      setReady(true);
      setPubkey(body.data.counterpartyPubkey);
      setPubkeyInput("");
      await load(true);
    } catch {
      setError({ code: "NETWORK_ERROR", message: "No pudimos configurar la contraparte." });
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    setNotice("");
    try {
      const response = await fetch(`/api/trades/${orderId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const body = await response.json();
      if (!body.ok) {
        setError(body.error);
        return;
      }
      setMessages((current) => mergeMessages(current, [body.data.message]));
      setMessage("");
      if (!body.data.persisted) {
        setNotice("El mensaje fue enviado, pero no pudo guardarse en el historial local.");
      }
    } catch {
      setError({ code: "NETWORK_ERROR", message: "No pudimos enviar el mensaje." });
    } finally {
      setSending(false);
    }
  }

  const content = (
    <>
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><MessageCircle size={18} /> Chat</h2>
          {ready && (
            <p className="mt-2 flex items-center gap-2 text-xs text-ink/55">
              <LockKeyhole size={14} />
              <span className="break-all" title={`Contraparte ${pubkey}`}>{shortPubkey(pubkey)}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {floating && <button type="button" className="focus-ring grid h-10 w-10 place-items-center rounded border border-line text-ink/70 hover:text-ink" title="Cerrar chat" aria-label="Cerrar chat" onClick={close}><X size={18} /></button>}
          {ready && (
            <button
              type="button"
              className="focus-ring grid h-10 w-10 place-items-center rounded border border-line text-ink/70 hover:border-accent hover:text-accent"
              aria-label="Editar contraparte"
              title="Editar contraparte"
              onClick={() => {
                setPubkeyInput(pubkey);
                setReady(false);
              }}
            >
              <KeyRound size={17} />
            </button>
          )}
          <button
            type="button"
            className="focus-ring grid h-10 w-10 place-items-center rounded border border-line text-ink/70 hover:border-accent hover:text-accent disabled:opacity-50"
            aria-label="Actualizar chat"
            title="Actualizar chat"
            disabled={loading}
            onClick={() => void load(!ready)}
          >
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && <ErrorNotice error={error} />}
      {notice && <Notice tone="warning">{notice}</Notice>}

      {!ready ? (
        <div className="min-h-0 space-y-4 overflow-y-auto">
          <Notice>
            Mostro todavía no informó una contraparte para esta orden. Puedes agregar su pubkey de intercambio para habilitar el chat.
          </Notice>
          <div>
            <label htmlFor={`counterparty-${orderId}`} className="mb-2 block text-sm font-medium">Pubkey de la contraparte</label>
            <TextInput
              id={`counterparty-${orderId}`}
              value={pubkeyInput}
              onChange={(event) => setPubkeyInput(event.target.value.trim())}
              placeholder="npub1... o 64 caracteres hex"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button
            className="bg-accent text-paper hover:bg-accent-dark"
            disabled={!pubkeyInput || loading}
            onClick={configure}
          >
            <KeyRound size={18} />
            Guardar contraparte
          </Button>
        </div>
      ) : (
        <>
          <div
            ref={messageList}
            className={floating ? "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain border-y border-line bg-paper p-3" : "min-h-64 max-h-[28rem] space-y-3 overflow-y-auto rounded border border-line bg-paper p-4"}
            aria-live="polite"
            role="log"
            aria-label="Mensajes del chat"
          >
            {messages.length === 0 && (
              <div className="grid min-h-24 place-items-center text-center text-sm text-ink/50">
                No hay mensajes en esta conversación.
              </div>
            )}
            {messages.map((item) => {
              const legacyUnconfirmed = item.direction === "outgoing" && item.id.startsWith("outgoing-");
              return (
                <article
                  key={item.id}
                  className={`w-fit max-w-[85%] rounded px-3 py-2 text-sm ${
                    legacyUnconfirmed
                      ? "ml-auto border border-bitcoin/45 bg-[var(--surface-warning)] text-ink"
                      : item.direction === "outgoing"
                        ? "ml-auto bg-accent text-paper"
                        : "mr-auto border border-line bg-raised text-ink"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{item.text}</p>
                  <p className={`mt-1 text-right text-[11px] ${item.direction === "outgoing" && !legacyUnconfirmed ? "text-paper/70" : "text-ink/60"}`}>
                    {messageTime(item.timestamp)}
                  </p>
                  {legacyUnconfirmed && (
                    <p className="mt-1 text-right text-[11px] font-medium text-bitcoin">
                      Envío anterior no confirmado
                    </p>
                  )}
                </article>
              );
            })}
          </div>

          <div className="shrink-0 space-y-3">
            <label htmlFor={`chat-message-${orderId}`} className="sr-only">Mensaje</label>
            <TextArea
              id={`chat-message-${orderId}`}
              className={floating ? "h-20 min-h-20 resize-none" : "min-h-20 resize-y"}
              value={message}
              maxLength={1000}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Escribe un mensaje"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">{formatNumber(message.length, 0)} / {formatNumber(1000, 0)}</span>
              <Button
                className="bg-accent text-paper hover:bg-accent-dark"
                disabled={!message.trim() || sending}
                onClick={sendMessage}
              >
                {sending ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
                Enviar
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );

  if (!floating) return <Section className="space-y-5">{content}</Section>;

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite">{!expanded && unread > 0 ? `${unread} ${unread === 1 ? "mensaje sin leer" : "mensajes sin leer"} en el chat de la operación.` : ""}</div>
      {expanded && (
        <section
          ref={panel}
          id={`trade-chat-${orderId}`}
          role="dialog"
          aria-label="Chat de la operación"
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-[min(36rem,calc(100dvh-10rem))] w-[calc(100%-2rem)] max-w-[420px] flex-col gap-4 overflow-hidden rounded-lg border border-line bg-panel p-4 shadow-soft sm:right-6"
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}
        >
          {content}
        </section>
      )}
      <button
        ref={launcher}
        type="button"
        className="focus-ring fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-14 w-14 place-items-center rounded-full border border-accent/60 bg-accent text-paper shadow-soft hover:bg-accent-dark sm:right-6"
        aria-label={expanded ? "Cerrar chat" : unread > 0 ? `Abrir chat, ${unread} ${unread === 1 ? "mensaje sin leer" : "mensajes sin leer"}` : "Abrir chat"}
        title={expanded ? "Cerrar chat" : "Chat de la operación"}
        aria-expanded={expanded}
        aria-controls={`trade-chat-${orderId}`}
        onClick={() => expanded ? close() : setExpanded(true)}
      >
        {expanded ? <X size={24} /> : <MessageCircle size={24} />}
        {!expanded && unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full border-2 border-paper bg-danger px-1 text-[11px] font-bold text-paper">{unread > 99 ? "99+" : unread}</span>}
      </button>
    </>
  );
}
