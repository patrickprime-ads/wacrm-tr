import { describe, expect, it } from "vitest";
import { CURRENCIES, DEFAULT_CURRENCY, formatCurrency, formatCurrencyShort } from "./currency";

describe("moeda brasileira", () => {
  it("oferece somente BRL", () => {
    expect(DEFAULT_CURRENCY).toBe("BRL");
    expect(CURRENCIES).toEqual([{ code: "BRL", label: "Real brasileiro", symbol: "R$" }]);
  });

  it("formata valores em reais", () => {
    expect(formatCurrency(1234)).toContain("R$");
    expect(formatCurrency(1234)).toContain("1.234");
  });

  it("abrevia valores em reais", () => {
    expect(formatCurrencyShort(2_500_000)).toBe("R$2.5M");
    expect(formatCurrencyShort(3_400)).toBe("R$3.4mil");
    expect(formatCurrencyShort(900)).toBe("R$900");
  });
});
