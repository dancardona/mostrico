import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  finalizeEvent,
  getPublicKey,
  nip19,
  nip44,
  SimplePool,
  verifyEvent,
  type Event
} from "nostr-tools";
import { AppError, type ChatMessage } from "./types";

const maxLookbackMinutes = 7 * 24 * 60;
const maxClockSkewSeconds = 60;
const maxEncryptedBytes = 64 * 1024;
const maxRelayEvents = 100;
const convInfo = "mostro:chat:conv:v1";
const signInfo = "mostro:chat:sign:v1";
const defaultPushServerUrl = "https://mostro-push-server.fly.dev";

export interface ChatTransportInput {
  orderId: string;
  peerPubkey: string;
  relays: string[];
}

export interface ChatTransport {
  receive(input: ChatTransportInput & { since: number }): Promise<ChatMessage[]>;
  send(input: ChatTransportInput & { message: string }): Promise<ChatMessage>;
}

interface ChatKeys {
  tradeSecret: Uint8Array;
  ownPubkey: string;
  peerPubkey: string;
  convSecret: Uint8Array;
  convPubkey: string;
  signSecret: Uint8Array;
  signPubkey: string;
}

function bytesFromHex(value: string) {
  return Uint8Array.from(Buffer.from(value, "hex"));
}

function normalizePubkey(value: string) {
  if (/^[0-9a-f]{64}$/i.test(value)) return value.toLowerCase();
  try {
    const decoded = nip19.decode(value);
    if (decoded.type === "npub" && typeof decoded.data === "string") return decoded.data.toLowerCase();
  } catch {
    // The caller converts this into a domain-safe error below.
  }
  throw new AppError("VALIDATION_ERROR", "La pubkey de la contraparte no es válida.");
}

function deriveScalar(shared: Uint8Array, label: string) {
  const encodedLabel = new TextEncoder().encode(label);
  for (let counter = 0; counter <= 255; counter += 1) {
    const info = counter === 0
      ? encodedLabel
      : Uint8Array.from([...encodedLabel, counter]);
    const scalar = hkdf(sha256, shared, undefined, info, 32);
    try {
      getPublicKey(scalar);
      return scalar;
    } catch {
      // The protocol requires retrying with a counter for an invalid scalar.
    }
  }
  throw new AppError("MOSTRO_ERROR", "No se pudieron derivar las claves del chat.");
}

export function deriveChatKeys(tradeSecretHex: string, peerPubkeyValue: string): ChatKeys {
  if (!/^[0-9a-f]{64}$/i.test(tradeSecretHex)) {
    throw new AppError("MOSTRO_ERROR", "La operación no tiene una clave de intercambio válida.");
  }
  const peerPubkey = normalizePubkey(peerPubkeyValue);
  const tradeSecret = bytesFromHex(tradeSecretHex);
  const compressedPeer = bytesFromHex(`02${peerPubkey}`);
  const shared = secp256k1.getSharedSecret(tradeSecret, compressedPeer).subarray(1, 33);
  const convSecret = deriveScalar(shared, convInfo);
  const signSecret = deriveScalar(shared, signInfo);

  return {
    tradeSecret,
    ownPubkey: getPublicKey(tradeSecret),
    peerPubkey,
    convSecret,
    convPubkey: getPublicKey(convSecret),
    signSecret,
    signPubkey: getPublicKey(signSecret)
  };
}

export function createChatEnvelope(
  keys: ChatKeys,
  message: string,
  createdAt = Math.floor(Date.now() / 1000)
) {
  const inner = finalizeEvent({
    kind: 1,
    created_at: createdAt,
    content: message,
    tags: [["u", randomBytes(8).toString("hex")]]
  }, keys.tradeSecret);
  const conversationKey = nip44.v2.utils.getConversationKey(keys.convSecret, keys.convPubkey);
  const outer = finalizeEvent({
    kind: 14,
    created_at: createdAt,
    content: nip44.v2.encrypt(JSON.stringify(inner), conversationKey),
    tags: [["p", keys.convPubkey]]
  }, keys.signSecret);
  return { inner, outer };
}

export function unwrapChatEnvelope(outer: Event, keys: ChatKeys, now = Math.floor(Date.now() / 1000)) {
  if (outer.pubkey !== keys.signPubkey || outer.kind !== 14) return undefined;
  const pTags = outer.tags.filter((tag) => tag[0] === "p");
  if (pTags.length !== 1 || pTags[0][1] !== keys.convPubkey) return undefined;
  if (outer.created_at > now + maxClockSkewSeconds) return undefined;
  if (!outer.content || Buffer.byteLength(outer.content, "utf8") > maxEncryptedBytes) return undefined;
  if (!verifyEvent(outer)) return undefined;

  try {
    const conversationKey = nip44.v2.utils.getConversationKey(keys.convSecret, keys.convPubkey);
    const inner = JSON.parse(nip44.v2.decrypt(outer.content, conversationKey)) as Event;
    if (!verifyEvent(inner)) return undefined;
    if (inner.kind !== 1 || ![keys.ownPubkey, keys.peerPubkey].includes(inner.pubkey)) return undefined;
    if (Math.abs(inner.created_at - outer.created_at) > maxClockSkewSeconds) return undefined;
    if (!inner.content || inner.content.length > 1000) return undefined;
    return inner;
  } catch {
    return undefined;
  }
}

export async function notifyPeerDevice(
  peerPubkeyValue: string,
  fetcher: typeof fetch = fetch
) {
  try {
    const peerPubkey = normalizePubkey(peerPubkeyValue);
    const baseUrl = (process.env.MOSTRO_PUSH_SERVER_URL || defaultPushServerUrl).replace(/\/$/, "");
    await fetcher(`${baseUrl}/api/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trade_pubkey: peerPubkey }),
      signal: AbortSignal.timeout(5_000)
    });
  } catch {
    // Push is best-effort; relay publication remains the delivery source of truth.
  }
}

async function readTradeSecret(orderId: string) {
  const dbPath = process.env.MOSTRO_CLI_DB_PATH
    ? path.resolve(process.env.MOSTRO_CLI_DB_PATH)
    : path.join(homedir(), ".mcli", "mcli.db");
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const database = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = database.prepare("SELECT trade_keys FROM orders WHERE id = ?").get(orderId) as
        | { trade_keys?: unknown }
        | undefined;
      if (typeof row?.trade_keys === "string" && /^[0-9a-f]{64}$/i.test(row.trade_keys)) {
        return row.trade_keys;
      }
    } finally {
      database.close();
    }
  } catch {
    // Keep secrets and database details out of API errors.
  }
  throw new AppError(
    "ORDER_NOT_FOUND",
    "No encontramos las claves locales de esta operación.",
    { title: "Chat no disponible", hint: "Restaura la operación en mostro-cli y vuelve a intentarlo." }
  );
}

function toChatMessage(inner: Event, ownPubkey: string): ChatMessage {
  return {
    id: `chat-${inner.id}`,
    direction: inner.pubkey === ownPubkey ? "outgoing" : "incoming",
    text: inner.content,
    timestamp: new Date(inner.created_at * 1000).toISOString()
  };
}

export class NativeMostroChatTransport implements ChatTransport {
  async receive(input: ChatTransportInput & { since: number }) {
    const secret = await readTradeSecret(input.orderId);
    const keys = deriveChatKeys(secret, input.peerPubkey);
    const sinceMinutes = Math.min(Math.max(input.since, 1), maxLookbackMinutes);
    const pool = new SimplePool();
    let events: Event[] = [];
    try {
      events = await pool.querySync(input.relays, {
        kinds: [14],
        authors: [keys.signPubkey],
        since: Math.floor(Date.now() / 1000) - sinceMinutes * 60,
        limit: maxRelayEvents
      }, { maxWait: 10_000 });
    } finally {
      pool.close(input.relays);
    }

    const seen = new Set<string>();
    return events.flatMap((outer) => {
      const inner = unwrapChatEnvelope(outer, keys);
      if (!inner || seen.has(inner.id)) return [];
      seen.add(inner.id);
      return [toChatMessage(inner, keys.ownPubkey)];
    }).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }

  async send(input: ChatTransportInput & { message: string }) {
    const secret = await readTradeSecret(input.orderId);
    const keys = deriveChatKeys(secret, input.peerPubkey);
    const { inner, outer } = createChatEnvelope(keys, input.message);
    const pool = new SimplePool();
    try {
      const results = await Promise.allSettled(pool.publish(input.relays, outer, { maxWait: 10_000 }));
      if (!results.some((result) => result.status === "fulfilled")) {
        throw new AppError(
          "NETWORK_ERROR",
          "Ningún relay confirmó el mensaje.",
          { title: "Mensaje no enviado", hint: "Revisa la conexión con los relays y vuelve a intentarlo." }
        );
      }
      void notifyPeerDevice(keys.peerPubkey);
    } finally {
      pool.close(input.relays);
    }
    return toChatMessage(inner, keys.ownPubkey);
  }
}

class MockChatTransport implements ChatTransport {
  async receive() {
    return [];
  }

  async send(input: ChatTransportInput & { message: string }) {
    return {
      id: `chat-mock-${randomBytes(8).toString("hex")}`,
      direction: "outgoing" as const,
      text: input.message,
      timestamp: new Date().toISOString()
    };
  }
}

export function getChatTransport(): ChatTransport {
  return process.env.MOSTRO_WEB_MOCK_CLI === "1"
    ? new MockChatTransport()
    : new NativeMostroChatTransport();
}
