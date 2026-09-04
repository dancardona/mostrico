const invoicePattern = /\b(?:lnbc|lntb|lnbcrt|lnurl)[a-z0-9]{20,}\b/gi;
const nsecPattern = /\bnsec1[a-z0-9]{20,}\b/gi;
const privateHexPattern = /\b[0-9a-f]{64}\b/gi;
const labeledMnemonicPattern =
  /(\b(?:mnemonic|seed phrase)\s*[:=]\s*)([a-z]+(?:\s+[a-z]+){11,23})\b/gi;

function shorten(value: string, keep = 10) {
  return `${value.slice(0, keep)}...[redacted]`;
}

export function redactSensitive(
  input: string,
  options: { preserveInvoices?: boolean; preservePeerPubkeys?: boolean } = {}
) {
  const preservedPeerPubkeys: string[] = [];
  const peerSafe = options.preservePeerPubkeys
    ? input.split(/(\r?\n)/).map((line) => {
        const visibleLine = line.replace(/\u001b\[[0-9;]*m/g, "");
        const pubkey = visibleLine.match(/^\s*(?:👤\s*)?Peer:\s*([0-9a-f]{64})\s*$/i)?.[1];
        if (pubkey) {
          const token = `MOSTRICOPEERKEY${preservedPeerPubkeys.length}TOKEN`;
          preservedPeerPubkeys.push(pubkey);
          return line.replace(pubkey, token);
        }
        return line;
      }).join("")
    : input;
  const invoiceSafe = options.preserveInvoices ? peerSafe : peerSafe.replace(invoicePattern, (match) => shorten(match, 12));
  const redacted = invoiceSafe
    .replace(nsecPattern, (match) => shorten(match, 8))
    .replace(privateHexPattern, "[redacted-hex-key]")
    .replace(labeledMnemonicPattern, "$1[redacted-mnemonic]");
  return preservedPeerPubkeys.reduce(
    (result, pubkey, index) => result.replace(`MOSTRICOPEERKEY${index}TOKEN`, pubkey),
    redacted
  );
}
