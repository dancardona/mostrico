import { describe, expect, it } from "vitest";
import { formatAmountInput, formatFiatAmount, formatFiatRange, formatNumber, formatPercentage, normalizeFiatInput } from "@/lib/format";

describe("number formatting", () => {
  it("groups whole satoshi amounts without adding decimal places", () => {
    expect(formatNumber(2224, 0)).toBe("2.224");
    expect(formatNumber(1234567, 0)).toBe("1.234.567");
    expect(formatNumber(0, 0)).toBe("0");
  });

  it("formats fiat values with Colombian separators and a currency code", () => {
    expect(formatFiatAmount("50000", "COP")).toBe("50.000 COP");
    expect(formatFiatAmount("1234.50", "USD")).toBe("1.234,50 USD");
    expect(formatFiatRange("50000", "150000", "COP")).toBe("50.000 COP - 150.000 COP");
  });

  it("formats percentage values consistently", () => {
    expect(formatPercentage(1.5)).toBe("1,5 %");
  });

  it("formats amount fields while preserving CLI-compatible normalization", () => {
    expect(formatAmountInput("150000")).toBe("150.000");
    expect(formatAmountInput("1.0000")).toBe("10.000");
    expect(formatAmountInput("2100000")).toBe("2.100.000");
    expect(normalizeFiatInput(formatAmountInput("150000") || "")).toBe("150000");
  });

  it("keeps localized decimal input readable", () => {
    expect(formatAmountInput("100000,50", true)).toBe("100.000,50");
    expect(formatAmountInput("100000.50", true)).toBe("100.000,50");
    expect(formatAmountInput("100.000,", true)).toBe("100.000,");
  });

  it("normalizes common localized fiat inputs for mostro-cli", () => {
    expect(normalizeFiatInput("100.000")).toBe("100000");
    expect(normalizeFiatInput("100.000,50")).toBe("100000.50");
    expect(normalizeFiatInput("100000,50")).toBe("100000.50");
    expect(normalizeFiatInput("100000.50")).toBe("100000.50");
    expect(normalizeFiatInput("COP 100.000")).toBeUndefined();
  });
});
