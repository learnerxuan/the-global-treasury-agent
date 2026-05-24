import { describe, expect, it } from "vitest";
import { parseBankStatements } from "./bank-statements";

// ─── Format A fixtures (single amount + direction column) ─────────────────────

const FORMAT_A_CSV = `date,description,amount,direction,payer
2026-05-20,Foreign inward remittance INV-1001 ACME,42.50,CR,ACME PTE LTD
2026-05-21,Foreign inward remittance INV-1002 BETA SDN BHD,250.00,CR,BETA SDN BHD
2026-05-22,Bank service charge,5.00,DR,`;

const FORMAT_A_FULL_WORDS_CSV = `date,description,amount,direction,payer
2026-05-20,Foreign inward remittance INV-1001,42.50,CREDIT,ACME PTE LTD
2026-05-21,Bank fee,5.00,DEBIT,`;

const FORMAT_A_NEGATIVE_CSV = `date,description,amount,payer
2026-05-20,Inward remittance INV-1001,42.50,ACME PTE LTD
2026-05-22,Bank charge,-5.00,`;

// ─── Format B fixtures (split credit / debit columns) ─────────────────────────

const FORMAT_B_CSV = `date,description,credit,debit,payer
2026-05-20,Foreign inward remittance INV-1001 ACME,42.50,,ACME PTE LTD
2026-05-21,Foreign inward remittance INV-1002 BETA,250.00,,BETA SDN BHD
2026-05-22,Bank service charge,,5.00,`;

// ─── Edge-case fixtures ────────────────────────────────────────────────────────

const UNMAPPED_COLUMN_CSV = `date,description,amount,direction,payer,branch_code
2026-05-20,INV-1001 payment,42.50,CR,ACME PTE LTD,MY001`;

const INVALID_DATE_CSV = `date,description,amount,direction,payer
20/05/2026,INV-1001 payment,42.50,CR,ACME PTE LTD`;

const INVALID_AMOUNT_CSV = `date,description,amount,direction,payer
2026-05-20,INV-1001 payment,not-a-number,CR,ACME PTE LTD`;

const WITH_CURRENCY_COL_CSV = `date,description,amount,direction,currency,payer
2026-05-20,INV-1001 payment,10.00,CR,USD,ACME PTE LTD`;

// ─── Format A tests ───────────────────────────────────────────────────────────

describe("parseBankStatements — Format A", () => {
  it("returns one record per data row", () => {
    const { records } = parseBankStatements(FORMAT_A_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records).toHaveLength(3);
  });

  it("sets schemaVersion and accountId on every record", () => {
    const { records } = parseBankStatements(FORMAT_A_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records.every((r) => r.schemaVersion === "1.0.0")).toBe(true);
    expect(records.every((r) => r.accountId === "MYR_MAIN")).toBe(true);
  });

  it("maps CR direction to CRDT", () => {
    const { records } = parseBankStatements(FORMAT_A_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records[0]!.creditDebitIndicator).toBe("CRDT");
  });

  it("maps DR direction to DBIT", () => {
    const { records } = parseBankStatements(FORMAT_A_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records[2]!.creditDebitIndicator).toBe("DBIT");
  });

  it("maps full-word CREDIT and DEBIT direction values", () => {
    const { records } = parseBankStatements(FORMAT_A_FULL_WORDS_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records[0]!.creditDebitIndicator).toBe("CRDT");
    expect(records[1]!.creditDebitIndicator).toBe("DBIT");
  });

  it("infers DBIT from negative amount when no direction column exists", () => {
    const { records } = parseBankStatements(FORMAT_A_NEGATIVE_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records[0]!.creditDebitIndicator).toBe("CRDT"); // positive → CRDT
    expect(records[1]!.creditDebitIndicator).toBe("DBIT"); // negative → DBIT
  });

  it("stores the absolute amount value (no sign)", () => {
    const { records } = parseBankStatements(FORMAT_A_NEGATIVE_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records[1]!.amount.value).toBe("5.00");
  });

  it("parses booking date", () => {
    const { records } = parseBankStatements(FORMAT_A_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records[0]!.bookingDate).toBe("2026-05-20");
  });

  it("extracts INV-XXXX from description into structured remittance", () => {
    const { records } = parseBankStatements(FORMAT_A_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records[0]!.remittanceInformation.structured?.invoiceNumber).toBe("INV-1001");
    expect(records[1]!.remittanceInformation.structured?.invoiceNumber).toBe("INV-1002");
  });

  it("sets remittanceInformation.raw to the description text", () => {
    const { records } = parseBankStatements(FORMAT_A_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records[0]!.remittanceInformation.raw).toContain("INV-1001");
  });

  it("normalizes debtor name by stripping legal suffix", () => {
    const { records } = parseBankStatements(FORMAT_A_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records[0]!.debtorName).toBe("ACME PTE LTD");
    expect(records[0]!.debtorNormalizedName).toBe("ACME");
    expect(records[1]!.debtorNormalizedName).toBe("BETA");
  });

  it("sets sourceFileId and sourceRowNumber", () => {
    const { records } = parseBankStatements(FORMAT_A_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records[0]!.sourceFileId).toBe("bank_001");
    expect(records[0]!.sourceRowNumber).toBe(2);
  });

  it("emits no batch warnings for a clean file", () => {
    const { warnings } = parseBankStatements(FORMAT_A_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(warnings).toHaveLength(0);
  });

  it("uses currency column when present", () => {
    const { records } = parseBankStatements(WITH_CURRENCY_COL_CSV, "csv", "bank_001", "MYR_MAIN");
    expect(records[0]!.amount.currency).toBe("USD");
  });
});

// ─── Format B tests ───────────────────────────────────────────────────────────

describe("parseBankStatements — Format B", () => {
  it("detects Format B from split credit/debit headers", () => {
    const { records } = parseBankStatements(FORMAT_B_CSV, "csv", "bank_002", "MYR_MAIN");
    expect(records).toHaveLength(3);
  });

  it("credit column row → CRDT indicator", () => {
    const { records } = parseBankStatements(FORMAT_B_CSV, "csv", "bank_002", "MYR_MAIN");
    expect(records[0]!.creditDebitIndicator).toBe("CRDT");
    expect(records[0]!.amount.value).toBe("42.50");
  });

  it("debit column row → DBIT indicator", () => {
    const { records } = parseBankStatements(FORMAT_B_CSV, "csv", "bank_002", "MYR_MAIN");
    expect(records[2]!.creditDebitIndicator).toBe("DBIT");
    expect(records[2]!.amount.value).toBe("5.00");
  });

  it("extracts invoice number from description in Format B", () => {
    const { records } = parseBankStatements(FORMAT_B_CSV, "csv", "bank_002", "MYR_MAIN");
    expect(records[0]!.remittanceInformation.structured?.invoiceNumber).toBe("INV-1001");
  });

  it("normalizes debtor name in Format B", () => {
    const { records } = parseBankStatements(FORMAT_B_CSV, "csv", "bank_002", "MYR_MAIN");
    expect(records[0]!.debtorNormalizedName).toBe("ACME");
  });
});

// ─── Edge-case tests ──────────────────────────────────────────────────────────

describe("parseBankStatements — edge cases", () => {
  it("emits UNMAPPED_COLUMN for unknown headers", () => {
    const { warnings } = parseBankStatements(UNMAPPED_COLUMN_CSV, "csv", "bank_003", "MYR_MAIN");
    expect(warnings.some((w) => w.code === "UNMAPPED_COLUMN" && w.field === "branch_code")).toBe(true);
  });

  it("emits INVALID_DATE_FORMAT on the record and falls back to today", () => {
    const { records } = parseBankStatements(INVALID_DATE_CSV, "csv", "bank_004", "MYR_MAIN");
    expect(records[0]!.warnings.some((w) => w.code === "INVALID_DATE_FORMAT")).toBe(true);
    expect(records[0]!.bookingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("emits INVALID_MONEY_FORMAT on the record and falls back to 0.00", () => {
    const { records } = parseBankStatements(INVALID_AMOUNT_CSV, "csv", "bank_005", "MYR_MAIN");
    expect(records[0]!.warnings.some((w) => w.code === "INVALID_MONEY_FORMAT")).toBe(true);
    expect(records[0]!.amount.value).toBe("0.00");
  });

  it("returns empty arrays for an empty CSV", () => {
    const { records, warnings } = parseBankStatements("", "csv", "bank_006", "MYR_MAIN");
    expect(records).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});
