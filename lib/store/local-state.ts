import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ChatMessage, LocalTradeMetadata } from "@/lib/mostro/types";

interface LocalState {
  trades: Record<string, LocalTradeMetadata>;
}

const statePath = process.env.MOSTRO_STATE_PATH
  ? path.resolve(process.env.MOSTRO_STATE_PATH)
  : path.join(process.cwd(), "data", "local-state.json");

const stateScope = globalThis as typeof globalThis & {
  __mostricoStateQueue?: Promise<void>;
};

function mutateState(update: (state: LocalState) => void | Promise<void>) {
  const current = stateScope.__mostricoStateQueue ?? Promise.resolve();
  const mutation = current.then(async () => {
    const state = await readState();
    await update(state);
    await writeState(state);
  });
  stateScope.__mostricoStateQueue = mutation.then(() => undefined, () => undefined);
  return mutation;
}

async function readState(): Promise<LocalState> {
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw) as LocalState;
  } catch {
    return { trades: {} };
  }
}

async function writeState(state: LocalState) {
  await mkdir(path.dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, statePath);
}

export async function upsertTrade(orderId: string, metadata: Partial<LocalTradeMetadata>) {
  let updated: LocalTradeMetadata | undefined;
  await mutateState((state) => {
    state.trades[orderId] = {
      createdAt: metadata.createdAt ?? state.trades[orderId]?.createdAt ?? new Date().toISOString(),
      currency: metadata.currency ?? state.trades[orderId]?.currency ?? "COP",
      role: metadata.role ?? state.trades[orderId]?.role,
      kind: metadata.kind ?? state.trades[orderId]?.kind,
      selectedFiatAmount: metadata.selectedFiatAmount ?? state.trades[orderId]?.selectedFiatAmount,
      satsAmount: metadata.satsAmount ?? state.trades[orderId]?.satsAmount,
      paymentMethods: metadata.paymentMethods ?? state.trades[orderId]?.paymentMethods,
      premiumPct: metadata.premiumPct ?? state.trades[orderId]?.premiumPct,
      expirationDays: metadata.expirationDays ?? state.trades[orderId]?.expirationDays,
      counterpartyPubkey: metadata.counterpartyPubkey ?? state.trades[orderId]?.counterpartyPubkey,
      chatMessages: metadata.chatMessages ?? state.trades[orderId]?.chatMessages,
      lastKnownStep: metadata.lastKnownStep ?? state.trades[orderId]?.lastKnownStep ?? "unknown"
    };
    updated = state.trades[orderId];
  });
  return updated as LocalTradeMetadata;
}

export async function getTrade(orderId: string) {
  await (stateScope.__mostricoStateQueue ?? Promise.resolve());
  const state = await readState();
  return state.trades[orderId];
}

export async function appendChatMessage(orderId: string, message: ChatMessage) {
  return mergeChatMessages(orderId, [message]);
}

export async function mergeChatMessages(orderId: string, incoming: ChatMessage[]) {
  let messages: ChatMessage[] = [];
  await mutateState((state) => {
    const trade = state.trades[orderId];
    if (!trade) throw new Error(`Unknown local trade ${orderId}`);
    const existing = trade.chatMessages ?? [];
    const incomingIds = new Set(incoming.map((message) => message.id));
    messages = [...existing.filter((item) => !incomingIds.has(item.id)), ...incoming]
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .slice(-200);
    trade.chatMessages = messages;
  });
  return messages;
}
