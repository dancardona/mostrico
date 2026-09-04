"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, LockKeyhole, MessageCircle, RefreshCw, Send } from "lucide-react";
import { Button, Card, ErrorNotice, Notice, TextArea, TextInput, type ApiErrorData } from "@/components/ui";
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

export function TradeChat({ orderId }: { orderId: string }) {
  const [ready, setReady] = useState(false);
  const [pubkey, setPubkey] = useState("");
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<ApiErrorData | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const initialLoad = useRef(true);
  const messageList = useRef<HTMLDivElement>(null);

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
    const fullHistory = initialLoad.current;
    initialLoad.current = false;
    void load(fullHistory);
    const interval = window.setInterval(() => {
      if (!document.hidden) void load(false);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (messages.length > 0) {
      messageList.current?.scrollTo({ top: messageList.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

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

  return (
    <Card className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><MessageCircle size={18} /> Chat</h2>
          {ready && (
            <p className="mt-2 flex items-center gap-2 text-xs text-ink/55">
              <LockKeyhole size={14} />
              <span>Contraparte {shortPubkey(pubkey)}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
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
        <div className="space-y-4">
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
            className="min-h-64 max-h-[28rem] space-y-3 overflow-y-auto rounded border border-line bg-paper p-4"
            aria-live="polite"
          >
            {messages.length === 0 && (
              <div className="grid min-h-56 place-items-center text-center text-sm text-ink/50">
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
                      ? "ml-auto border border-bitcoin/45 bg-[#332b22] text-ink"
                      : item.direction === "outgoing"
                        ? "ml-auto bg-accent text-[#182012]"
                        : "mr-auto border border-line bg-raised text-ink"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{item.text}</p>
                  <p className={`mt-1 text-right text-[11px] ${item.direction === "outgoing" && !legacyUnconfirmed ? "text-[#182012]/65" : "text-ink/45"}`}>
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

          <div className="space-y-3">
            <label htmlFor={`chat-message-${orderId}`} className="sr-only">Mensaje</label>
            <TextArea
              id={`chat-message-${orderId}`}
              className="min-h-20 resize-y"
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
              <span className="text-xs text-ink/45">{message.length}/1000</span>
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
    </Card>
  );
}
