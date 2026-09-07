import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "mostrico-payout-test-"));
  vi.stubEnv("MOSTRO_STATE_PATH", path.join(directory, "state.json"));
  vi.resetModules();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it("persists payout metadata across reloads and rejects a stale poll after invoice acceptance", async () => {
  const { upsertTrade } = await import("@/lib/store/local-state");
  await upsertTrade("test-order", { lastKnownStep: "waiting_for_payout", payoutSats: 2224, payoutEventAt: 2000, lastMessageSyncAt: 2100 });
  await upsertTrade("test-order", { lastKnownStep: "needs_payout_invoice", payoutEventAt: 1000, payoutSats: 2231 });
  vi.resetModules();
  const { getTrade } = await import("@/lib/store/local-state");
  expect(await getTrade("test-order")).toMatchObject({ lastKnownStep: "waiting_for_payout", payoutSats: 2224, payoutEventAt: 2000, lastMessageSyncAt: 2100 });
});

it("keeps confirmed payment terminal even when an older command finishes later", async () => {
  const { getTrade, upsertTrade } = await import("@/lib/store/local-state");
  await upsertTrade("test-order", { lastKnownStep: "completed", payoutConfirmed: true });
  await upsertTrade("test-order", { lastKnownStep: "waiting_for_payout", payoutEventAt: 3000 });
  expect(await getTrade("test-order")).toMatchObject({ lastKnownStep: "completed", payoutConfirmed: true });
});
