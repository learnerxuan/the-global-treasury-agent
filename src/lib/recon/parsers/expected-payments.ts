import Papa from "papaparse";
import * as XLSX from "xlsx";

import { normalize_currency_amount, normalize_date, normalize_party_name, normalize_reference } from "../normalizers";
import type { ExpectedPaymentRecord, FieldEvidence, Warning } from "../types";

// ─── Column Aliases ───────────────────────────────────────────────────────────

type FieldKey =
  | "invoiceNumber"
  | "issueDate"
  | "dueDate"
  | "debtorName"
  | "creditorName"
  | "amount"
  | "currency"
  | "settlementCurrency"
  | "paymentTerms";

const REQUIRED_FIELDS: FieldKey[] = ["invoiceNumber", "amount", "debtorName"];

// Keys are normalized header strings (lowercase, underscores→spaces, trimmed)
const COLUMN_ALIASES: Record<FieldKey, string[]> = {
  invoiceNumber: ["invoice number", "inv number", "inv no", "invoice no", "invoice#", "inv", "reference", "ref"],
  issueDate: ["issue date", "invoice date", "date", "inv date", "issued"],
  dueDate: ["due date", "due by", "payment due", "due"],
  debtorName: ["customer", "payer", "debtor", "client", "buyer", "company", "debtor name", "customer name", "payer name"],
  creditorName: ["creditor", "seller", "vendor", "supplier", "creditor name", "seller name"],
  amount: ["amount", "amount due", "total", "invoice amount", "total amount", "outstanding"],
  currency: ["currency", "invoice currency", "ccy", "invoice ccy"],
  settlementCurrency: ["settlement currency", "payment currency", "settlement ccy"],
  paymentTerms: ["payment terms", "terms"],
};

// ─── Header Normalisation ─────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Column Mapping ───────────────────────────────────────────────────────────

type ColumnMap = Partial<Record<FieldKey, string>>;

function mapColumns(headers: string[]): { columnMap: ColumnMap; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const columnMap: ColumnMap = {};
  const claimed = new Set<FieldKey>();

  for (const header of headers) {
    const norm = normalizeHeader(header);
    const matches: FieldKey[] = [];

    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [FieldKey, string[]][]) {
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

  for (const field of REQUIRED_FIELDS) {
    if (!columnMap[field]) {
      warnings.push({ code: "MISSING_REQUIRED_COLUMN", message: `Required column for "${field}" not found in headers`, field });
    }
  }

  return { columnMap, warnings };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MVP_CURRENCIES = new Set(["MYR", "USD", "SGD", "EUR"]);
type MvpCurrency = "MYR" | "USD" | "SGD" | "EUR";

function extractCurrencyFromAmount(raw: string): { currencyCode: string | null; amountStr: string } {
  const match = raw.trim().match(/^([A-Z]{3})\s+(.+)$/);
  if (match && MVP_CURRENCIES.has(match[1]!)) return { currencyCode: match[1]!, amountStr: match[2]! };
  return { currencyCode: null, amountStr: raw };
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Row → ExpectedPaymentRecord ──────────────────────────────────────────────

function buildRecord(
  row: Record<string, string>,
  columnMap: ColumnMap,
  rowNumber: number,
  sourceFileId: string,
): ExpectedPaymentRecord {
  const warnings: Warning[] = [];
  const evidenceSpans: FieldEvidence[] = [];
  const fieldConfidence: Record<string, number> = {};

  const get = (field: FieldKey): string => {
    const col = columnMap[field];
    return col !== undefined ? (row[col] ?? "").toString().trim() : "";
  };

  // Invoice number
  const rawInvoiceNumber = get("invoiceNumber");
  const invoiceNumber = rawInvoiceNumber || `UNKNOWN-${rowNumber}`;
  const normalizedRef = normalize_reference(rawInvoiceNumber || null);
  fieldConfidence["invoiceNumber"] = rawInvoiceNumber ? 1 : 0;
  if (rawInvoiceNumber) {
    evidenceSpans.push({ field: "invoiceNumber", value: rawInvoiceNumber, originalValue: rawInvoiceNumber, normalizedValue: normalizedRef, confidence: 1, source: "csv", evidenceText: `invoice_number=${rawInvoiceNumber}`, page: null, bbox: null, warnings: [] });
  }

  // Debtor
  const rawDebtorName = get("debtorName");
  if (!rawDebtorName) warnings.push({ code: "MISSING_DEBTOR", message: "Debtor name is empty", field: "debtor.name" });
  const debtorNormalizedName = normalize_party_name(rawDebtorName || null);
  fieldConfidence["debtor.name"] = rawDebtorName ? 1 : 0;

  // Creditor
  const rawCreditorName = get("creditorName");
  const creditorNormalizedName = normalize_party_name(rawCreditorName || null);

  // Issue date
  const rawIssueDate = get("issueDate");
  const issueDateNorm = normalize_date(rawIssueDate || null);
  if (rawIssueDate && !issueDateNorm) warnings.push({ code: "INVALID_DATE_FORMAT", message: `Issue date "${rawIssueDate}" is not a recognised ISO date`, field: "issueDate" });
  const issueDate = issueDateNorm ?? isoToday();

  // Due date
  const rawDueDate = get("dueDate");
  const dueDateNorm = normalize_date(rawDueDate || null);
  if (rawDueDate && !dueDateNorm) warnings.push({ code: "INVALID_DATE_FORMAT", message: `Due date "${rawDueDate}" is not a recognised ISO date`, field: "dueDate" });

  // Amount + embedded currency
  const rawAmount = get("amount");
  const { currencyCode: embeddedCurrency, amountStr } = extractCurrencyFromAmount(rawAmount);
  const normalizedAmount = normalize_currency_amount(amountStr || null);
  if (rawAmount && !normalizedAmount) warnings.push({ code: "INVALID_MONEY_FORMAT", message: `Amount "${rawAmount}" could not be parsed as a non-negative decimal`, field: "amountDue.value" });
  fieldConfidence["amountDue.value"] = normalizedAmount ? 1 : 0;
  if (rawAmount && normalizedAmount) {
    evidenceSpans.push({ field: "amountDue.value", value: normalizedAmount, originalValue: rawAmount, normalizedValue: normalizedAmount, confidence: 1, source: "csv", evidenceText: `amount=${rawAmount}`, page: null, bbox: null, warnings: [] });
  }

  // Currency — embedded in amount > explicit column > default USD
  const rawCurrency = get("currency").toUpperCase();
  const resolvedCurrency = embeddedCurrency ?? (rawCurrency.length === 3 ? rawCurrency : null);
  if (resolvedCurrency && !MVP_CURRENCIES.has(resolvedCurrency)) {
    warnings.push({ code: "INVALID_CURRENCY", message: `Currency "${resolvedCurrency}" is not supported (MYR, USD, SGD, EUR)`, field: "invoiceCurrency" });
  }
  const invoiceCurrency: MvpCurrency = resolvedCurrency && MVP_CURRENCIES.has(resolvedCurrency) ? (resolvedCurrency as MvpCurrency) : "USD";
  fieldConfidence["amountDue.currency"] = resolvedCurrency ? 1 : 0.5;

  // Settlement currency
  const rawSettlementCurrency = get("settlementCurrency").toUpperCase();
  const settlementCurrency: MvpCurrency = rawSettlementCurrency && MVP_CURRENCIES.has(rawSettlementCurrency) ? (rawSettlementCurrency as MvpCurrency) : "MYR";

  // Payment terms
  const rawPaymentTerms = get("paymentTerms");

  const amountValue = normalizedAmount ?? "0.00";

  return {
    schemaVersion: "1.0.0",
    expectedPaymentId: `exp_${sourceFileId}_row${String(rowNumber).padStart(3, "0")}`,
    invoiceNumber,
    issueDate,
    dueDate: dueDateNorm ?? null,
    creditor: { name: rawCreditorName || null, normalizedName: creditorNormalizedName },
    debtor: { name: rawDebtorName || null, normalizedName: debtorNormalizedName },
    creditorAccount: null,
    debtorAccount: null,
    invoiceCurrency,
    amountDue: { value: amountValue, currency: invoiceCurrency },
    expectedSettlementCurrency: settlementCurrency,
    paymentReference: { raw: rawInvoiceNumber || null, normalized: normalizedRef },
    reconciliationStatus: "OPEN",
    debtorReference: null,
    purchaseOrderReference: null,
    paymentTerms: rawPaymentTerms || null,
    outstandingAmount: { value: amountValue, currency: invoiceCurrency },
    sourceFileId,
    sourceRowNumber: rowNumber,
    fieldConfidence,
    evidenceSpans,
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

export type ParseExpectedPaymentsResult = {
  records: ExpectedPaymentRecord[];
  warnings: Warning[];
};

export function parseExpectedPayments(
  content: string | Buffer,
  format: "csv" | "xlsx",
  sourceFileId: string,
): ParseExpectedPaymentsResult {
  const rows = parseRows(content, format);
  const firstRow = rows[0];
  if (!firstRow) return { records: [], warnings: [] };

  const headers = Object.keys(firstRow);
  const { columnMap, warnings: batchWarnings } = mapColumns(headers);

  const records = rows.map((row, i) => buildRecord(row, columnMap, i + 2, sourceFileId));

  return { records, warnings: batchWarnings };
}
