import { describe, expect, it } from "vitest";
import { formatMoney } from "./money.js";

function currencyFormat(amount: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(
    amount
  );
}

describe("formatMoney", () => {
  it("divides by 100 for a two-decimal currency (EUR)", () => {
    expect(formatMoney(1050, "EUR")).toBe(currencyFormat(10.5, "EUR"));
  });

  it("does not divide for a zero-decimal currency (XOF)", () => {
    expect(formatMoney(1500, "XOF")).toBe(currencyFormat(1500, "XOF"));
  });
});
