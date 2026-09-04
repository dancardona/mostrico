import { describe, expect, it, vi } from "vitest";
import { getPublicKey } from "nostr-tools";
import {
  createChatEnvelope,
  deriveChatKeys,
  notifyPeerDevice,
  unwrapChatEnvelope
} from "@/lib/mostro/chat-transport";

const aliceSecret = "548f68890c49fa42f104c60352395e60ff030b0b407e955f1eed1400d6c0347a";
const alicePubkey = "000053c3b4773182e7c4c1b72b272d34be01bf4414a6a25c998977c516a46a01";
const bobSecret = "f258e73f07386d37133718b6127f873dd7c391b8f43b331ff8254034a13d2943";
const bobPubkey = "000009ae5cff9f6ba9b05159ec5ed58c187f5882ea77c81ed5dd19163272a5d7";

describe("Mostro chat transport", () => {
  it("matches the protocol key-derivation vector from both sides", () => {
    const alice = deriveChatKeys(aliceSecret, bobPubkey);
    const bob = deriveChatKeys(bobSecret, alicePubkey);

    expect(alice.convPubkey).toBe("bceb1cd2a8e98ee9729122a1693edcc39c3ace04582ff96a26705c5e4078a6f2");
    expect(alice.signPubkey).toBe("1dba04571059183f76b148119cfa6f8004dad30cb4e810180a6df17386a7f0b4");
    expect(bob.convPubkey).toBe(alice.convPubkey);
    expect(bob.signPubkey).toBe(alice.signPubkey);
  });

  it("round-trips a signed kind-14 envelope and authenticates the peer", () => {
    const alice = deriveChatKeys(aliceSecret, bobPubkey);
    const bob = deriveChatKeys(bobSecret, alicePubkey);
    const createdAt = 1_788_481_308;
    const { outer } = createChatEnvelope(alice, "Hola", createdAt);
    const inner = unwrapChatEnvelope(outer, bob, createdAt);

    expect(inner).toMatchObject({
      kind: 1,
      pubkey: alicePubkey,
      content: "Hola",
      created_at: createdAt
    });
  });

  it("rejects a validly encrypted message signed by a third-party trade key", () => {
    const alice = deriveChatKeys(aliceSecret, bobPubkey);
    const bob = deriveChatKeys(bobSecret, alicePubkey);
    const attackerSecret = Uint8Array.from(Buffer.from("3".repeat(64), "hex"));
    const forgedAlice = {
      ...alice,
      tradeSecret: attackerSecret,
      ownPubkey: getPublicKey(attackerSecret)
    };
    const createdAt = 1_788_481_308;
    const { outer } = createChatEnvelope(forgedAlice, "mensaje falso", createdAt);

    expect(unwrapChatEnvelope(outer, bob, createdAt)).toBeUndefined();
  });

  it("uses the same best-effort push wake-up contract as Mostro Mobile", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));

    await notifyPeerDevice(bobPubkey, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      "https://mostro-push-server.fly.dev/api/notify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ trade_pubkey: bobPubkey })
      })
    );
  });

  it("does not fail chat delivery when the optional push wake-up fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(notifyPeerDevice(bobPubkey, fetcher)).resolves.toBeUndefined();
  });
});
