import { describe, expect, it } from "vitest";
import { parseBankStatements, parseBankStatementText } from "./bank-statements";

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

const CROSS_BORDER_CSV = `date,description,amount,direction,payer
2026-05-24,TT20260524XYZ TT INWARD FROM ABC INC USD 10.00 @ FX 4.25 LESS RM0.50 FEE NET RM42.00,42.00,CR,ABC INC`;

const TEXT_LAYER_STATEMENT_WITH_RUNNING_BALANCE = `Currency MYR
Opening Balance MYR 85,000.55
Transaction Details
Date Description Debit (MYR) Credit (MYR) Balance (MYR) Reference
2026-05-01 DUITNOW DEBIT RENT MENARA EXCHANGE 106 MAY26 8,500.00 76,500.55 RENT-MAY26
2026-05-05 WISE PAYOUT ACME PTE MIXED CURRENCY INV1001 RP1002 53,050.00 129,550.55 WISE-ACM-66210
2026-05-06 MEPS GIRO PAYROLL APRIL 2026 28,400.00 101,150.55 PAYROLL-APR26
2026-05-07 TT INWARD FROM PT NUSANTARA DATAWORKS USD7200 REF TT-349820 31,007.00 132,157.55 TT-349820
2026-05-08 SWIFT INWARD TT BANGKOK RETAIL EUR4000 LESS BNF CHG RM40 REF BR-1004-PART 18,720.00 150,877.55 BR-1004-PART
2026-05-09 FPX PAYMENT TM UNIFI BUSINESS MAY26 419.00 150,458.55 UNIFI-MAY26
2026-05-11 FOREIGN TT FROM SOUTHERN CROSS AUD25000 LESS BNF CHG REF SCX-MAY-25 71,875.00 222,333.55 SCX-MAY-25
2026-05-12 DEBIT CARD AWS CLOUD SERVICES AP-SOUTHEAST-1 628.40 221,705.15 AWS-MAY26
2026-05-13 TT INWARD FROM GREENLEDGER LTD GBP9150 @5.4200 LESS BNF CHG RM32 REF INV1006-GL 49,561.00 271,266.15 INV1006-GL
2026-05-14 CARD SETTLEMENT STRIPE NORTH SEA EUR NET PAYOUT REF STP-NSR-1007 56,660.95 327,927.10 STP-NSR-1007
2026-05-15 PAYPAL WITHDRAWAL HARBOUR VALE USD3136 REF PP-HV-MAY26 13,402.08 341,329.18 PP-HV-MAY26
2026-05-15 MAYBANK TT SERVICE CHARGE MAY15 35.00 341,294.18 CHG-TT-MAY15
2026-05-18 BANK-IN CREDIT PACIFIC CLOUD AUD13500 @2.9100 LESS BNF CHG RM25 REF RCN1010 39,260.00 380,554.18 RCN1010
2026-05-19 REMITTANCE CREDIT EURONEXT RETAIL EUR8000 REF MISSING 37,360.00 417,914.18 RM-552901
2026-05-20 IBG CREDIT KOPICLOUD ID MAY SUBSCRIPTION 5,400.00 423,314.18 KC-MAY
2026-05-21 GIRO CREDIT SIAM GREENMART MYR SETTLEMENT RP1012 8,500.00 431,814.18 RP1012
2026-05-22 PAYNOW CREDIT STRAITS TECH MAY26 12,000.00 443,814.18 MAY26-ST
2026-05-25 PAYNOW CREDIT MERLION FOODS REF 2231 22,580.00 466,394.18 2231
2026-05-27 TT CREDIT /GLOBAL EXPORTS/REF 88291 29,650.00 496,044.18 88291
2026-05-29 LHDN PAYMENT CP204 MAY 2026 1,800.00 494,244.18 LHDN-MAY26`;

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

  it("extracts cross-border FX clues from bank narration without LLM", () => {
    const { records } = parseBankStatements(CROSS_BORDER_CSV, "csv", "bank_fx", "MYR_MAIN");
    expect(records[0]).toMatchObject({
      description: "TT20260524XYZ TT INWARD FROM ABC INC USD 10.00 @ FX 4.25 LESS RM0.50 FEE NET RM42.00",
      amount: { value: "42.00", currency: "MYR" },
      amountReceived: { value: "42.50", currency: "MYR" },
      sourceAmount: { value: "10.00", currency: "USD" },
      exchangeRateApplied: "4.25",
      bankFeeDeducted: { value: "0.50", currency: "MYR" },
      feeCurrency: "MYR",
      netCreditAmount: { value: "42.00", currency: "MYR" },
      referenceNo: "TT20260524XYZ",
      ttNo: "TT20260524XYZ",
      remarks: "TT20260524XYZ TT INWARD FROM ABC INC USD 10.00 @ FX 4.25 LESS RM0.50 FEE NET RM42.00"
    });
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

describe("parseBankStatementText", () => {
  it("extracts every row from a text-layer bank statement with running balances", () => {
    const { records } = parseBankStatementText(TEXT_LAYER_STATEMENT_WITH_RUNNING_BALANCE, "bank_pdf", "MYR_MAIN");
    expect(records).toHaveLength(20);
    expect(records.filter((record) => record.creditDebitIndicator === "CRDT")).toHaveLength(14);
    expect(records.filter((record) => record.creditDebitIndicator === "DBIT")).toHaveLength(6);
    expect(records[0]).toMatchObject({
      bookingDate: "2026-05-01",
      creditDebitIndicator: "DBIT",
      amount: { value: "8500.00", currency: "MYR" },
      referenceNo: "RENT-MAY26"
    });
    expect(records[18]).toMatchObject({
      bookingDate: "2026-05-27",
      creditDebitIndicator: "CRDT",
      amount: { value: "29650.00", currency: "MYR" },
      referenceNo: "88291"
    });
  });
});
