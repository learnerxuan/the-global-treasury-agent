import Papa from "papaparse";
import * as XLSX from "xlsx";

import { normalize_currency_amount, normalize_date, normalize_party_name } from "../normalizers";
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
  debtorName: ["payer", "debtor", "sender", "debtor name", "payer name"],
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

const MVP_CURRENCIES = new Set(["MYR", "USD", "SGD", "EUR"]);
type MvpCurrency = "MYR" | "USD" | "SGD" | "EUR";

function mapDirection(raw: string): "CRDT" | "DBIT" | null {
  switch (raw.trim().toUpperCase()) {
    case "CR": case "C": case "CRDT": case "CREDIT": return "CRDT";
    case "DR": case "D": case "DBIT": case "DEBIT":  return "DBIT";
    default: return null;
  }
}

// Extracts the date part from an ISO date string embedded in the amount (e.g. "MYR 42.50")
function extractEmbeddedCurrency(raw: string): MvpCurrency | null {
  const m = raw.trim().match(/^([A-Z]{3})\s+/);
  return m && MVP_CURRENCIES.has(m[1]!) ? (m[1]! as MvpCurrency) : null;
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

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
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
  const currencyFromCol: MvpCurrency | null =
    rawCurrencyCol.length === 3 && MVP_CURRENCIES.has(rawCurrencyCol) ? (rawCurrencyCol as MvpCurrency) : null;

  // Amount + direction
  let creditDebitIndicator: "CRDT" | "DBIT" = "CRDT";
  let amountValue: string | null = null;
  let amountCurrency: MvpCurrency = currencyFromCol ?? "MYR";

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

  // Bank reference
  const rawBankRef = get("bankRef");

  return {
    schemaVersion: "1.0.0",
    internalTxId: `txn_${sourceFileId}_row${String(rowNumber).padStart(3, "0")}`,
    accountId,
    bookingDate,
    valueDate: valueDate ?? null,
    creditDebitIndicator,
    amount: { value: amountValue ?? "0.00", currency: amountCurrency },
    acctSvcrRef: rawBankRef || null,
    endToEndId: null,
    txId: null,
    debtorName: rawDebtorName || null,
    debtorNormalizedName: normalize_party_name(rawDebtorName || null),
    debtorAccount: null,
    creditorName: rawCreditorName || null,
    creditorNormalizedName: normalize_party_name(rawCreditorName || null),
    creditorAccount: null,
    remittanceInformation: {
      raw: rawDescription || null,
      structured: { invoiceNumber: invoiceFromDesc },
    },
    description: rawDescription || null,
    rawDescription: rawDescription || null,
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
