import Papa from "papaparse";
import * as XLSX from "xlsx";

import { normalize_currency_amount, normalize_date, normalize_party_name, normalize_reference } from "../normalizers";
import type { BankStatementTransaction, Warning } from "../types";

// ─── Column Aliases ───────────────────────────────────────────────────────────

type BankFieldKey =
  | "date"
  | "valueDate"
  | "description"
  | "amount"       // Format A: single signed amount
  | "direction"    // Format A: CR/DR indicator
  | "credit"       // Format B: credit column
  | "debit"        // Format B: debit column
  | "currency"
  | "debtorName"
  | "creditorName"
  | "bankRef";

const COLUMN_ALIASES: Record<BankFieldKey, string[]> = {
  date: ["date", "booking date", "transaction date", "txn date", "posting date"],
  valueDate: ["value date", "val date"],
  description: ["description", "details", "narration", "remarks", "particulars", "transaction description", "memo"],
  amount: ["amount", "transaction amount", "txn amount"],
  direction: ["direction", "type", "dr/cr", "cr/dr", "indicator", "ind"],
  credit: ["credit", "credit amount", "credits", "deposit"],
  debit: ["debit", "debit amount", "debits", "withdrawal"],
  currency: ["currency", "ccy"],
  debtorName: ["payer", "debtor", "sender", "counterparty", "counterparty name", "debtor name", "payer name"],
  creditorName: ["payee", "creditor", "receiver", "creditor name", "payee name"],
  bankRef: ["bank ref", "bank reference", "reference", "ref"],
};

// ─── Header Normalisation ─────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Format Detection ─────────────────────────────────────────────────────────

// Format B: has distinct credit AND debit columns
// Format A: single amount column with a direction indicator
const FORMAT_B_CREDIT = new Set(["credit", "credit amount", "credits", "deposit"]);
const FORMAT_B_DEBIT  = new Set(["debit",  "debit amount",  "debits",  "withdrawal"]);

function detectCsvFormat(headers: string[]): "A" | "B" {
  const norms = headers.map(normalizeHeader);
  const hasCredit = norms.some((h) => FORMAT_B_CREDIT.has(h));
  const hasDebit  = norms.some((h) => FORMAT_B_DEBIT.has(h));
  return hasCredit && hasDebit ? "B" : "A";
}

// ─── Column Mapping ───────────────────────────────────────────────────────────

type ColumnMap = Partial<Record<BankFieldKey, string>>;

function mapColumns(headers: string[]): { columnMap: ColumnMap; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const columnMap: ColumnMap = {};
  const claimed = new Set<BankFieldKey>();

  for (const header of headers) {
    const norm = normalizeHeader(header);
    const matches: BankFieldKey[] = [];
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [BankFieldKey, string[]][]) {
      if (aliases.includes(norm)) matches.push(field);
    }
    if (matches.length > 1) {
      warnings.push({ code: "AMBIGUOUS_COLUMN_MAPPING", message: `Column "${header}" matches multiple fields: ${matches.join(", ")}`, field: header });
    } else if (matches.length === 0) {
      warnings.push({ code: "UNMAPPED_COLUMN", message: `Column "${header}" has no field mapping`, field: header });
    } else {
      const field = matches[0]!; // safe: matches.length === 1 in this branch
      if (!claimed.has(field)) {
        columnMap[field] = header;
        claimed.add(field);
      }
    }
  }

  return { columnMap, warnings };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type IsoCurrency = string;
type ParsedMoney = { value: string; currency: IsoCurrency };

function isIsoCurrencyCode(value: string | null | undefined): value is IsoCurrency {
  return Boolean(value && /^[A-Z]{3}$/.test(value));
}

function mapDirection(raw: string): "CRDT" | "DBIT" | null {
  switch (raw.trim().toUpperCase()) {
    case "CR": case "C": case "CRDT": case "CREDIT": return "CRDT";
    case "DR": case "D": case "DBIT": case "DEBIT":  return "DBIT";
    default: return null;
  }
}

// Extracts the date part from an ISO date string embedded in the amount (e.g. "MYR 42.50")
function extractEmbeddedCurrency(raw: string): IsoCurrency | null {
  const m = raw.trim().match(/^([A-Z]{3})\s+/);
  return isIsoCurrencyCode(m?.[1]) ? m[1]! : null;
}

// Strips a leading minus sign and normalises; returns null for unparseable values
function parseAbsAmount(raw: string): { value: string | null; isNegative: boolean } {
  const trimmed = raw.trim();
  const isNegative = trimmed.startsWith("-");
  const abs = isNegative ? trimmed.slice(1) : trimmed;
  return { value: normalize_currency_amount(abs || null), isNegative };
}

const INV_PATTERN = /\bINV-\d+\b/i;
function extractInvoiceNumber(text: string): string | null {
  const m = text.match(INV_PATTERN);
  return m ? m[0].toUpperCase() : null;
}

const MONEY_PATTERN = /\b([A-Z]{3}|RM)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\b/gi;
const TT_PATTERN = /\b(?:TT|SWIFT|UETR)[A-Z0-9-]{4,}\b/i;

function toIsoCurrency(raw: string | undefined): IsoCurrency | null {
  if (!raw) return null;
  const normalized = raw.toUpperCase() === "RM" ? "MYR" : raw.toUpperCase();
  return isIsoCurrencyCode(normalized) ? normalized : null;
}

function parseMoneyValue(raw: string | undefined): string | null {
  return normalize_currency_amount(raw?.replace(/,/g, "") ?? null);
}

function moneyFromMatch(currency: string | undefined, value: string | undefined): ParsedMoney | null {
  const parsedCurrency = toIsoCurrency(currency);
  const parsedValue = parseMoneyValue(value);
  return parsedCurrency && parsedValue ? { value: parsedValue, currency: parsedCurrency } : null;
}

function extractFirstMoney(text: string, predicate: (currency: IsoCurrency) => boolean): ParsedMoney | null {
  for (const match of text.matchAll(MONEY_PATTERN)) {
    const money = moneyFromMatch(match[1], match[2]);
    if (money && predicate(money.currency)) return money;
  }
  return null;
}

function extractSourceAmount(text: string, statementCurrency: IsoCurrency): ParsedMoney | null {
  return extractFirstMoney(text, (currency) => currency !== statementCurrency);
}

function extractFxRate(text: string): string | null {
  const match =
    text.match(/\b(?:FX|FOREX|EXCHANGE\s+RATE|RATE)\s*[:=@-]?\s*([0-9]+(?:\.[0-9]+)?)/i) ??
    text.match(/@\s*([0-9]+(?:\.[0-9]+)?)/);
  return match?.[1] ?? null;
}

function extractBankFee(text: string): ParsedMoney | null {
  const explicitFee =
    text.match(/\b(?:LESS|DEDUCT(?:ED)?|FEE|FEES|CHARGE|CHARGES|COMMISSION)\b[^A-Z0-9]*([A-Z]{3}|RM)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i) ??
    text.match(/\b([A-Z]{3}|RM)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:FEE|FEES|CHARGE|CHARGES|COMMISSION)\b/i);
  return explicitFee ? moneyFromMatch(explicitFee[1], explicitFee[2]) : null;
}

function extractTransferReference(text: string): string | null {
  const match = text.match(TT_PATTERN);
  return match ? match[0].toUpperCase() : null;
}

function deriveAmountReceived(
  sourceAmount: ParsedMoney | null,
  exchangeRateApplied: string | null,
  statementCurrency: IsoCurrency,
): ParsedMoney | null {
  if (!sourceAmount || !exchangeRateApplied) return null;
  const sourceValue = Number(sourceAmount.value);
  const fxRate = Number(exchangeRateApplied);
  if (!Number.isFinite(sourceValue) || !Number.isFinite(fxRate)) return null;
  return { value: (sourceValue * fxRate).toFixed(2), currency: statementCurrency };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyFromNumber(value: number, currency: IsoCurrency): ParsedMoney {
  return { value: Math.abs(value).toFixed(2), currency };
}

function extractStatementCurrency(text: string): IsoCurrency {
  const explicitCurrency = text.match(/\bCurrency\s+([A-Z]{3})\b/i);
  const openingBalanceCurrency = text.match(/\bOpening Balance\s+([A-Z]{3}|RM)\b/i);
  return toIsoCurrency(explicitCurrency?.[1] ?? openingBalanceCurrency?.[1]) ?? "MYR";
}

function extractOpeningBalance(text: string): number | null {
  const match = text.match(/\bOpening Balance\s+(?:[A-Z]{3}|RM)\s+([0-9][0-9,]*\.\d{2})/i);
  return parseNumber(match?.[1]);
}

function buildTextRecord(input: {
  date: string;
  description: string;
  amount: number;
  balance: number;
  previousBalance: number | null;
  reference: string;
  rowNumber: number;
  sourceFileId: string;
  accountId: string;
  currency: IsoCurrency;
}): BankStatementTransaction {
  const amountCurrency = input.currency;
  const delta = input.previousBalance === null ? input.amount : input.balance - input.previousBalance;
  const creditDebitIndicator: "CRDT" | "DBIT" = delta < 0 ? "DBIT" : "CRDT";
  const statementAmount = moneyFromNumber(input.amount, amountCurrency);
  const sourceAmount = extractSourceAmount(input.description, amountCurrency);
  const exchangeRateApplied = extractFxRate(input.description);
  const bankFeeDeducted = extractBankFee(input.description);
  const derivedAmountReceived = deriveAmountReceived(sourceAmount, exchangeRateApplied, amountCurrency);
  const invoiceFromDesc = extractInvoiceNumber(input.description);
  const transferReferenceFromDesc = extractTransferReference(input.description);
  const reference = input.reference || transferReferenceFromDesc || invoiceFromDesc || null;

  return {
    schemaVersion: "1.0.0",
    internalTxId: `txn_${input.sourceFileId}_row${String(input.rowNumber).padStart(3, "0")}`,
    accountId: input.accountId,
    bookingDate: normalize_date(input.date) ?? input.date,
    valueDate: null,
    creditDebitIndicator,
    amount: statementAmount,
    amountReceived: creditDebitIndicator === "CRDT" ? derivedAmountReceived ?? statementAmount : null,
    sourceAmount,
    exchangeRateApplied,
    bankFeeDeducted,
    feeCurrency: bankFeeDeducted?.currency ?? null,
    netCreditAmount: creditDebitIndicator === "CRDT" ? statementAmount : null,
    acctSvcrRef: reference,
    referenceNo: reference,
    ttNo: transferReferenceFromDesc,
    normalizedReference: normalize_reference(reference ?? input.description),
    endToEndId: null,
    txId: transferReferenceFromDesc,
    debtorName: null,
    debtorNormalizedName: null,
    debtorAccount: null,
    creditorName: null,
    creditorNormalizedName: null,
    creditorAccount: null,
    remittanceInformation: {
      raw: input.description,
      structured: {
        invoiceNumber: invoiceFromDesc,
        creditorReference: reference,
        additionalInfo: input.description,
      },
    },
    description: input.description,
    rawDescription: input.description,
    remarks: input.description,
    sourceFileId: input.sourceFileId,
    sourceRowNumber: input.rowNumber,
    warnings: [],
  };
}

// ─── Row → BankStatementTransaction ──────────────────────────────────────────

function buildRecord(
  row: Record<string, string>,
  columnMap: ColumnMap,
  csvFormat: "A" | "B",
  rowNumber: number,
  sourceFileId: string,
  accountId: string,
): BankStatementTransaction {
  const warnings: Warning[] = [];

  const get = (field: BankFieldKey): string => {
    const col = columnMap[field];
    return col !== undefined ? (row[col] ?? "").toString().trim() : "";
  };

  // Booking date
  const rawDate = get("date");
  const parsedDate = normalize_date(rawDate || null);
  if (rawDate && !parsedDate) {
    warnings.push({ code: "INVALID_DATE_FORMAT", message: `Booking date "${rawDate}" is not a recognised ISO date`, field: "bookingDate" });
  }
  const bookingDate = parsedDate ?? isoToday();

  // Value date (optional)
  const valueDate = normalize_date(get("valueDate") || null);

  // Description
  const rawDescription = get("description");

  // Explicit currency column (optional)
  const rawCurrencyCol = get("currency").toUpperCase();
  const currencyFromCol: IsoCurrency | null = isIsoCurrencyCode(rawCurrencyCol) ? rawCurrencyCol : null;

  // Amount + direction
  let creditDebitIndicator: "CRDT" | "DBIT" = "CRDT";
  let amountValue: string | null = null;
  let amountCurrency: IsoCurrency = currencyFromCol ?? "MYR";

  if (csvFormat === "A") {
    const rawAmount = get("amount");
    const embedded = extractEmbeddedCurrency(rawAmount);
    if (embedded) amountCurrency = embedded;
    const { value, isNegative } = parseAbsAmount(rawAmount);
    amountValue = value;
    if (rawAmount && !amountValue) {
      warnings.push({ code: "INVALID_MONEY_FORMAT", message: `Amount "${rawAmount}" could not be parsed`, field: "amount.value" });
    }

    const rawDir = get("direction");
    const mapped = rawDir ? mapDirection(rawDir) : null;
    // Direction column takes priority; fall back to sign of the amount
    creditDebitIndicator = mapped ?? (isNegative ? "DBIT" : "CRDT");
  } else {
    // Format B — split credit / debit columns
    const rawCredit = get("credit");
    const rawDebit  = get("debit");

    const creditVal = normalize_currency_amount(rawCredit || null);
    const debitVal  = normalize_currency_amount(rawDebit  || null);

    if (creditVal && creditVal !== "0" && creditVal !== "0.00") {
      amountValue = creditVal;
      creditDebitIndicator = "CRDT";
    } else if (debitVal && debitVal !== "0" && debitVal !== "0.00") {
      amountValue = debitVal;
      creditDebitIndicator = "DBIT";
    } else {
      warnings.push({ code: "INVALID_MONEY_FORMAT", message: "Neither credit nor debit column contains a non-zero amount", field: "amount.value" });
    }
  }

  // Party names
  const rawDebtorName   = get("debtorName");
  const rawCreditorName = get("creditorName");

  // Remittance — extract INV-XXXX from description
  const invoiceFromDesc = rawDescription ? extractInvoiceNumber(rawDescription) : null;
  const transferReferenceFromDesc = rawDescription ? extractTransferReference(rawDescription) : null;
  const sourceAmount = rawDescription ? extractSourceAmount(rawDescription, amountCurrency) : null;
  const exchangeRateApplied = rawDescription ? extractFxRate(rawDescription) : null;
  const bankFeeDeducted = rawDescription ? extractBankFee(rawDescription) : null;
  const derivedAmountReceived = deriveAmountReceived(sourceAmount, exchangeRateApplied, amountCurrency);

  // Bank reference
  const rawBankRef = get("bankRef") || transferReferenceFromDesc || "";
  const comparableReference = rawBankRef || invoiceFromDesc || rawDescription || null;
  const statementAmount = { value: amountValue ?? "0.00", currency: amountCurrency };

  return {
    schemaVersion: "1.0.0",
    internalTxId: `txn_${sourceFileId}_row${String(rowNumber).padStart(3, "0")}`,
    accountId,
    bookingDate,
    valueDate: valueDate ?? null,
    creditDebitIndicator,
    amount: statementAmount,
    amountReceived: creditDebitIndicator === "CRDT" ? derivedAmountReceived ?? statementAmount : null,
    sourceAmount,
    exchangeRateApplied,
    bankFeeDeducted,
    feeCurrency: bankFeeDeducted?.currency ?? null,
    netCreditAmount: creditDebitIndicator === "CRDT" ? statementAmount : null,
    acctSvcrRef: rawBankRef || null,
    referenceNo: rawBankRef || null,
    ttNo: transferReferenceFromDesc,
    normalizedReference: normalize_reference(comparableReference),
    endToEndId: null,
    txId: transferReferenceFromDesc,
    debtorName: rawDebtorName || null,
    debtorNormalizedName: normalize_party_name(rawDebtorName || null),
    debtorAccount: null,
    creditorName: rawCreditorName || null,
    creditorNormalizedName: normalize_party_name(rawCreditorName || null),
    creditorAccount: null,
    remittanceInformation: {
      raw: rawDescription || null,
      structured: {
        invoiceNumber: invoiceFromDesc,
        creditorReference: rawBankRef || null,
        additionalInfo: rawDescription || null,
      },
    },
    description: rawDescription || null,
    rawDescription: rawDescription || null,
    remarks: rawDescription || null,
    sourceFileId,
    sourceRowNumber: rowNumber,
    warnings,
  };
}

// ─── Raw Row Parsing ──────────────────────────────────────────────────────────

function parseRows(content: string | Buffer, format: "csv" | "xlsx"): Record<string, string>[] {
  if (format === "csv") {
    const text = typeof content === "string" ? content : content.toString("utf8");
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    return result.data;
  }

  const buf = typeof content === "string" ? Buffer.from(content, "binary") : content;
  const workbook = XLSX.read(buf, { type: "buffer" });
  const sheetName = workbook.SheetNames[0]!;
  const firstSheet = workbook.Sheets[sheetName]!;
  return XLSX.utils.sheet_to_json<Record<string, string>>(firstSheet, { defval: "", raw: false });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type ParseBankStatementsResult = {
  records: BankStatementTransaction[];
  warnings: Warning[];
};

export function parseBankStatements(
  content: string | Buffer,
  format: "csv" | "xlsx",
  sourceFileId: string,
  accountId: string,
): ParseBankStatementsResult {
  const rows = parseRows(content, format);
  const firstRow = rows[0];
  if (!firstRow) return { records: [], warnings: [] };

  const headers = Object.keys(firstRow);
  const csvFormat = detectCsvFormat(headers);
  const { columnMap, warnings: batchWarnings } = mapColumns(headers);

  const records = rows.map((row, i) =>
    buildRecord(row, columnMap, csvFormat, i + 2, sourceFileId, accountId),
  );

  return { records, warnings: batchWarnings };
}

export function parseBankStatementText(
  text: string,
  sourceFileId: string,
  accountId: string,
): ParseBankStatementsResult {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const currency = extractStatementCurrency(text);
  let previousBalance = extractOpeningBalance(text);
  const records: BankStatementTransaction[] = [];
  const warnings: Warning[] = [];

  for (const [index, line] of lines.entries()) {
    const match = line.match(/^(\d{4}-\d{2}-\d{2})\s+(.+?)\s+([0-9][0-9,]*\.\d{2})\s+([0-9][0-9,]*\.\d{2})\s+(\S+)$/);
    if (!match) continue;

    const amount = parseNumber(match[3]);
    const balance = parseNumber(match[4]);
    if (amount === null || balance === null) {
      warnings.push({ code: "INVALID_MONEY_FORMAT", message: `Could not parse amount or balance from line "${line}"`, field: "amount.value" });
      continue;
    }

    records.push(buildTextRecord({
      date: match[1]!,
      description: match[2]!,
      amount,
      balance,
      previousBalance,
      reference: match[5]!,
      rowNumber: index + 1,
      sourceFileId,
      accountId,
      currency,
    }));
    previousBalance = balance;
  }

  if (records.length === 0 && text.includes("Transaction Details")) {
    warnings.push({
      code: "MISSING_REQUIRED_COLUMN",
      message: "PDF text contained a transaction section, but no transaction rows matched the bank statement parser.",
      field: "bank_statement"
    });
  }

  return { records, warnings };
}
