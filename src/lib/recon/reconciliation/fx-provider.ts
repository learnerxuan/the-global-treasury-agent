import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CurrencyCode, NormalizedInputBatch } from "../types";
import { lookupFxRate, type FxRateLookup } from "./fx-table";

export type FxProviderRate = FxRateLookup & {
  providerId: string;
};

export type FxRateLookupInput = {
  base: CurrencyCode;
  quote: CurrencyCode;
  date: string;
};

export type FxRateProvider = {
  providerId: string;
  lookup(input: FxRateLookupInput): FxProviderRate | null;
};

export type FxRateCache = {
  get(input: FxRateLookupInput & { providerId: string }): FxProviderRate | null;
  set(input: FxRateLookupInput & { providerId: string }, rate: FxProviderRate): void;
};

type BnmFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type BnmFetch = (url: string, init: { headers: Record<string, string> }) => Promise<BnmFetchResponse>;

type BnmApiRateRow = {
  currency_code?: string;
  unit?: number;
  rate?: {
    date?: string;
    buying_rate?: number | null;
    selling_rate?: number | null;
    middle_rate?: number | null;
  };
};

const defaultBnmFetch: BnmFetch = (url, init) => globalThis.fetch(url, init) as Promise<BnmFetchResponse>;

function dateKey(date: string): string {
  return date.slice(0, 10);
}

function cacheKey(input: FxRateLookupInput & { providerId: string }): string {
  return `${input.providerId}_${input.base}_${input.quote}_${dateKey(input.date)}`;
}

export class FixtureFxRateProvider implements FxRateProvider {
  providerId = "fixture";

  lookup(input: FxRateLookupInput): FxProviderRate | null {
    const rate = lookupFxRate(input);
    return rate ? { ...rate, providerId: this.providerId } : null;
  }
}

export class LocalJsonFxRateCache implements FxRateCache {
  constructor(private readonly dir: string) {}

  get(input: FxRateLookupInput & { providerId: string }): FxProviderRate | null {
    const path = join(this.dir, `${cacheKey(input)}.json`);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as FxProviderRate;
    } catch {
      return null;
    }
  }

  set(input: FxRateLookupInput & { providerId: string }, rate: FxProviderRate): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, `${cacheKey(input)}.json`), `${JSON.stringify(rate, null, 2)}\n`, "utf8");
  }
}

export class CachedFxRateProvider implements FxRateProvider {
  readonly providerId: string;

  constructor(
    private readonly provider: FxRateProvider,
    private readonly cache: FxRateCache
  ) {
    this.providerId = provider.providerId;
  }

  lookup(input: FxRateLookupInput): FxProviderRate | null {
    const cacheInput = { ...input, providerId: this.providerId };
    const cached = this.cache.get(cacheInput);
    if (cached) return cached;
    const rate = this.provider.lookup(input);
    if (rate) this.cache.set(cacheInput, rate);
    return rate;
  }
}

export class CompositeFxRateProvider implements FxRateProvider {
  readonly providerId: string;

  constructor(private readonly providers: FxRateProvider[]) {
    this.providerId = providers.map((provider) => provider.providerId).join("+") || "empty";
  }

  lookup(input: FxRateLookupInput): FxProviderRate | null {
    for (const provider of this.providers) {
      const rate = provider.lookup(input);
      if (rate) return rate;
    }
    return null;
  }
}

export class BnmFxRateProvider implements FxRateProvider {
  providerId = "bnm";

  constructor(
    private readonly cache: FxRateCache,
    private readonly fetchFn: BnmFetch = defaultBnmFetch
  ) {}

  lookup(input: FxRateLookupInput): FxProviderRate | null {
    return this.cache.get({ ...input, providerId: this.providerId });
  }

  async hydrate(input: FxRateLookupInput): Promise<FxProviderRate | null> {
    const cached = this.lookup(input);
    if (cached) return cached;

    const rate = await this.fetchRate(input);
    if (rate) this.cache.set({ ...input, providerId: this.providerId }, rate);
    return rate;
  }

  private async fetchRate(input: FxRateLookupInput): Promise<FxProviderRate | null> {
    if (input.base === input.quote) {
      return {
        base: input.base,
        quote: input.quote,
        rate: "1",
        rateDate: input.date.slice(0, 10),
        source: "same_currency",
        providerId: this.providerId,
        isFallback: false
      };
    }

    if (input.quote === "MYR") {
      const baseToMyr = await this.resolveCurrencyToMyr(input.base, input.date);
      return baseToMyr ? this.asProviderRate(input, baseToMyr) : null;
    }

    if (input.base === "MYR") {
      const quoteToMyr = await this.resolveCurrencyToMyr(input.quote, input.date);
      if (!quoteToMyr) return null;
      return this.asProviderRate(input, { rate: divideRate("1", quoteToMyr.rate), rateDate: quoteToMyr.rateDate });
    }

    const [baseToMyr, quoteToMyr] = await Promise.all([
      this.resolveCurrencyToMyr(input.base, input.date),
      this.resolveCurrencyToMyr(input.quote, input.date)
    ]);
    if (!baseToMyr || !quoteToMyr) return null;
    return this.asProviderRate(input, {
      rate: divideRate(baseToMyr.rate, quoteToMyr.rate),
      rateDate: baseToMyr.rateDate
    });
  }

  private asProviderRate(input: FxRateLookupInput, value: { rate: string; rateDate: string }): FxProviderRate {
    return {
      base: input.base,
      quote: input.quote,
      rate: value.rate,
      rateDate: value.rateDate,
      source: "live_api",
      providerId: this.providerId,
      isFallback: false
    };
  }

  private async resolveCurrencyToMyr(currency: CurrencyCode, date: string): Promise<{ rate: string; rateDate: string } | null> {
    const input = { base: currency, quote: "MYR" as const, date: dateKey(date) };
    const cached = this.cache.get({ ...input, providerId: this.providerId });
    if (cached) return { rate: cached.rate, rateDate: cached.rateDate };

    const rate = await this.fetchCurrencyToMyr(currency, date);
    if (rate) this.cache.set({ ...input, providerId: this.providerId }, this.asProviderRate(input, rate));
    return rate;
  }

  private async fetchCurrencyToMyr(currency: CurrencyCode, date: string): Promise<{ rate: string; rateDate: string } | null> {
    if (currency === "MYR") return { rate: "1", rateDate: dateKey(date) };
    const url = `https://api.bnm.gov.my/public/exchange-rate/${currency}/date/${dateKey(date)}?session=1700&quote=rm`;
    const response = await this.fetchFn(url, {
      headers: {
        Accept: "application/vnd.BNM.API.v1+json",
        "User-Agent": "ReconPilot/0.1"
      }
    });
    if (!response.ok) return null;
    return bnmPayloadToMyrRate(await response.json(), currency, dateKey(date));
  }
}

export const defaultFxRateProvider = new FixtureFxRateProvider();

export function createRuntimeBnmFxProvider(cacheDir: string): { bnmProvider: BnmFxRateProvider; provider: FxRateProvider } {
  const bnmProvider = new BnmFxRateProvider(new LocalJsonFxRateCache(cacheDir));
  return {
    bnmProvider,
    provider: new CompositeFxRateProvider([bnmProvider, defaultFxRateProvider])
  };
}

export async function hydrateBnmRatesForBatch(batch: NormalizedInputBatch, provider: BnmFxRateProvider): Promise<void> {
  const inputs = new Map<string, FxRateLookupInput>();
  for (const bank of batch.bankTransactions) {
    for (const expected of batch.expectedPayments) {
      const amount = expected.amountDue;
      if (amount.currency !== bank.amount.currency) {
        addLookup(inputs, { base: amount.currency, quote: bank.amount.currency, date: expected.issueDate });
        addLookup(inputs, { base: amount.currency, quote: bank.amount.currency, date: bank.bookingDate });
      }
    }
    for (const proof of batch.paymentProofs) {
      const amounts = [
        proof.financialPayload.paidAmount,
        proof.financialPayload.sourceAmount,
        proof.financialPayload.targetAmount,
        proof.financialPayload.netAmount
      ];
      for (const amount of amounts) {
        if (amount && amount.currency !== bank.amount.currency) {
          addLookup(inputs, { base: amount.currency, quote: bank.amount.currency, date: proof.financialPayload.paymentDate ?? bank.bookingDate });
        }
      }
    }
  }

  await Promise.all([...inputs.values()].map((input) => provider.hydrate(input).catch(() => null)));
}

function addLookup(inputs: Map<string, FxRateLookupInput>, input: FxRateLookupInput): void {
  inputs.set(`${input.base}_${input.quote}_${dateKey(input.date)}`, { ...input, date: dateKey(input.date) });
}

function bnmPayloadToMyrRate(payload: unknown, currency: CurrencyCode, requestedDate: string): { rate: string; rateDate: string } | null {
  const candidate = payload as { data?: BnmApiRateRow | BnmApiRateRow[] };
  const rows = Array.isArray(candidate.data) ? candidate.data : candidate.data ? [candidate.data] : [];
  const row = rows.find((item) => item.currency_code === currency) ?? rows[0];
  if (!row?.rate) return null;
  const unit = row.unit && row.unit > 0 ? row.unit : 1;
  const rateValue = row.rate.middle_rate ?? averageNullable(row.rate.buying_rate, row.rate.selling_rate) ?? row.rate.buying_rate ?? row.rate.selling_rate;
  if (rateValue === null || rateValue === undefined) return null;
  return {
    rate: trimRate(Number(rateValue) / unit),
    rateDate: row.rate.date ?? requestedDate
  };
}

function averageNullable(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return (a + b) / 2;
}

function divideRate(numerator: string, denominator: string): string {
  const den = Number(denominator);
  if (den === 0) return "0";
  return trimRate(Number(numerator) / den);
}

function trimRate(value: number): string {
  return value.toFixed(8).replace(/\.?0+$/, "");
}
