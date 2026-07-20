/**
 * Les prix de l'API Yodoo sont des entiers dans la plus petite unité de la
 * devise (ex. centimes). L'exposant varie selon la devise (EUR a 2, XOF a
 * 0), donc on le dérive d'Intl plutôt que d'une table de devises maintenue à la main.
 */
export function formatMoney(
  amountMinorUnits: number,
  currency: string,
  locale = "fr-FR"
): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const amount = amountMinorUnits / 10 ** fractionDigits;
  return formatter.format(amount);
}
