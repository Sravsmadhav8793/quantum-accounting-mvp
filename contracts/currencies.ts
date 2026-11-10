/**
 * Multi-currency support.
 * Rates are a static reference table (units of currency per 1 USD), refreshed
 * periodically by the app maintainers. All reporting converts to the user's
 * base currency through USD as the pivot.
 */

export interface CurrencyDef {
  code: string;
  name: string;
  symbol: string;
  /** units of this currency per 1 USD */
  ratePerUsd: number;
  decimals: number;
}

export const CURRENCIES: CurrencyDef[] = [
  { code: "USD", name: "US Dollar", symbol: "$", ratePerUsd: 1, decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", ratePerUsd: 0.92, decimals: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", ratePerUsd: 0.79, decimals: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", ratePerUsd: 84.2, decimals: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", ratePerUsd: 3.67, decimals: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", ratePerUsd: 1.32, decimals: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", ratePerUsd: 149.5, decimals: 0 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", ratePerUsd: 7.1, decimals: 2 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", ratePerUsd: 7.78, decimals: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", ratePerUsd: 1.48, decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", ratePerUsd: 1.36, decimals: 2 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", ratePerUsd: 0.84, decimals: 2 },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

const byCode = new Map(CURRENCIES.map((c) => [c.code, c]));

export function getCurrency(code: string): CurrencyDef {
  return byCode.get(code) ?? byCode.get("USD")!;
}

/** Convert an amount between currencies (pivot via USD). */
export function convertCurrency(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const f = getCurrency(from);
  const t = getCurrency(to);
  return (amount / f.ratePerUsd) * t.ratePerUsd;
}

export function formatMoney(amount: number, currency: string): string {
  const c = getCurrency(currency);
  const formatted = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  });
  const sign = amount < 0 ? "−" : "";
  return `${sign}${c.symbol}${formatted}`;
}

/** Compact form for KPI cards: $12.4K */
export function formatMoneyCompact(amount: number, currency: string): string {
  const c = getCurrency(currency);
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${c.symbol}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}${c.symbol}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${c.symbol}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
