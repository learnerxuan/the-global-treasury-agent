import { describe, expect, it } from "vitest";
import { parseExpectedPayments } from "./expected-payments";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STANDARD_CSV = `invoice_number,customer,issue_date,due_date,amount,currency,settlement_currency
INV-1001,Acme Pte Ltd,2026-05-19,2026-06-18,10.00,USD,MYR
INV-1002,Beta Sdn Bhd,2026-05-20,2026-06-19,250.00,USD,MYR`;

const FLEXIBLE_HEADERS_CSV = `inv no,payer,date,due by,total,ccy
INV-1001,Acme Pte Ltd,2026-05-19,2026-06-18,10.00,USD`;

const EMBEDDED_CURRENCY_CSV = `invoice_number,customer,amount
INV-1001,Acme Pte Ltd,USD 10.00`;

const UNMAPPED_COLUMN_CSV = `invoice_number,customer,amount,currency,branch_code
INV-1001,Acme Pte Ltd,10.00,USD,SG001`;

const MISSING_REQUIRED_COLUMN_CSV = `customer,amount,currency
Acme Pte Ltd,10.00,USD`;

const INVALID_AMOUNT_CSV = `invoice_number,customer,amount,currency
INV-1001,Acme Pte Ltd,not-a-number,USD`;

const INVALID_DATE_CSV = `invoice_number,customer,issue_date,amount,currency
INV-1001,Acme Pte Ltd,19/05/2026,10.00,USD`;

const UNSUPPORTED_CURRENCY_CSV = `invoice_number,customer,amount,currency
INV-1001,Acme Pte Ltd,10.00,GBP`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("parseExpectedPayments — standard CSV", () => {
  it("returns one record per data row", () => {
    const { records } = parseExpectedPayments(STANDARD_CSV, "csv", "file_001");
    expect(records).toHaveLength(2);
  });

  it("parses invoice number correctly", () => {
    const { records } = parseExpectedPayments(STANDARD_CSV, "csv", "file_001");
    expect(records[0]!.invoiceNumber).toBe("INV-1001");
  });

  it("normalizes payment reference from invoice number", () => {
    const { records } = parseExpectedPayments(STANDARD_CSV, "csv", "file_001");
    expect(records[0]!.paymentReference.raw).toBe("INV-1001");
    expect(records[0]!.paymentReference.normalized).toBe("INV1001");
  });

  it("normalizes debtor name by stripping legal suffix", () => {
    const { records } = parseExpectedPayments(STANDARD_CSV, "csv", "file_001");
    expect(records[0]!.debtor.name).toBe("Acme Pte Ltd");
    expect(records[0]!.debtor.normalizedName).toBe("ACME");
    expect(records[1]!.debtor.normalizedName).toBe("BETA");
  });

  it("parses amount and currency", () => {
    const { records } = parseExpectedPayments(STANDARD_CSV, "csv", "file_001");
    expect(records[0]!.amountDue).toEqual({ value: "10.00", currency: "USD" });
  });

  it("parses issue date and due date", () => {
    const { records } = parseExpectedPayments(STANDARD_CSV, "csv", "file_001");
    expect(records[0]!.issueDate).toBe("2026-05-19");
    expect(records[0]!.dueDate).toBe("2026-06-18");
  });

  it("sets reconciliationStatus to OPEN on every record", () => {
    const { records } = parseExpectedPayments(STANDARD_CSV, "csv", "file_001");
    expect(records.every((r) => r.reconciliationStatus === "OPEN")).toBe(true);
  });

  it("sets schemaVersion to 1.0.0 on every record", () => {
    const { records } = parseExpectedPayments(STANDARD_CSV, "csv", "file_001");
    expect(records.every((r) => r.schemaVersion === "1.0.0")).toBe(true);
  });

  it("sets sourceFileId and sourceRowNumber", () => {
    const { records } = parseExpectedPayments(STANDARD_CSV, "csv", "file_001");
    expect(records[0]!.sourceFileId).toBe("file_001");
    expect(records[0]!.sourceRowNumber).toBe(2);
    expect(records[1]!.sourceRowNumber).toBe(3);
  });

  it("emits no batch warnings for a clean file", () => {
    const { warnings } = parseExpectedPayments(STANDARD_CSV, "csv", "file_001");
    expect(warnings).toHaveLength(0);
  });

  it("includes invoiceNumber evidence span", () => {
    const { records } = parseExpectedPayments(STANDARD_CSV, "csv", "file_001");
    const span = records[0]!.evidenceSpans.find((s) => s.field === "invoiceNumber");
    expect(span?.originalValue).toBe("INV-1001");
    expect(span?.normalizedValue).toBe("INV1001");
    expect(span?.source).toBe("csv");
  });
});

describe("parseExpectedPayments — flexible column names", () => {
  it("maps alternative header names to the right fields", () => {
    const { records, warnings } = parseExpectedPayments(FLEXIBLE_HEADERS_CSV, "csv", "file_002");
    expect(records).toHaveLength(1);
    expect(records[0]!.invoiceNumber).toBe("INV-1001");
    expect(records[0]!.debtor.name).toBe("Acme Pte Ltd");
    expect(records[0]!.amountDue.value).toBe("10.00");
    expect(warnings.filter((w) => w.code === "MISSING_REQUIRED_COLUMN")).toHaveLength(0);
  });
});

describe("parseExpectedPayments — embedded currency in amount", () => {
  it("extracts currency code from amount column", () => {
    const { records } = parseExpectedPayments(EMBEDDED_CURRENCY_CSV, "csv", "file_003");
    expect(records[0]!.amountDue).toEqual({ value: "10.00", currency: "USD" });
  });
});

describe("parseExpectedPayments — unmapped column", () => {
  it("emits UNMAPPED_COLUMN warning for unknown headers", () => {
    const { warnings } = parseExpectedPayments(UNMAPPED_COLUMN_CSV, "csv", "file_004");
    expect(warnings.some((w) => w.code === "UNMAPPED_COLUMN" && w.field === "branch_code")).toBe(true);
  });

  it("still parses records despite unmapped columns", () => {
    const { records } = parseExpectedPayments(UNMAPPED_COLUMN_CSV, "csv", "file_004");
    expect(records).toHaveLength(1);
    expect(records[0]!.invoiceNumber).toBe("INV-1001");
  });
});

describe("parseExpectedPayments — missing required column", () => {
  it("emits MISSING_REQUIRED_COLUMN warning when invoiceNumber column is absent", () => {
    const { warnings } = parseExpectedPayments(MISSING_REQUIRED_COLUMN_CSV, "csv", "file_005");
    expect(warnings.some((w) => w.code === "MISSING_REQUIRED_COLUMN" && w.field === "invoiceNumber")).toBe(true);
  });
});

describe("parseExpectedPayments — invalid amount", () => {
  it("emits INVALID_MONEY_FORMAT on the record and falls back to 0.00", () => {
    const { records } = parseExpectedPayments(INVALID_AMOUNT_CSV, "csv", "file_006");
    expect(records[0]!.warnings.some((w) => w.code === "INVALID_MONEY_FORMAT")).toBe(true);
    expect(records[0]!.amountDue.value).toBe("0.00");
  });
});

describe("parseExpectedPayments — invalid date", () => {
  it("emits INVALID_DATE_FORMAT on the record and falls back to today", () => {
    const { records } = parseExpectedPayments(INVALID_DATE_CSV, "csv", "file_007");
    expect(records[0]!.warnings.some((w) => w.code === "INVALID_DATE_FORMAT")).toBe(true);
    // Falls back to today — just check it's a valid ISO date
    expect(records[0]!.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("parseExpectedPayments — unsupported currency", () => {
  it("emits INVALID_CURRENCY and defaults to USD", () => {
    const { records } = parseExpectedPayments(UNSUPPORTED_CURRENCY_CSV, "csv", "file_008");
    expect(records[0]!.warnings.some((w) => w.code === "INVALID_CURRENCY")).toBe(true);
    expect(records[0]!.amountDue.currency).toBe("USD");
  });
});

describe("parseExpectedPayments — empty content", () => {
  it("returns empty arrays for an empty CSV", () => {
    const { records, warnings } = parseExpectedPayments("", "csv", "file_009");
    expect(records).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});
