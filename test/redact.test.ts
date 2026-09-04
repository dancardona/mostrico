import { describe, expect, it } from "vitest";
import { redactSensitive } from "@/lib/mostro/redact";

describe("redaction", () => {
  it("redacts invoices, nsec, private hex keys and mnemonic-like text", () => {
    const redacted = redactSensitive([
      "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka",
      "nsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
      "a".repeat(64),
      "mnemonic: abandon ability able about above absent absorb abstract absurd abuse access accident"
    ].join(" "));
    expect(redacted).toContain("[redacted]");
    expect(redacted).toContain("[redacted-hex-key]");
    expect(redacted).toContain("[redacted-mnemonic]");
    expect(redacted).not.toContain("nsec1qqqq");
  });

  it("does not mistake a normal lowercase error sentence for a mnemonic", () => {
    const error = "no rows returned by a query that expected to return at least one row";
    expect(redactSensitive(error)).toBe(error);
  });

  it("can preserve a payable invoice while still redacting private keys", () => {
    const invoice = "lnbc1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3qpp5qqqsyqcyq5rqwzqfka";
    const output = redactSensitive(`${invoice} ${"a".repeat(64)}`, { preserveInvoices: true });
    expect(output).toContain(invoice);
    expect(output).toContain("[redacted-hex-key]");
  });

  it("can preserve an explicitly labeled peer key without preserving arbitrary hex secrets", () => {
    const peer = "1".repeat(64);
    const secret = "2".repeat(64);
    const result = redactSensitive(`   👤 Peer: ${peer}\nTrade Keys: ${secret}`, { preservePeerPubkeys: true });

    expect(result).toContain(`Peer: ${peer}`);
    expect(result).not.toContain(secret);
    expect(result).toContain("[redacted-hex-key]");
  });

  it("preserves a peer key when the CLI wraps its label in ANSI colors", () => {
    const peer = "1".repeat(64);
    const result = redactSensitive(`   \u001b[32m👤 Peer:\u001b[0m ${peer}\n`, { preservePeerPubkeys: true });

    expect(result).toContain(peer);
  });
});
