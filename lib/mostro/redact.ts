const invoicePattern = /\b(?:lnbc|lntb|lnbcrt|lnurl)[a-z0-9]{20,}\b/gi;
const nsecPattern = /\bnsec1[a-z0-9]{20,}\b/gi;
const privateHexPattern = /\b[0-9a-f]{64}\b/gi;
const labeledMnemonicPattern =
  /(\b(?:mnemonic|seed phrase)\s*[:=]\s*)([a-z]+(?:\s+[a-z]+){11,23})\b/gi;

function shorten(value: string, keep = 10) {
  return `${value.slice(0, keep)}...[redacted]`;
}

export function redactSensitive(input: string, options: { preserveInvoices?: boolean } = {}) {
  const invoiceSafe = options.preserveInvoices ? input : input.replace(invoicePattern, (match) => shorten(match, 12));
  return invoiceSafe
    .replace(nsecPattern, (match) => shorten(match, 8))
    .replace(privateHexPattern, "[redacted-hex-key]")
    .replace(labeledMnemonicPattern, "$1[redacted-mnemonic]");
}
