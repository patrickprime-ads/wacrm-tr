/** Configuração única de moeda para o CRM brasileiro. */
export const DEFAULT_CURRENCY = "BRL";

export interface CurrencyOption {
  code: string;
  label: string;
  symbol: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: "BRL", label: "Real brasileiro", symbol: "R$" },
];

export function formatCurrency(value: number, currency: string = DEFAULT_CURRENCY): string {
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || DEFAULT_CURRENCY,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: DEFAULT_CURRENCY,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
}

export function formatCurrencyShort(value: number, _currency: string = DEFAULT_CURRENCY): string {
  const amount = Number(value || 0);
  if (amount >= 1_000_000) return `R$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `R$${(amount / 1_000).toFixed(1)}mil`;
  return `R$${amount.toFixed(0)}`;
}
