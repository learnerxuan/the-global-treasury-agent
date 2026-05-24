import type { CurrencyCode } from "../types";

// Local, date-aware FX reference fixture. The MVP never depends on a live FX
// network call — these rates explain received amounts as a *reference*, not as
// proof of the bank's internal settlement rate.

export type FxRateEntry = { date: string; rate: string };

// All tables MUST stay sorted ascending by date (asserted in tests).
export const USD_MYR_RATES: FxRateEntry[] = [
  { date: "2026-05-01", rate: "4.2000" },
  { date: "2026-05-18", rate: "4.2200" },
  { date: "2026-05-20", rate: "4.2500" },
  { date: "2026-05-21", rate: "4.2400" }
];

export const SGD_MYR_RATES: FxRateEntry[] = [
  { date: "2026-05-01", rate: "3.1200" },
  { date: "2026-05-20", rate: "3.1500" },
  { date: "2026-05-21", rate: "3.1450" }
];

export const EUR_MYR_RATES: FxRateEntry[] = [
  { date: "2026-05-01", rate: "4.5800" },
  { date: "2026-05-20", rate: "4.6200" }
];

const FX_TABLES: Partial<Record<string, FxRateEntry[]>> = {
  USD_MYR: USD_MYR_RATES,
  SGD_MYR: SGD_MYR_RATES,
  EUR_MYR: EUR_MYR_RATES
};

export type FxRateSource = "same_currency" | "fixture_exact" | "fixture_nearest";

export type FxRateLookup = {
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: string;
  rateDate: string;
  source: FxRateSource;
  isFallback: boolean;
};

function toDateKey(date: string): string {
  return date.slice(0, 10);
}

function dayDistance(a: string, b: string): number {
  const msA = new Date(`${a}T00:00:00.000Z`).getTime();
  const msB = new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.abs(msA - msB);
}

export function lookupFxRate(input: {
  base: CurrencyCode;
  quote: CurrencyCode;
  date: string;
}): FxRateLookup | null {
  const { base, quote } = input;
  const date = toDateKey(input.date);

  if (base === quote) {
    return { base, quote, rate: "1", rateDate: date, source: "same_currency", isFallback: false };
  }

  const table = FX_TABLES[`${base}_${quote}`];
  if (!table || table.length === 0) return null;

  const exact = table.find((entry) => entry.date === date);
  if (exact) {
    return { base, quote, rate: exact.rate, rateDate: exact.date, source: "fixture_exact", isFallback: false };
  }

  // Nearest dated rate. Table is sorted ascending, so iterating with strict
  // "<" keeps the earlier date on ties.
  let nearest = table[0]!;
  let nearestDistance = dayDistance(date, nearest.date);
  for (const entry of table) {
    const distance = dayDistance(date, entry.date);
    if (distance < nearestDistance) {
      nearest = entry;
      nearestDistance = distance;
    }
  }

  return { base, quote, rate: nearest.rate, rateDate: nearest.date, source: "fixture_nearest", isFallback: true };
}
