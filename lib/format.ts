const DISPLAY_LOCALE = "es-CO";

function fractionDigits(value: string) {
  const fraction = value.split(".")[1];
  return fraction ? Math.min(fraction.length, 8) : 0;
}

export function formatNumber(value: string | number | undefined, maximumFractionDigits = 8) {
  if (value === undefined || value === "") return undefined;
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return undefined;

  const minimumFractionDigits = typeof value === "string" ? fractionDigits(value) : 0;
  return new Intl.NumberFormat(DISPLAY_LOCALE, {
    minimumFractionDigits,
    maximumFractionDigits: Math.max(minimumFractionDigits, maximumFractionDigits)
  }).format(numericValue);
}

export function formatFiatAmount(value: string | undefined, currency: string) {
  const formatted = formatNumber(value);
  if (!formatted) return undefined;
  return `${formatted} ${currency.toUpperCase()}`;
}

export function formatFiatRange(minimum: string | undefined, maximum: string | undefined, currency: string) {
  const min = formatFiatAmount(minimum, currency);
  const max = formatFiatAmount(maximum, currency);
  if (min && max) return `${min} - ${max}`;
  return min || max;
}

export function formatPercentage(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return `${formatNumber(value)} %`;
}

function groupIntegerDigits(value: string) {
  const normalized = value.replace(/^0+(?=\d)/, "") || "0";
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatAmountInput(value: string, allowDecimals = false) {
  const compact = value.trim().replace(/\s/g, "");
  if (!compact) return "";
  if (!/^[\d.,]+$/.test(compact)) return undefined;

  let integerPart = compact;
  let fractionPart: string | undefined;

  if (allowDecimals) {
    const commaIndex = compact.lastIndexOf(",");
    if (commaIndex >= 0) {
      integerPart = compact.slice(0, commaIndex);
      fractionPart = compact.slice(commaIndex + 1).replace(/[.,]/g, "");
    } else {
      const dotParts = compact.split(".");
      const integerDigits = dotParts[0].replace(/\D/g, "");
      const possibleFraction = dotParts[1];
      const pastedDecimal = dotParts.length === 2
        && possibleFraction.length > 0
        && possibleFraction.length !== 3
        && (possibleFraction.length <= 2 || integerDigits.length > 3);

      if (pastedDecimal) {
        integerPart = dotParts[0];
        fractionPart = possibleFraction;
      }
    }
  }

  const integerDigits = integerPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(integerDigits) || (fractionPart !== undefined && !/^\d{0,8}$/.test(fractionPart))) return undefined;

  const formattedInteger = groupIntegerDigits(integerDigits || "0");
  return fractionPart === undefined ? formattedInteger : `${formattedInteger},${fractionPart}`;
}

export function normalizeFiatInput(value: string) {
  const compact = value.trim().replace(/\s/g, "");
  if (!compact || !/^\d[\d.,]*$/.test(compact)) return undefined;

  const lastDot = compact.lastIndexOf(".");
  const lastComma = compact.lastIndexOf(",");
  let integer = compact;
  let fraction = "";

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalIndex = Math.max(lastDot, lastComma);
    integer = compact.slice(0, decimalIndex).replace(/[.,]/g, "");
    fraction = compact.slice(decimalIndex + 1);
  } else if (lastComma >= 0) {
    integer = compact.slice(0, lastComma).replace(/,/g, "");
    fraction = compact.slice(lastComma + 1);
  } else if (lastDot >= 0) {
    const groups = compact.split(".");
    const looksGrouped = groups.length > 2
      ? groups.slice(1).every((group) => group.length === 3)
      : groups[1]?.length === 3 && groups[0].length <= 3;

    if (looksGrouped) {
      integer = groups.join("");
    } else {
      integer = groups.slice(0, -1).join("");
      fraction = groups.at(-1) || "";
    }
  }

  if (!/^\d+$/.test(integer) || (fraction && !/^\d{1,8}$/.test(fraction))) return undefined;
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  return fraction ? `${normalizedInteger}.${fraction}` : normalizedInteger;
}
