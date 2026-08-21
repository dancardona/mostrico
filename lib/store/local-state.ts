import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { LocalTradeMetadata } from "@/lib/mostro/types";

interface LocalState {
  trades: Record<string, LocalTradeMetadata>;
}

const statePath = process.env.MOSTRO_STATE_PATH
  ? path.resolve(process.env.MOSTRO_STATE_PATH)
  : path.join(process.cwd(), "data", "local-state.json");

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
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tempPath, statePath);
}

export async function upsertTrade(orderId: string, metadata: Partial<LocalTradeMetadata>) {
  const state = await readState();
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
    lastKnownStep: metadata.lastKnownStep ?? state.trades[orderId]?.lastKnownStep ?? "unknown"
  };
  await writeState(state);
  return state.trades[orderId];
}

export async function getTrade(orderId: string) {
  const state = await readState();
  return state.trades[orderId];
}
