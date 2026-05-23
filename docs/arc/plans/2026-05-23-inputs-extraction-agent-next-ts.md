# Plan: ReconPilot Inputs + Extraction Agent

Status: ready for implementation
Scope: components 1 and 2 from the architecture image
Stack: Next.js App Router, TypeScript, Zod, Vitest
Date: 2026-05-23

## Goal

Build the first two ReconPilot blocks:

1. Inputs
   - Expected payment records from CSV/XLSX-like rows.
   - Payment proofs from image/PDF/text descriptors.
   - Local bank statement records from CSV/XLSX-like rows.
2. Agent 1: Extraction Agent
   - Inspect payment proof file type and quality.
   - Choose `ocrImage`, `parsePdfText`, `parsePdfTables`, or `requestManualCorrection`.
   - Output structured payment/remittance evidence JSON with confidence and evidence spans.
   - Write visible agent activity timeline events.

This plan intentionally stops before reconciliation matching. Agent 1 extracts only. It must not match invoices to bank rows, calculate FX conclusions, or make reconciliation decisions.

## Standards To Follow

- Expected payment records: UBL/Peppol/EN16931-inspired invoice/payment terms. Use only the fields needed to answer whether an expected receivable could be explained by a payment proof and bank receipt.
- Bank statement rows: ISO 20022 camt.053-inspired booked transaction shape. One row per booked transaction, with `CRDT`/`DBIT`, booking date, value date, account, amount, currency, counterparty, references, and remittance info.
- Payment proof extraction: ISO 20022/provider receipt-inspired evidence shape. Capture parties, amounts, currencies, dates, payment status, references, FX/fees when present, and field-level evidence.
- Currencies: ISO 4217 uppercase alpha codes such as `USD`, `MYR`, `SGD`.
- Dates: ISO 8601 calendar dates as `YYYY-MM-DD`.
- Amounts: store decimal strings for parsed financial values. Convert to numbers only for display or tests that do not affect money math.

Useful references captured during planning:

- Peppol BIS Billing 3.0: https://docs.peppol.eu/poacc/billing/3.0/bis/
- OASIS UBL 2.1: https://docs.oasis-open.org/ubl/UBL-2.1.html
- ISO 4217: https://www.iso.org/iso-4217-currency-codes.html
- ISO 8601: https://www.iso.org/iso-8601-date-and-time-format.html
- ISO 20022 camt.053 definitions: https://www.iso20022.org/iso-20022-message-definitions?search=camt.053
- Swift ISO 20022 context: https://www.swift.com/standards/iso-20022
- Wise transfer/quote API fields: https://docs.wise.com/api-reference/transfer
- PayPal transaction search fields: https://developer.paypal.com/docs/api/transaction-search/v1/
- Stripe balance transaction fields: https://docs.stripe.com/api/balance_transactions/object

## Core Rules

- All extracted important fields must include confidence and source evidence.
- Preserve raw values and create normalized values separately.
- Low confidence, missing key values, or ambiguous proof quality triggers manual correction.
- Bank rows use positive `amount` plus `creditDebitIndicator`; do not mix signed values with direction.
- Do not use the LLM or extraction agent for money math.
- Do not implement full UBL, Peppol, ISO 20022 XML, accounting ledgers, tax, journal entries, or bank account storage in this phase.

```xml
<implementation_plan>
  <task id="01">
    <name>Bootstrap the Next.js + TypeScript project foundation</name>
    <files>
      <file>package.json</file>
      <file>tsconfig.json</file>
      <file>next.config.ts</file>
      <file>vitest.config.ts</file>
      <file>src/app/layout.tsx</file>
      <file>src/app/page.tsx</file>
      <file>src/test/setup.ts</file>
    </files>
    <read_first>
      <file>FINAL_RECONPILOT_BLUEPRINT.md</file>
      <file>.gitignore</file>
    </read_first>
    <action><![CDATA[
Create the minimal Next.js App Router application in TypeScript.

Use npm scripts:

{
  "dev": "next dev",
  "build": "next build",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "demo:extract": "tsx src/scripts/run-extraction-demo.ts"
}

Install/use these packages:

- next
- react
- react-dom
- zod
- vitest
- tsx
- typescript
- @types/node
- @types/react
- @types/react-dom

Keep the first page simple: a project title, a short "Inputs + Extraction Agent" label, and placeholders for the three input groups. Do not build the dashboard yet.
    ]]></action>
    <test_code><![CDATA[
Create src/app/page.test.tsx only if a React test setup already exists. Otherwise, rely on typecheck for the initial shell.

Expected initial verification:

npm run typecheck
npm test
    ]]></test_code>
    <verify>
      <step>`npm run typecheck` passes.</step>
      <step>`npm test` exits successfully, even if no tests are discovered yet only if Vitest is configured that way.</step>
      <step>`npm run dev` can start later without changing project files.</step>
    </verify>
    <done>
      The repo has a working Next.js + TypeScript skeleton and test runner.
    </done>
    <commit>chore: scaffold next typescript foundation</commit>
  </task>

  <task id="02">
    <name>Define finance-standard data schemas and TypeScript types</name>
    <files>
      <file>src/lib/recon/types.ts</file>
      <file>src/lib/recon/schemas.ts</file>
      <file>src/lib/recon/schemas.test.ts</file>
    </files>
    <read_first>
      <file>FINAL_RECONPILOT_BLUEPRINT.md</file>
      <file>docs/arc/plans/2026-05-23-inputs-extraction-agent-next-ts.md</file>
    </read_first>
    <action><![CDATA[
Create Zod schemas and inferred TypeScript types for the three input families plus shared evidence primitives.

Shared primitives:

- CurrencyCode: 3 uppercase letters, validated against a small MVP allowlist first: USD, MYR, SGD, EUR, GBP, AUD, JPY, CNY, IDR, THB.
- IsoDate: `YYYY-MM-DD`.
- MoneyAmount: { value: string; currency: CurrencyCode }.
- Party: { name: string | null; normalizedName?: string | null }.
- ReferenceValue: { raw: string | null; normalized?: string | null }.
- FieldEvidence:
  - field: string
  - value: unknown
  - confidence: number from 0 to 1
  - source: "ocr" | "pdf_text" | "pdf_table" | "manual" | "csv" | "xlsx" | "fixture"
  - evidenceText: string | null
  - page?: number | null
  - bbox?: { x: number; y: number; width: number; height: number } | null
  - warnings: string[]

ExpectedPaymentRecord:

- expectedPaymentId
- invoiceNumber
- issueDate
- dueDate
- seller: Party
- buyer: Party
- invoiceCurrency
- amountDue: MoneyAmount
- expectedSettlementCurrency
- paymentReference: ReferenceValue
- buyerReference?
- purchaseOrderReference?
- paymentTerms?
- outstandingAmount?
- sourceFileId
- sourceRowNumber?
- fieldConfidence
- evidenceSpans
- warnings

BankStatementTransaction:

- transactionId
- accountId
- bookingDate
- valueDate?
- creditDebitIndicator: "CRDT" | "DBIT"
- amount: MoneyAmount
- counterpartyName?
- remittanceInfo?
- bankReference?
- description
- accountServicerReference?
- endToEndId?
- bankTransactionCode?
- rawDescription?
- sourceFileId
- sourceRowNumber?
- warnings

PaymentProofExtraction:

- proofId
- sourceFileId
- documentType: "payment_proof" | "remittance_advice" | "bank_receipt" | "provider_receipt" | "unknown"
- paymentStatus: "paid" | "pending" | "failed" | "reversed" | "unknown"
- payer: Party
- beneficiary: Party
- paidAmount: MoneyAmount | null
- paymentDate: IsoDate | null
- valueDate?: IsoDate | null
- bookingDate?: IsoDate | null
- reference: ReferenceValue
- transactionId?: string | null
- providerOrBankName?: string | null
- invoiceIds: string[]
- endToEndId?: string | null
- uetr?: string | null
- feeAmount?: MoneyAmount | null
- netAmount?: MoneyAmount | null
- sourceAmount?: MoneyAmount | null
- targetAmount?: MoneyAmount | null
- fxRate?: string | null
- fxRateType?: "fixed" | "floating" | "implied" | "unknown"
- remittanceInformation?: { raw: string | null; structured: Record<string, string> }
- rawText
- fieldConfidence: Record<string, number>
- evidenceSpans: FieldEvidence[]
- overallConfidence
- extractionRoute: "ocr_image" | "parse_pdf_text" | "parse_pdf_tables" | "manual_correction"
- requiresManualReview
- warnings

Export both Zod schemas and TypeScript types.
    ]]></action>
    <test_code><![CDATA[
import { describe, expect, it } from "vitest";
import {
  bankStatementTransactionSchema,
  expectedPaymentRecordSchema,
  paymentProofExtractionSchema,
} from "./schemas";

describe("recon schemas", () => {
  it("accepts a Peppol-inspired expected payment record", () => {
    expect(() =>
      expectedPaymentRecordSchema.parse({
        expectedPaymentId: "exp_001",
        invoiceNumber: "INV-1001",
        issueDate: "2026-05-19",
        dueDate: "2026-06-18",
        seller: { name: "ReconPilot Sdn Bhd" },
        buyer: { name: "Acme Pte Ltd" },
        invoiceCurrency: "USD",
        amountDue: { value: "10.00", currency: "USD" },
        expectedSettlementCurrency: "MYR",
        paymentReference: { raw: "INV-1001", normalized: "INV1001" },
        sourceFileId: "expected_payments.csv",
        fieldConfidence: {},
        evidenceSpans: [],
        warnings: [],
      }),
    ).not.toThrow();
  });

  it("accepts an ISO 20022-style credit bank transaction", () => {
    const parsed = bankStatementTransactionSchema.parse({
      transactionId: "txn_001",
      accountId: "MYR_MAIN",
      bookingDate: "2026-05-20",
      valueDate: "2026-05-20",
      creditDebitIndicator: "CRDT",
      amount: { value: "42.50", currency: "MYR" },
      counterpartyName: "ACME PTE LTD",
      remittanceInfo: "INV-1001",
      bankReference: "BNK-9001",
      description: "Foreign inward remittance INV-1001",
      sourceFileId: "bank.csv",
      warnings: [],
    });

    expect(parsed.creditDebitIndicator).toBe("CRDT");
  });

  it("rejects non-ISO currency codes", () => {
    expect(() =>
      paymentProofExtractionSchema.parse({
        proofId: "proof_001",
        sourceFileId: "proof.pdf",
        documentType: "provider_receipt",
        paymentStatus: "paid",
        payer: { name: "Acme" },
        beneficiary: { name: "ReconPilot" },
        paidAmount: { value: "10.00", currency: "US D" },
        paymentDate: "2026-05-20",
        reference: { raw: "INV-1001" },
        invoiceIds: ["INV-1001"],
        rawText: "Paid USD 10 for INV-1001",
        fieldConfidence: {},
        evidenceSpans: [],
        overallConfidence: 0.95,
        extractionRoute: "parse_pdf_text",
        requiresManualReview: false,
        warnings: [],
      }),
    ).toThrow();
  });
});
    ]]></test_code>
    <verify>
      <step>`npm test -- schemas` passes.</step>
      <step>`npm run typecheck` proves inferred types are valid.</step>
    </verify>
    <done>
      Schemas encode the industry-standard-inspired field contract before any parser or agent uses it.
    </done>
    <commit>feat: add recon input schemas</commit>
  </task>

  <task id="03">
    <name>Implement normalization helpers for dates, currencies, amounts, references, names, and direction</name>
    <files>
      <file>src/lib/recon/normalizers.ts</file>
      <file>src/lib/recon/normalizers.test.ts</file>
    </files>
    <read_first>
      <file>src/lib/recon/schemas.ts</file>
    </read_first>
    <action><![CDATA[
Implement deterministic normalization utilities:

- normalizeCurrency(input): uppercase and validate against the MVP ISO 4217 allowlist.
- normalizeIsoDate(input): accept only unambiguous ISO dates and common fixture dates with known format. Reject ambiguous values like `05/06/2026` unless a locale is explicitly passed.
- normalizeDecimalAmount(input): remove currency symbols and commas, return decimal string.
- normalizeReference(input): uppercase and remove spaces/punctuation, preserving the raw value elsewhere.
- normalizePartyName(input): uppercase, collapse whitespace, remove common legal suffixes only for comparison: SDN BHD, PTE LTD, LTD, LLC, INC, BERHAD.
- normalizeCreditDebitIndicator(input): map bank variants to `CRDT` or `DBIT`.
- makeDeterministicTransactionId(row): generate a stable ID when the bank row lacks one.

Do not do fuzzy matching here. These helpers are parsing infrastructure only.
    ]]></action>
    <test_code><![CDATA[
import { describe, expect, it } from "vitest";
import {
  makeDeterministicTransactionId,
  normalizeCreditDebitIndicator,
  normalizeCurrency,
  normalizeDecimalAmount,
  normalizeIsoDate,
  normalizePartyName,
  normalizeReference,
} from "./normalizers";

describe("normalizers", () => {
  it("normalizes currency, amount, reference, and names", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeDecimalAmount("RM 1,234.50")).toBe("1234.50");
    expect(normalizeReference("INV-1001 / ACME")).toBe("INV1001ACME");
    expect(normalizePartyName("Acme Pte. Ltd.")).toBe("ACME");
  });

  it("accepts clear ISO dates and rejects ambiguous slash dates", () => {
    expect(normalizeIsoDate("2026-05-20")).toBe("2026-05-20");
    expect(() => normalizeIsoDate("05/06/2026")).toThrow();
  });

  it("normalizes bank credit/debit direction", () => {
    expect(normalizeCreditDebitIndicator("Credit")).toBe("CRDT");
    expect(normalizeCreditDebitIndicator("withdrawal")).toBe("DBIT");
  });

  it("builds deterministic transaction IDs for rows without bank IDs", () => {
    const first = makeDeterministicTransactionId({
      accountId: "MYR_MAIN",
      bookingDate: "2026-05-20",
      amount: "42.50",
      direction: "CRDT",
      description: "Foreign inward remittance INV-1001",
      rowNumber: 2,
    });
    const second = makeDeterministicTransactionId({
      accountId: "MYR_MAIN",
      bookingDate: "2026-05-20",
      amount: "42.50",
      direction: "CRDT",
      description: "Foreign inward remittance INV-1001",
      rowNumber: 2,
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^bank_/);
  });
});
    ]]></test_code>
    <verify>
      <step>`npm test -- normalizers` passes.</step>
      <step>Ambiguous dates fail loudly.</step>
      <step>Amounts return decimal strings, not floats.</step>
    </verify>
    <done>
      All later parsers can produce clean, comparable data without embedding ad hoc cleanup logic.
    </done>
    <commit>feat: add recon normalization helpers</commit>
  </task>

  <task id="04">
    <name>Create input descriptors and demo fixtures for the three required input groups</name>
    <files>
      <file>src/lib/recon/input-descriptors.ts</file>
      <file>src/lib/recon/fixtures/expected-payment-rows.ts</file>
      <file>src/lib/recon/fixtures/bank-statement-rows.ts</file>
      <file>src/lib/recon/fixtures/payment-proof-descriptors.ts</file>
      <file>src/lib/recon/fixtures/index.ts</file>
      <file>src/lib/recon/fixtures/fixtures.test.ts</file>
    </files>
    <read_first>
      <file>FINAL_RECONPILOT_BLUEPRINT.md</file>
      <file>src/lib/recon/schemas.ts</file>
    </read_first>
    <action><![CDATA[
Create a lightweight input descriptor model for files without implementing real uploads yet.

InputFileDescriptor:

- fileId
- fileName
- mimeType
- inputKind: "expected_payments" | "payment_proof" | "bank_statement"
- sizeBytes?
- textLayer?: boolean
- tableLikely?: boolean
- imageQuality?: "high" | "medium" | "low"
- rawTextFixture?: string
- rawTableFixture?: string[][]
- rawOcrFixture?: string
- warnings: string[]

Fixtures must cover the architecture image and demo needs:

Expected payment rows:
- INV-1001, USD 10.00, expected settlement MYR, buyer Acme Pte Ltd.
- INV-1002, USD 100.00, with due date and buyer reference.
- INV-1003, SGD 75.00, missing optional buyer reference.

Bank statement rows:
- credit MYR 42.50 with INV-1001 reference.
- credit MYR 424.20 with fuzzy sender and bank reference.
- debit row that must remain parseable but should be ignored by future receipt matching.

Payment proof descriptors:
- scanned image receipt -> route should be `ocr_image`.
- digital PDF with text layer -> route should be `parse_pdf_text`.
- table PDF/remittance advice -> route should be `parse_pdf_tables`.
- ambiguous low-quality image -> route should be `manual_correction`.

Do not use real customer data.
    ]]></action>
    <test_code><![CDATA[
import { describe, expect, it } from "vitest";
import {
  bankStatementRows,
  expectedPaymentRows,
  paymentProofDescriptors,
} from "./fixtures";

describe("fixtures", () => {
  it("has all three required input groups", () => {
    expect(expectedPaymentRows.length).toBeGreaterThanOrEqual(3);
    expect(bankStatementRows.length).toBeGreaterThanOrEqual(3);
    expect(paymentProofDescriptors.length).toBeGreaterThanOrEqual(4);
  });

  it("forces different extraction routes for demo agency", () => {
    expect(paymentProofDescriptors.some((proof) => proof.mimeType.startsWith("image/"))).toBe(true);
    expect(paymentProofDescriptors.some((proof) => proof.textLayer)).toBe(true);
    expect(paymentProofDescriptors.some((proof) => proof.tableLikely)).toBe(true);
    expect(paymentProofDescriptors.some((proof) => proof.imageQuality === "low")).toBe(true);
  });
});
    ]]></test_code>
    <verify>
      <step>`npm test -- fixtures` passes.</step>
      <step>The fixture set can demonstrate all extraction tools without external files.</step>
    </verify>
    <done>
      The team has stable demo inputs for the first two architecture blocks.
    </done>
    <commit>test: add recon input fixtures</commit>
  </task>

  <task id="05">
    <name>Implement expected payment and bank statement parsers</name>
    <files>
      <file>src/lib/recon/parsers/expected-payments.ts</file>
      <file>src/lib/recon/parsers/bank-statements.ts</file>
      <file>src/lib/recon/parsers/expected-payments.test.ts</file>
      <file>src/lib/recon/parsers/bank-statements.test.ts</file>
    </files>
    <read_first>
      <file>src/lib/recon/schemas.ts</file>
      <file>src/lib/recon/normalizers.ts</file>
      <file>src/lib/recon/fixtures/expected-payment-rows.ts</file>
      <file>src/lib/recon/fixtures/bank-statement-rows.ts</file>
    </read_first>
    <action><![CDATA[
Implement parser functions that accept already-loaded CSV/XLSX-like rows as objects.

parseExpectedPaymentRows(rows, sourceFileId):
- Map common column names:
  - invoice_number, invoice, invoiceNo -> invoiceNumber
  - issue_date -> issueDate
  - due_date -> dueDate
  - seller_name -> seller.name
  - buyer_name, customer_name -> buyer.name
  - currency, invoice_currency -> invoiceCurrency
  - amount_due, payable_amount, outstanding_amount -> amountDue.value
  - settlement_currency, expected_settlement_currency -> expectedSettlementCurrency
  - payment_reference, reference, buyer_reference -> paymentReference.raw
- Normalize date, currency, amount, reference, and names.
- Add field confidence `1` for deterministic CSV/XLSX fields.
- Add evidence spans with source `csv` or `xlsx`.
- Validate through `expectedPaymentRecordSchema`.

parseBankStatementRows(rows, sourceFileId):
- Map common columns:
  - transaction_id, bank_transaction_id -> transactionId
  - account_id -> accountId
  - booking_date, date, posted_date -> bookingDate
  - value_date -> valueDate
  - credit_debit, direction, type -> creditDebitIndicator
  - amount -> amount.value
  - currency -> amount.currency
  - counterparty_name, sender, payer -> counterpartyName
  - remittance_info, remittance_information, memo -> remittanceInfo
  - bank_reference, reference -> bankReference
  - description, narrative -> description
- Normalize direction to `CRDT` or `DBIT`.
- Store all amounts positive.
- Generate deterministic transaction IDs when absent.
- Preserve `rawDescription`.
- Validate through `bankStatementTransactionSchema`.

Do not parse binary XLSX yet. For hackathon speed, use CSV-like object rows in this phase and wire real upload parsing later.
    ]]></action>
    <test_code><![CDATA[
import { describe, expect, it } from "vitest";
import { bankStatementRows, expectedPaymentRows } from "../fixtures";
import { parseBankStatementRows } from "./bank-statements";
import { parseExpectedPaymentRows } from "./expected-payments";

describe("input parsers", () => {
  it("parses expected payments into standard records", () => {
    const records = parseExpectedPaymentRows(expectedPaymentRows, "expected.csv");

    expect(records[0]).toMatchObject({
      invoiceNumber: "INV-1001",
      invoiceCurrency: "USD",
      amountDue: { value: "10.00", currency: "USD" },
      expectedSettlementCurrency: "MYR",
    });
    expect(records[0].paymentReference.normalized).toBe("INV1001");
  });

  it("parses bank rows with positive amount and CRDT/DBIT direction", () => {
    const records = parseBankStatementRows(bankStatementRows, "bank.csv");
    const credit = records.find((record) => record.creditDebitIndicator === "CRDT");
    const debit = records.find((record) => record.creditDebitIndicator === "DBIT");

    expect(credit?.amount.value).toBe("42.50");
    expect(credit?.amount.currency).toBe("MYR");
    expect(debit?.amount.value.startsWith("-")).toBe(false);
  });

  it("generates a deterministic transaction id when missing", () => {
    const records = parseBankStatementRows(
      [{ ...bankStatementRows[0], transaction_id: "" }],
      "bank.csv",
    );

    expect(records[0].transactionId).toMatch(/^bank_/);
  });
});
    ]]></test_code>
    <verify>
      <step>`npm test -- parsers` passes.</step>
      <step>Parsed records validate through Zod schemas.</step>
      <step>Debit rows remain represented as `DBIT` and positive amount.</step>
    </verify>
    <done>
      Component 1 can normalize expected payment records and local bank statements into standard internal records.
    </done>
    <commit>feat: parse recon input rows</commit>
  </task>

  <task id="06">
    <name>Build extraction tool interfaces and deterministic mock tools</name>
    <files>
      <file>src/lib/recon/extraction/tools.ts</file>
      <file>src/lib/recon/extraction/ocr-image.ts</file>
      <file>src/lib/recon/extraction/parse-pdf-text.ts</file>
      <file>src/lib/recon/extraction/parse-pdf-tables.ts</file>
      <file>src/lib/recon/extraction/request-manual-correction.ts</file>
      <file>src/lib/recon/extraction/tools.test.ts</file>
    </files>
    <read_first>
      <file>src/lib/recon/schemas.ts</file>
      <file>src/lib/recon/input-descriptors.ts</file>
      <file>src/lib/recon/fixtures/payment-proof-descriptors.ts</file>
    </read_first>
    <action><![CDATA[
Create a shared tool result contract:

ExtractionToolName:
- "ocr_image"
- "parse_pdf_text"
- "parse_pdf_tables"
- "manual_correction"

ExtractionToolResult:
- route: ExtractionToolName
- rawText: string
- candidateFields: Partial payment proof fields before schema validation
- fieldEvidence: FieldEvidence[]
- confidenceByField: Record<string, number>
- warnings: string[]

Implement deterministic mock versions:

ocrImage(descriptor):
- Use descriptor.rawOcrFixture.
- Return lower confidence if imageQuality is medium or low.
- Extract obvious fields from fixture text with simple regexes.

parsePdfText(descriptor):
- Use descriptor.rawTextFixture.
- Higher confidence for text-layer PDFs.
- Extract amount/currency/date/reference/provider from text.

parsePdfTables(descriptor):
- Use descriptor.rawTableFixture.
- Extract row/column labels such as Amount, Currency, Reference, Date, Payer, Beneficiary.

requestManualCorrection(descriptor, missingFields):
- Return route `manual_correction`.
- Do not invent missing values.
- Return requires-review warnings and evidence source `manual`.

These mock tools are allowed for the hackathon. Real OCR/PDF integrations can replace the same interfaces later.
    ]]></action>
    <test_code><![CDATA[
import { describe, expect, it } from "vitest";
import { paymentProofDescriptors } from "../fixtures";
import { ocrImage } from "./ocr-image";
import { parsePdfTables } from "./parse-pdf-tables";
import { parsePdfText } from "./parse-pdf-text";
import { requestManualCorrection } from "./request-manual-correction";

describe("extraction tools", () => {
  it("extracts image proof fixture via OCR mock", () => {
    const descriptor = paymentProofDescriptors.find((proof) => proof.mimeType.startsWith("image/"))!;
    const result = ocrImage(descriptor);

    expect(result.route).toBe("ocr_image");
    expect(result.rawText.length).toBeGreaterThan(0);
    expect(result.fieldEvidence.length).toBeGreaterThan(0);
  });

  it("extracts text-layer PDF proof", () => {
    const descriptor = paymentProofDescriptors.find((proof) => proof.textLayer)!;
    const result = parsePdfText(descriptor);

    expect(result.route).toBe("parse_pdf_text");
    expect(result.confidenceByField["paidAmount"]).toBeGreaterThan(0.8);
  });

  it("extracts table PDF proof", () => {
    const descriptor = paymentProofDescriptors.find((proof) => proof.tableLikely)!;
    const result = parsePdfTables(descriptor);

    expect(result.route).toBe("parse_pdf_tables");
    expect(result.fieldEvidence.some((evidence) => evidence.source === "pdf_table")).toBe(true);
  });

  it("manual correction tool does not invent missing values", () => {
    const descriptor = paymentProofDescriptors.find((proof) => proof.imageQuality === "low")!;
    const result = requestManualCorrection(descriptor, ["paidAmount", "paymentDate"]);

    expect(result.route).toBe("manual_correction");
    expect(result.candidateFields).not.toHaveProperty("paidAmount");
    expect(result.warnings.join(" ")).toContain("paidAmount");
  });
});
    ]]></test_code>
    <verify>
      <step>`npm test -- extraction` passes.</step>
      <step>Each extraction tool returns evidence and confidence.</step>
      <step>Manual correction never fabricates financial values.</step>
    </verify>
    <done>
      The extraction agent has real callable tools, even if the first implementation is fixture-backed.
    </done>
    <commit>feat: add extraction tool interfaces</commit>
  </task>

  <task id="07">
    <name>Implement Agent 1 routing and structured proof JSON assembly</name>
    <files>
      <file>src/lib/recon/extraction/extraction-agent.ts</file>
      <file>src/lib/recon/extraction/extraction-agent.test.ts</file>
    </files>
    <read_first>
      <file>FINAL_RECONPILOT_BLUEPRINT.md</file>
      <file>src/lib/recon/extraction/tools.ts</file>
      <file>src/lib/recon/extraction/ocr-image.ts</file>
      <file>src/lib/recon/extraction/parse-pdf-text.ts</file>
      <file>src/lib/recon/extraction/parse-pdf-tables.ts</file>
      <file>src/lib/recon/extraction/request-manual-correction.ts</file>
      <file>src/lib/recon/schemas.ts</file>
    </read_first>
    <action><![CDATA[
Implement `runExtractionAgent(descriptor, options?)`.

Agent loop:

1. Observe descriptor:
   - mimeType
   - textLayer
   - tableLikely
   - imageQuality
   - warnings
2. Decide tool:
   - if image and quality is not low -> `ocrImage`
   - if PDF and tableLikely -> `parsePdfTables`
   - if PDF and textLayer -> `parsePdfText`
   - if low quality, unknown file, or missing critical fixture content -> `requestManualCorrection`
3. Observe tool result.
4. Assemble `PaymentProofExtraction`.
5. Validate with `paymentProofExtractionSchema`.
6. Mark `requiresManualReview` true when:
   - overall confidence < 0.85
   - any critical field is missing: paidAmount, paidAmount.currency, paymentDate, payer.name or reference.raw
   - manual correction route used
   - paymentStatus is not `paid`
7. Return extraction JSON plus decision metadata.

Critical boundary:

- The agent may decide extraction path.
- The agent may flag ambiguity.
- The agent may not match against expected payments or bank transactions.
- The agent may not calculate FX conclusions.
    ]]></action>
    <test_code><![CDATA[
import { describe, expect, it } from "vitest";
import { paymentProofDescriptors } from "../fixtures";
import { runExtractionAgent } from "./extraction-agent";

describe("Extraction Agent", () => {
  it("routes scanned images to OCR", () => {
    const descriptor = paymentProofDescriptors.find((proof) => proof.mimeType.startsWith("image/") && proof.imageQuality !== "low")!;
    const result = runExtractionAgent(descriptor);

    expect(result.extraction.extractionRoute).toBe("ocr_image");
    expect(result.extraction.evidenceSpans.length).toBeGreaterThan(0);
  });

  it("routes table-like PDFs to table parsing before text parsing", () => {
    const descriptor = paymentProofDescriptors.find((proof) => proof.tableLikely)!;
    const result = runExtractionAgent(descriptor);

    expect(result.extraction.extractionRoute).toBe("parse_pdf_tables");
  });

  it("routes text-layer PDFs to text parsing", () => {
    const descriptor = paymentProofDescriptors.find((proof) => proof.textLayer && !proof.tableLikely)!;
    const result = runExtractionAgent(descriptor);

    expect(result.extraction.extractionRoute).toBe("parse_pdf_text");
  });

  it("requests manual correction for low-quality ambiguous proof", () => {
    const descriptor = paymentProofDescriptors.find((proof) => proof.imageQuality === "low")!;
    const result = runExtractionAgent(descriptor);

    expect(result.extraction.extractionRoute).toBe("manual_correction");
    expect(result.extraction.requiresManualReview).toBe(true);
    expect(result.extraction.warnings.length).toBeGreaterThan(0);
  });

  it("does not include matching or reconciliation fields", () => {
    const descriptor = paymentProofDescriptors[0];
    const result = runExtractionAgent(descriptor);

    expect(result.extraction).not.toHaveProperty("matchScore");
    expect(result.extraction).not.toHaveProperty("matchStatus");
    expect(result.extraction).not.toHaveProperty("bankTransactionId");
  });
});
    ]]></test_code>
    <verify>
      <step>`npm test -- extraction-agent` passes.</step>
      <step>At least three different routes are exercised by fixtures.</step>
      <step>Low-quality/ambiguous proof requires manual review.</step>
    </verify>
    <done>
      Agent 1 behaves visibly as an agent: observe, choose tool, observe result, output structured JSON.
    </done>
    <commit>feat: implement extraction agent routing</commit>
  </task>

  <task id="08">
    <name>Add agent activity timeline events for every extraction decision and tool call</name>
    <files>
      <file>src/lib/recon/timeline.ts</file>
      <file>src/lib/recon/timeline.test.ts</file>
      <file>src/lib/recon/extraction/extraction-agent.ts</file>
      <file>src/lib/recon/extraction/extraction-agent.test.ts</file>
    </files>
    <read_first>
      <file>FINAL_RECONPILOT_BLUEPRINT.md</file>
      <file>src/lib/recon/extraction/extraction-agent.ts</file>
    </read_first>
    <action><![CDATA[
Create timeline event support for the visible demo.

TimelineEvent:

- id
- timestamp
- agent: "Extraction Agent" | "Code Tools"
- action
- toolName?
- inputSummary
- resultSummary
- reasoning
- observedConfidence?
- warnings

Add a `createTimeline()` helper with:

- addEvent(eventWithoutIdAndTimestamp)
- list()

Update `runExtractionAgent` to accept optional timeline and write events:

1. Extraction Agent observed file descriptor.
2. Extraction Agent selected route with reasoning.
3. Code Tools called the selected extraction function.
4. Extraction Agent assembled structured JSON and confidence.
5. Extraction Agent flagged manual review when needed.

Do not write files to disk yet. Keep timeline in memory for the app/API and terminal demo.
    ]]></action>
    <test_code><![CDATA[
import { describe, expect, it } from "vitest";
import { paymentProofDescriptors } from "./fixtures";
import { createTimeline } from "./timeline";
import { runExtractionAgent } from "./extraction/extraction-agent";

describe("agent timeline", () => {
  it("records extraction observations, tool calls, and output assembly", () => {
    const timeline = createTimeline();
    const result = runExtractionAgent(paymentProofDescriptors[0], { timeline });
    const events = timeline.list();

    expect(result.extraction.proofId).toBeTruthy();
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events.some((event) => event.agent === "Extraction Agent")).toBe(true);
    expect(events.some((event) => event.agent === "Code Tools")).toBe(true);
    expect(events.some((event) => event.toolName === result.extraction.extractionRoute)).toBe(true);
  });
});
    ]]></test_code>
    <verify>
      <step>`npm test -- timeline` passes.</step>
      <step>Every extraction run creates a user-visible activity trail.</step>
    </verify>
    <done>
      The demo can show why Agent 1 is agentic instead of a hidden OCR function.
    </done>
    <commit>feat: add extraction agent timeline</commit>
  </task>

  <task id="09">
    <name>Expose input parsing and extraction through minimal Next.js API routes</name>
    <files>
      <file>src/app/api/recon/inputs/route.ts</file>
      <file>src/app/api/recon/extract/route.ts</file>
      <file>src/app/api/recon/demo/route.ts</file>
      <file>src/lib/recon/api-contracts.ts</file>
      <file>src/lib/recon/api-contracts.test.ts</file>
    </files>
    <read_first>
      <file>src/lib/recon/parsers/expected-payments.ts</file>
      <file>src/lib/recon/parsers/bank-statements.ts</file>
      <file>src/lib/recon/extraction/extraction-agent.ts</file>
      <file>src/lib/recon/fixtures/index.ts</file>
    </read_first>
    <action><![CDATA[
Create API contracts and routes for the first two architecture blocks.

POST /api/recon/inputs:
- Accept JSON body:
  - expectedPaymentRows
  - bankStatementRows
  - sourceFileIds
- Return:
  - expectedPayments
  - bankTransactions
  - warnings
- This endpoint does not process payment proofs.

POST /api/recon/extract:
- Accept JSON body:
  - paymentProofDescriptor
- Return:
  - extraction
  - timeline
- This endpoint does not match anything.

GET /api/recon/demo:
- Return parsed fixture inputs, extracted proof fixtures, and timeline for each proof.
- Useful for frontend/demo integration without uploads.

Use Zod request/response schemas in `api-contracts.ts`.
    ]]></action>
    <test_code><![CDATA[
import { describe, expect, it } from "vitest";
import {
  demoResponseSchema,
  extractRequestSchema,
  inputsRequestSchema,
} from "./api-contracts";
import {
  bankStatementRows,
  expectedPaymentRows,
  paymentProofDescriptors,
} from "./fixtures";

describe("API contracts", () => {
  it("accepts input parsing request shape", () => {
    expect(() =>
      inputsRequestSchema.parse({
        expectedPaymentRows,
        bankStatementRows,
        sourceFileIds: {
          expectedPayments: "expected.csv",
          bankStatement: "bank.csv",
        },
      }),
    ).not.toThrow();
  });

  it("accepts extraction request shape", () => {
    expect(() =>
      extractRequestSchema.parse({
        paymentProofDescriptor: paymentProofDescriptors[0],
      }),
    ).not.toThrow();
  });

  it("defines demo response fields", () => {
    expect(demoResponseSchema.shape).toHaveProperty("expectedPayments");
    expect(demoResponseSchema.shape).toHaveProperty("bankTransactions");
    expect(demoResponseSchema.shape).toHaveProperty("proofExtractions");
  });
});
    ]]></test_code>
    <verify>
      <step>`npm test -- api-contracts` passes.</step>
      <step>`npm run typecheck` passes with Next route handlers.</step>
      <step>`GET /api/recon/demo` returns JSON when the dev server is running.</step>
    </verify>
    <done>
      The Next.js app has usable backend entry points for the input layer and Extraction Agent.
    </done>
    <commit>feat: expose recon input extraction APIs</commit>
  </task>

  <task id="10">
    <name>Create a terminal extraction demo and a simple first-screen proof of components 1 and 2</name>
    <files>
      <file>src/scripts/run-extraction-demo.ts</file>
      <file>src/app/page.tsx</file>
      <file>src/app/globals.css</file>
      <file>src/scripts/run-extraction-demo.test.ts</file>
    </files>
    <read_first>
      <file>src/app/api/recon/demo/route.ts</file>
      <file>src/lib/recon/fixtures/index.ts</file>
      <file>src/lib/recon/extraction/extraction-agent.ts</file>
      <file>src/lib/recon/timeline.ts</file>
    </read_first>
    <action><![CDATA[
Create `npm run demo:extract`.

The script should print:

- Expected payment records parsed count.
- Bank statement transactions parsed count.
- For each proof:
  - file name
  - observed type
  - chosen route
  - overall confidence
  - requires manual review
  - critical extracted fields
  - timeline rows

Update the first screen to show:

- Three input cards:
  - Expected Payment Records
  - Payment Proofs
  - Local Bank Statement
- Extraction Agent panel:
  - route selected per proof
  - confidence
  - manual review flag
- Agent Activity Timeline table:
  - agent
  - action
  - tool
  - result
  - reasoning

Keep UI restrained and useful. This is an operational finance tool, so favor compact tables and high contrast status chips. No decorative landing page.
    ]]></action>
    <test_code><![CDATA[
import { describe, expect, it } from "vitest";
import { buildExtractionDemoModel } from "./run-extraction-demo";

describe("extraction demo model", () => {
  it("includes parsed inputs and all extraction routes needed for demo", () => {
    const demo = buildExtractionDemoModel();
    const routes = demo.proofExtractions.map((proof) => proof.extraction.extractionRoute);

    expect(demo.expectedPayments.length).toBeGreaterThanOrEqual(3);
    expect(demo.bankTransactions.length).toBeGreaterThanOrEqual(3);
    expect(routes).toContain("ocr_image");
    expect(routes).toContain("parse_pdf_text");
    expect(routes).toContain("parse_pdf_tables");
    expect(routes).toContain("manual_correction");
  });
});
    ]]></test_code>
    <verify>
      <step>`npm run demo:extract` prints the complete component 1 and 2 flow.</step>
      <step>`npm test -- run-extraction-demo` passes.</step>
      <step>`npm run typecheck` passes.</step>
      <step>`npm run build` passes.</step>
    </verify>
    <done>
      A teammate can run one command and see the input layer plus agentic extraction behavior end to end.
    </done>
    <commit>feat: add extraction demo experience</commit>
  </task>
</implementation_plan>
```

## Suggested Team Split For This Plan

- Member 1: tasks 01, 02, 03. Own project foundation, schemas, and normalizers.
- Member 2: tasks 04, 05. Own fixtures and parsers for expected payments and bank statements.
- Member 3: tasks 06, 07, 08. Own extraction tools, agent loop, and timeline.
- Member 4: tasks 09, 10. Own API routes, first-screen UI, and terminal demo.

## Phase Exit Criteria

This phase is complete when:

- `npm run typecheck`, `npm test`, and `npm run build` pass.
- `npm run demo:extract` shows at least four payment proofs using different extraction paths.
- Every proof extraction output validates through `paymentProofExtractionSchema`.
- Every critical extracted field has confidence and evidence.
- The visible timeline proves the loop: observe file, choose tool, call tool, assemble JSON, flag review if needed.
- No code in this phase performs matching, FX reasoning, accounting postings, or reconciliation classification.
