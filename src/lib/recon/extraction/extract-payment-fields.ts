import { parse, format, isValid } from "date-fns";
import type { ExchangeRateInformation, MoneyAmount, RemittanceLineItem } from "../types";

const currencyPattern = "([A-Z]{3})";

// --- Money extraction (supports thousand separators and both pre/post currency) ---

/** Pre-currency pattern: e.g. "USD 1,000.50" or "USD1000.50" */
const preMoneyRegex = /\b([A-Z]{3})\s*([0-9]{1,3}(?:[,. ][0-9]{3})*(?:[.,][0-9]+)?)\b/gi;

/** Post-currency pattern: e.g. "1,000.50 USD" or "1000.50USD" */
const postMoneyRegex = /\b([0-9]{1,3}(?:[,. ][0-9]{3})*(?:[.,][0-9]+)?)\s*([A-Z]{3})\b/gi;

/**
 * Strips thousand separators and normalises European decimal commas.
 * Heuristic: if the last separator is a comma and is followed by exactly
 * three digits at the end, it is a thousand separator (e.g. "1.000,500" →
 * ambiguous but "1,000" → 1000). If the last separator is a comma followed
 * by 1-2 digits, treat it as a decimal comma (European format).
 */
export function normalizeAmount(raw: string): string {
  const trimmed = raw.trim();

  // Find the position of the last comma and last dot
  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");

  if (lastComma === -1 && lastDot === -1) {
    // Pure integer, no separators
    return trimmed.replace(/\s/g, "");
  }

  if (lastComma === -1) {
    // Only dots present – last dot is decimal if followed by 1-2 digits,
    // otherwise it is a thousand separator
    const afterDot = trimmed.slice(lastDot + 1);
    if (afterDot.length <= 2) {
      // e.g. "1.000.50" → decimal at last dot
      return trimmed.slice(0, lastDot).replace(/[.\s]/g, "") + "." + afterDot;
    }
    // e.g. "1.000" → thousand separator only, no decimal
    return trimmed.replace(/[.\s]/g, "");
  }

  if (lastDot === -1) {
    // Only commas present – last comma is decimal if followed by 1-2 digits
    const afterComma = trimmed.slice(lastComma + 1);
    if (afterComma.length <= 2) {
      // European format: "1.000,50" but without dots → "1000,50"
      return trimmed.slice(0, lastComma).replace(/[,\s]/g, "") + "." + afterComma;
    }
    // e.g. "1,000" → thousand separator only
    return trimmed.replace(/[,\s]/g, "");
  }

  // Both comma and dot present
  if (lastComma > lastDot) {
    // Comma comes after dot → European format: "1.000,50"
    const afterComma = trimmed.slice(lastComma + 1);
    return trimmed.slice(0, lastComma).replace(/[.,\s]/g, "") + "." + afterComma;
  }

  // Dot comes after comma → US format: "1,000.50"
  const afterDot = trimmed.slice(lastDot + 1);
  return trimmed.slice(0, lastDot).replace(/[.,\s]/g, "") + "." + afterDot;
}

interface RawMoneyMatch {
  value: string;
  currency: string;
  original: string;
}

function collectMoneyMatches(text: string): RawMoneyMatch[] {
  const results: RawMoneyMatch[] = [];
  const seen = new Set<number>(); // track start indices to avoid duplicates

  for (const m of text.matchAll(preMoneyRegex)) {
    if (m.index !== undefined && !seen.has(m.index) && m[1] && m[2]) {
      seen.add(m.index);
      results.push({
        currency: m[1].toUpperCase(),
        value: normalizeAmount(m[2]),
        original: m[0]
      });
    }
  }

  for (const m of text.matchAll(postMoneyRegex)) {
    if (m.index !== undefined && !seen.has(m.index) && m[1] && m[2]) {
      seen.add(m.index);
      results.push({
        currency: m[2].toUpperCase(),
        value: normalizeAmount(m[1]),
        original: m[0]
      });
    }
  }

  return results;
}

export function tableToText(rawTable: string[][] | null | undefined): string {
  return rawTable?.map((row) => row.join(": ")).join("\n") ?? "";
}

export function extractMoney(text: string, preferredCurrency?: MoneyAmount["currency"]): (MoneyAmount & { original: string }) | null {
  const matches = collectMoneyMatches(text);
  const selected =
    matches.find((m) => m.currency === preferredCurrency) ??
    matches.find((m) => m.original.toLowerCase().includes("paid") || m.original.toLowerCase().includes("amount")) ??
    matches[0];

  if (!selected) {
    return null;
  }

  return {
    value: selected.value,
    currency: selected.currency as MoneyAmount["currency"],
    original: selected.original
  };
}

export function extractAllMoney(text: string): Array<MoneyAmount & { original: string }> {
  return collectMoneyMatches(text).map((m) => ({
    value: m.value,
    currency: m.currency as MoneyAmount["currency"],
    original: m.original
  }));
}

// --- Date extraction (multi-format via date-fns) ---

/**
 * Mapping from date-fns format tokens to approximate regex patterns used
 * to pull candidate strings out of free text before attempting a parse.
 */
const DATE_FORMATS: { fnsFormat: string; regex: RegExp }[] = [
  // ISO must come first (cheap & unambiguous)
  { fnsFormat: "yyyy-MM-dd", regex: /\b(\d{4}-\d{2}-\d{2})\b/ },
  // DD-MMM-YYYY  e.g. 15-Jan-2024
  { fnsFormat: "dd-MMM-yyyy", regex: /\b(\d{1,2}-[A-Za-z]{3}-\d{4})\b/ },
  // DD MMM YYYY  e.g. 15 Jan 2024
  { fnsFormat: "dd MMM yyyy", regex: /\b(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\b/ },
  // MMM DD YYYY  e.g. Jan 15 2024
  { fnsFormat: "MMM dd yyyy", regex: /\b([A-Za-z]{3}\s+\d{1,2}\s+\d{4})\b/ },
  // MMMM DD YYYY  e.g. January 15 2024
  { fnsFormat: "MMMM dd yyyy", regex: /\b([A-Za-z]{3,9}\s+\d{1,2}\s+\d{4})\b/ },
  // DD.MM.YYYY
  { fnsFormat: "dd.MM.yyyy", regex: /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/ },
  // MM/DD/YYYY
  { fnsFormat: "MM/dd/yyyy", regex: /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/ },
  // DD/MM/YYYY – same regex as MM/DD/YYYY, tried as fallback
  { fnsFormat: "dd/MM/yyyy", regex: /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/ }
];

export function extractDate(text: string): string | null {
  // Fast path: ISO date
  const isoMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoMatch) {
    return isoMatch[0];
  }

  for (const { fnsFormat, regex } of DATE_FORMATS) {
    const candidate = text.match(regex);
    if (!candidate?.[1]) continue;
    const parsed = parse(candidate[1], fnsFormat, new Date(2000, 0, 1));
    if (isValid(parsed) && parsed.getFullYear() >= 1900 && parsed.getFullYear() <= 2100) {
      return format(parsed, "yyyy-MM-dd");
    }
  }

  return null;
}

// --- Invoice / reference helpers (unchanged) ---

export function extractInvoiceIds(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(/\b(?:INV|INVOICE|BILL|RCN|CN|DN)[-\s]?(?=[A-Z0-9/-]*\d)[A-Z0-9]{2,}(?:[-/][A-Z0-9]+)*\b/gi)].map((match) =>
        match[0].toUpperCase().replace(/\s+/g, "-")
      )
    )
  ];
}

export function extractReference(text: string): { raw: string | null } {
  return { raw: extractInvoiceIds(text)[0] ?? null };
}

export function extractRemittanceLineItems(text: string): RemittanceLineItem[] {
  const items: RemittanceLineItem[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const invoiceIds = extractInvoiceIds(line);
    if (invoiceIds.length === 0) continue;
    const amount = extractMoney(line);
    for (const invoiceNumber of invoiceIds) {
      if (seen.has(invoiceNumber)) continue;
      seen.add(invoiceNumber);
      items.push({
        invoiceNumber,
        paidAmount: amount ? { value: amount.value, currency: amount.currency } : null,
        discountAmount: null,
        feeAmount: null,
        note: line.trim() || null
      });
    }
  }
  return items;
}

// --- Payment status (expanded vocabulary) ---

const SETTLED_TERMS = [
  "paid",
  "completed",
  "settled",
  "successful",
  "executed",
  "processed",
  "credited",
  "debited",
  "approved",
  "accepted",
  "cleared",
  "delivered",
  "transferred",
  "confirmed",
  "finalised",
  "finalized"
];

const PENDING_TERMS = [
  "pending",
  "in progress",
  "in-progress",
  "processing",
  "awaiting",
  "initiated",
  "submitted",
  "on hold",
  "on-hold",
  "under review",
  "scheduled",
  "queued"
];

const REJECTED_TERMS = [
  "rejected",
  "failed",
  "declined",
  "cancelled",
  "canceled",
  "returned",
  "reversed",
  "refused",
  "bounced",
  "unsuccessful"
];

function buildStatusRegex(terms: string[]): RegExp {
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "i");
}

export function extractPaymentStatus(text: string): {
  paymentStatus: "ACSC" | "PNDG" | "RJCT" | "UNKNOWN";
  label: string | null;
  raw: string | null;
} {
  const settledMatch = text.match(buildStatusRegex(SETTLED_TERMS));
  if (settledMatch?.[1]) {
    return { paymentStatus: "ACSC", label: "Settled", raw: settledMatch[1] };
  }

  const pendingMatch = text.match(buildStatusRegex(PENDING_TERMS));
  if (pendingMatch?.[1]) {
    return { paymentStatus: "PNDG", label: "Pending", raw: pendingMatch[1] };
  }

  const rejectedMatch = text.match(buildStatusRegex(REJECTED_TERMS));
  if (rejectedMatch?.[1]) {
    return { paymentStatus: "RJCT", label: "Rejected", raw: rejectedMatch[1] };
  }

  return { paymentStatus: "UNKNOWN", label: null, raw: null };
}

// --- Provider / bank name extraction (expanded list) ---

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const KNOWN_PROVIDERS: string[] = [
  // International transfer services
  "Wise",
  "PayPal",
  "Revolut",
  "Remitly",
  "Western Union",
  "MoneyGram",
  "WorldRemit",
  "OFX",
  "Payoneer",
  "TransferGo",
  "Xe",
  "Airwallex",
  // Global / multinational banks
  "HSBC",
  "Citibank",
  "Standard Chartered",
  "JPMorgan",
  "Barclays",
  "Deutsche Bank",
  "BNP Paribas",
  "UBS",
  "Credit Suisse",
  "Goldman Sachs",
  // Asia-Pacific banks
  "DBS",
  "OCBC",
  "UOB",
  "Maybank",
  "CIMB",
  "Bangkok Bank",
  "Bank of China",
  "ICBC",
  "ANZ",
  "Commonwealth Bank",
  "Westpac",
  "NAB",
  // US banks
  "Bank of America",
  "Wells Fargo",
  "Chase",
  // UK / European
  "Lloyds",
  "NatWest",
  "ING",
  "Rabobank",
  "Santander"
];

const providerRegex = new RegExp(
  `\\b(${KNOWN_PROVIDERS.map(escapeRegex).join("|")})\\b`,
  "i"
);

export function extractProviderOrBankName(text: string): string | null {
  return text.match(providerRegex)?.[1] ?? null;
}

// --- FX rate extraction (unchanged) ---

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
