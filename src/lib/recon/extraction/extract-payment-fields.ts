import type { ExchangeRateInformation, MoneyAmount } from "../types";

const currencyPattern = "([A-Z]{3})";
const moneyRegex = new RegExp(`\\b${currencyPattern}\\s*([0-9]+(?:\\.[0-9]+)?)\\b`, "i");
const allMoneyRegex = new RegExp(`\\b${currencyPattern}\\s*([0-9]+(?:\\.[0-9]+)?)\\b`, "gi");

export function tableToText(rawTable: string[][] | null | undefined): string {
  return rawTable?.map((row) => row.join(": ")).join("\n") ?? "";
}

export function extractMoney(text: string, preferredCurrency?: MoneyAmount["currency"]): (MoneyAmount & { original: string }) | null {
  const matches = [...text.matchAll(allMoneyRegex)];
  const selected =
    matches.find((match) => match[1]?.toUpperCase() === preferredCurrency) ??
    matches.find((match) => match[0].toLowerCase().includes("paid") || match[0].toLowerCase().includes("amount")) ??
    matches[0];

  if (!selected?.[1] || !selected[2]) {
    return null;
  }

  return {
    value: selected[2],
    currency: selected[1].toUpperCase() as MoneyAmount["currency"],
    original: selected[0]
  };
}

export function extractAllMoney(text: string): Array<MoneyAmount & { original: string }> {
  const matches: Array<MoneyAmount & { original: string }> = [];
  for (const match of text.matchAll(allMoneyRegex)) {
    const currency = match[1];
    const value = match[2];
    if (currency && value) {
      matches.push({
        value,
        currency: currency.toUpperCase() as MoneyAmount["currency"],
        original: match[0]
      });
    }
  }
  return matches;
}

export function extractDate(text: string): string | null {
  return text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? null;
}

export function extractInvoiceIds(text: string): string[] {
  return [...new Set([...text.matchAll(/\bINV-\d+\b/gi)].map((match) => match[0].toUpperCase()))];
}

export function extractReference(text: string): { raw: string | null } {
  return { raw: extractInvoiceIds(text)[0] ?? null };
}

export function extractPaymentStatus(text: string): {
  paymentStatus: "ACSC" | "PNDG" | "RJCT" | "UNKNOWN";
  label: string | null;
  raw: string | null;
} {
  const status = text.match(/\b(Paid|Completed|Settled|Pending|Rejected)\b/i)?.[1] ?? null;
  if (!status) {
    return { paymentStatus: "UNKNOWN", label: null, raw: null };
  }
  const normalized = status.toLowerCase();
  if (["paid", "completed", "settled"].includes(normalized)) {
    return { paymentStatus: "ACSC", label: "Settled", raw: status };
  }
  if (normalized === "pending") {
    return { paymentStatus: "PNDG", label: "Pending", raw: status };
  }
  return { paymentStatus: "RJCT", label: "Rejected", raw: status };
}

export function extractProviderOrBankName(text: string): string | null {
  return text.match(/\b(Wise|DBS|Maybank)\b/i)?.[1] ?? null;
}

export function extractFxRate(text: string): ExchangeRateInformation | null {
  const match = text.match(new RegExp(`1\\s+${currencyPattern}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)\\s+${currencyPattern}`, "i"));
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  return {
    unitCurrency: match[1].toUpperCase() as MoneyAmount["currency"],
    quotedCurrency: match[3].toUpperCase() as MoneyAmount["currency"],
    exchangeRate: match[2],
    rateType: "AGREED",
    source: "payment_proof",
    contractId: null,
    evidenceText: match[0]
  };
}

export function computeImpliedFx(sourceAmount: MoneyAmount | null, targetAmount: MoneyAmount | null): ExchangeRateInformation | null {
  if (!sourceAmount || !targetAmount || Number(sourceAmount.value) <= 0 || sourceAmount.currency === targetAmount.currency) {
    return null;
  }
  const rate = Number(targetAmount.value) / Number(sourceAmount.value);
  return {
    unitCurrency: sourceAmount.currency,
    quotedCurrency: targetAmount.currency,
    exchangeRate: rate.toFixed(4),
    rateType: "IMPLIED",
    source: "computed_implied",
    contractId: null,
    evidenceText: `Computed from sourceAmount ${sourceAmount.currency} ${sourceAmount.value} and targetAmount ${targetAmount.currency} ${targetAmount.value}`
  };
}

export function extractParty(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const match = text.match(
      new RegExp(`${label}\\s*:?\\s*([A-Za-z0-9 .&-]+?)(?=\\s+(?:Beneficiary|Reference|Ref|Date|Status|Transaction|Amount|Paid|Bank)|$)`, "i")
    );
    if (match?.[1]) {
      return match[1].trim().replace(/[. ]+$/, "");
    }
  }
  return null;
}
