# ReconPilot Solo Build Plan: Inputs + Extraction Agent

Status: ready for implementation  
Owner: solo developer  
Stack: Next.js App Router, TypeScript, Zod, Vitest  
Scope: only architecture blocks 1 and 2 from the ReconPilot diagram  
Date: 2026-05-23

## What This Plan Covers

This plan only covers:

1. **Inputs**
   - Expected payment records: CSV/XLSX-style invoice or receivables rows.
   - Payment proofs: image, PDF, text, or table-like proof descriptors.
   - Local bank statement: CSV/XLSX-style booked bank transaction rows.

2. **Agent 1: Extraction Agent**
   - Inspects each payment proof.
   - Chooses the best extraction route.
   - Calls one extraction tool.
   - Produces structured proof JSON with confidence and evidence.
   - Flags low-confidence or ambiguous fields for manual correction.
   - Writes timeline events so the demo visibly shows agentic behavior.

This plan does **not** cover:

- FX rate lookup.
- Candidate matching.
- Reconciliation scoring.
- Auto-match / likely-match / unmatched classification.
- Accounting journal entries.
- Report generation.
- Email generation.
- Full dashboard polish.

The only goal is to make ReconPilot able to say:

> "Here are the expected payment records, here are the bank rows, and here is a finance-grade structured extraction from messy payment proofs."

## Why The Data Schema Matters Most

The schema is the foundation of the project. If the schema is weak, the rest of ReconPilot becomes a nice-looking demo with unreliable data.

For this build, the extracted data must look like real payment and reconciliation data, not generic OCR output. Use:

- UBL / Peppol / EN16931-inspired fields for expected payments.
- ISO 20022 camt.053-inspired fields for bank statement transactions.
- ISO 20022 and payment-provider-inspired fields for payment proof evidence.
- ISO 4217 currency codes.
- ISO 8601 dates.
- Field-level confidence and source evidence for every important extracted value.

## Standards To Follow

- Expected payments: Peppol/UBL-style invoice and receivable fields.
- Bank statement rows: ISO 20022 camt.053-style booked account entries.
- Payment proofs: ISO 20022/provider receipt-style payment evidence.
- Currency: ISO 4217 uppercase alpha codes such as `USD`, `MYR`, `SGD`.
- Date: ISO 8601 calendar date format, `YYYY-MM-DD`.
- Amounts: decimal strings in schemas, not floating-point numbers for money logic.
- References: preserve raw references and also store normalized references.
- Parties: preserve raw names and also store normalized names for later matching.

Reference sources:

- Peppol BIS Billing 3.0: https://docs.peppol.eu/poacc/billing/3.0/bis/
- OASIS UBL 2.1: https://docs.oasis-open.org/ubl/UBL-2.1.html
- ISO 4217: https://www.iso.org/iso-4217-currency-codes.html
- ISO 8601: https://www.iso.org/iso-8601-date-and-time-format.html
- ISO 20022 camt.053: https://www.iso20022.org/iso-20022-message-definitions?search=camt.053
- Swift ISO 20022: https://www.swift.com/standards/iso-20022
- Wise transfer fields: https://docs.wise.com/api-reference/transfer
- PayPal transaction fields: https://developer.paypal.com/docs/api/transaction-search/v1/
- Stripe balance transaction fields: https://docs.stripe.com/api/balance_transactions/object

## Proposed File Structure

```text
package.json
tsconfig.json
next.config.ts
vitest.config.ts

src/app/page.tsx
src/app/api/recon/demo/route.ts
src/app/api/recon/extract/route.ts

src/lib/recon/schemas.ts
src/lib/recon/types.ts
src/lib/recon/normalizers.ts
src/lib/recon/input-descriptors.ts
src/lib/recon/timeline.ts

src/lib/recon/fixtures/expected-payment-rows.ts
src/lib/recon/fixtures/bank-statement-rows.ts
src/lib/recon/fixtures/payment-proof-descriptors.ts
src/lib/recon/fixtures/index.ts

src/lib/recon/parsers/expected-payments.ts
src/lib/recon/parsers/bank-statements.ts

src/lib/recon/extraction/tools.ts
src/lib/recon/extraction/ocr-image.ts
src/lib/recon/extraction/parse-pdf-text.ts
src/lib/recon/extraction/parse-pdf-tables.ts
src/lib/recon/extraction/request-manual-correction.ts
src/lib/recon/extraction/extraction-agent.ts

src/scripts/run-extraction-demo.ts
```

## Core Schema Contract

Implement schemas in `src/lib/recon/schemas.ts` using Zod, and export inferred TypeScript types from `src/lib/recon/types.ts`.

### Shared Types

```ts
type CurrencyCode = string; // ISO 4217 uppercase, validated by Zod allowlist
type IsoDate = string; // YYYY-MM-DD

type MoneyAmount = {
  value: string; // decimal string, e.g. "42.50"
  currency: CurrencyCode;
};

type Party = {
  name: string | null;
  normalizedName?: string | null;
};

type ReferenceValue = {
  raw: string | null;
  normalized?: string | null;
};

type FieldEvidence = {
  field: string;
  value: unknown;
  confidence: number; // 0 to 1
  source: "ocr" | "pdf_text" | "pdf_table" | "manual" | "csv" | "xlsx" | "fixture";
  evidenceText: string | null;
  page?: number | null;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  warnings: string[];
};
```

### Expected Payment Record

Use this for invoice CSV/XLSX, receivables export, or payment schedule rows.

Required fields:

| Field | Type | Why it matters |
| --- | --- | --- |
| `expectedPaymentId` | string | Stable internal ID |
| `invoiceNumber` | string | Main expected-payment reference |
| `issueDate` | ISO date | Invoice date |
| `dueDate` | ISO date or null | Useful later for date proximity |
| `seller` | Party | Our SME / payee |
| `buyer` | Party | Customer / payer |
| `invoiceCurrency` | ISO 4217 | Currency owed, e.g. `USD` |
| `amountDue` | MoneyAmount | Amount owed |
| `expectedSettlementCurrency` | ISO 4217 | Local receipt currency, e.g. `MYR` |
| `paymentReference` | ReferenceValue | Reference expected on proof/bank row |
| `sourceFileId` | string | Input file provenance |
| `fieldConfidence` | record | Deterministic rows can be `1` |
| `evidenceSpans` | FieldEvidence[] | Source evidence |
| `warnings` | string[] | Missing/uncertain field notes |

Optional useful fields:

| Field | Type |
| --- | --- |
| `buyerReference` | ReferenceValue |
| `purchaseOrderReference` | ReferenceValue |
| `paymentTerms` | string |
| `outstandingAmount` | MoneyAmount |
| `sourceRowNumber` | number |

Type target:

```ts
type ExpectedPaymentRecord = {
  expectedPaymentId: string;
  invoiceNumber: string;
  issueDate: IsoDate;
  dueDate?: IsoDate | null;
  seller: Party;
  buyer: Party;
  invoiceCurrency: CurrencyCode;
  amountDue: MoneyAmount;
  expectedSettlementCurrency: CurrencyCode;
  paymentReference: ReferenceValue;
  buyerReference?: ReferenceValue | null;
  purchaseOrderReference?: ReferenceValue | null;
  paymentTerms?: string | null;
  outstandingAmount?: MoneyAmount | null;
  sourceFileId: string;
  sourceRowNumber?: number;
  fieldConfidence: Record<string, number>;
  evidenceSpans: FieldEvidence[];
  warnings: string[];
};
```

### Bank Statement Transaction

Use this for local bank statement rows. It should be inspired by ISO 20022 camt.053, but simplified for the MVP.

Required fields:

| Field | Type | Why it matters |
| --- | --- | --- |
| `transactionId` | string | Bank ID or generated deterministic ID |
| `accountId` | string | Account receiving funds |
| `bookingDate` | ISO date | Date bank posted transaction |
| `creditDebitIndicator` | `CRDT` or `DBIT` | Direction without signed amounts |
| `amount` | MoneyAmount | Local received or paid amount |
| `description` | string | Raw bank narrative |
| `sourceFileId` | string | Input file provenance |
| `warnings` | string[] | Missing/uncertain field notes |

Optional useful fields:

| Field | Type |
| --- | --- |
| `valueDate` | ISO date |
| `counterpartyName` | string |
| `remittanceInfo` | string |
| `bankReference` | string |
| `accountServicerReference` | string |
| `endToEndId` | string |
| `bankTransactionCode` | string |
| `rawDescription` | string |
| `sourceRowNumber` | number |

Type target:

```ts
type BankStatementTransaction = {
  transactionId: string;
  accountId: string;
  bookingDate: IsoDate;
  valueDate?: IsoDate | null;
  creditDebitIndicator: "CRDT" | "DBIT";
  amount: MoneyAmount;
  counterpartyName?: string | null;
  remittanceInfo?: string | null;
  bankReference?: string | null;
  accountServicerReference?: string | null;
  endToEndId?: string | null;
  bankTransactionCode?: string | null;
  description: string;
  rawDescription?: string | null;
  sourceFileId: string;
  sourceRowNumber?: number;
  warnings: string[];
};
```

Rules:

- Store amount as positive.
- Use `creditDebitIndicator` for direction.
- Do not treat debit rows as customer receipts later.
- Generate deterministic transaction ID if the bank file has no ID.

### Payment Proof Extraction

This is the most important schema for block 2. It should look like structured payment/remittance evidence, not OCR text.

Required fields:

| Field | Type | Why it matters |
| --- | --- | --- |
| `proofId` | string | Stable proof ID |
| `sourceFileId` | string | Uploaded file provenance |
| `documentType` | enum | Proof category |
| `paymentStatus` | enum | Paid/pending/failed/reversed/unknown |
| `payer` | Party | Sender/customer/debtor |
| `beneficiary` | Party | Receiver/company/creditor |
| `paidAmount` | MoneyAmount or null | Paid source amount |
| `paymentDate` | ISO date or null | Payment initiation/confirmation date |
| `reference` | ReferenceValue | Invoice/payment/remittance reference |
| `invoiceIds` | string[] | Invoice IDs found in proof |
| `rawText` | string | Extracted text used by agent |
| `fieldConfidence` | record | Per-field confidence |
| `evidenceSpans` | FieldEvidence[] | Field-level source evidence |
| `overallConfidence` | number | 0 to 1 |
| `extractionRoute` | enum | Tool chosen by agent |
| `requiresManualReview` | boolean | Whether extraction is unsafe |
| `warnings` | string[] | Missing/uncertain field notes |

Optional useful fields:

| Field | Type |
| --- | --- |
| `valueDate` | ISO date |
| `bookingDate` | ISO date |
| `transactionId` | string |
| `providerOrBankName` | string |
| `endToEndId` | string |
| `uetr` | string |
| `feeAmount` | MoneyAmount |
| `netAmount` | MoneyAmount |
| `sourceAmount` | MoneyAmount |
| `targetAmount` | MoneyAmount |
| `fxRate` | decimal string |
| `fxRateType` | `fixed`, `floating`, `implied`, or `unknown` |
| `remittanceInformation.raw` | string |
| `remittanceInformation.structured` | record |

Type target:

```ts
type PaymentProofExtraction = {
  proofId: string;
  sourceFileId: string;
  documentType:
    | "payment_proof"
    | "remittance_advice"
    | "bank_receipt"
    | "provider_receipt"
    | "unknown";
  paymentStatus: "paid" | "pending" | "failed" | "reversed" | "unknown";
  payer: Party;
  beneficiary: Party;
  paidAmount: MoneyAmount | null;
  paymentDate: IsoDate | null;
  valueDate?: IsoDate | null;
  bookingDate?: IsoDate | null;
  reference: ReferenceValue;
  transactionId?: string | null;
  providerOrBankName?: string | null;
  invoiceIds: string[];
  endToEndId?: string | null;
  uetr?: string | null;
  feeAmount?: MoneyAmount | null;
  netAmount?: MoneyAmount | null;
  sourceAmount?: MoneyAmount | null;
  targetAmount?: MoneyAmount | null;
  fxRate?: string | null;
  fxRateType?: "fixed" | "floating" | "implied" | "unknown";
  remittanceInformation?: {
    raw: string | null;
    structured: Record<string, string>;
  };
  rawText: string;
  fieldConfidence: Record<string, number>;
  evidenceSpans: FieldEvidence[];
  overallConfidence: number;
  extractionRoute: "ocr_image" | "parse_pdf_text" | "parse_pdf_tables" | "manual_correction";
  requiresManualReview: boolean;
  warnings: string[];
};
```

Manual review is required when:

- `overallConfidence < 0.85`.
- `paidAmount` is missing.
- `paymentDate` is missing.
- Both `reference.raw` and `invoiceIds` are missing.
- Payer or beneficiary is missing.
- The proof route is `manual_correction`.
- `paymentStatus` is not `paid`.

### Input File Descriptor

Use this instead of real upload handling first. It lets the hackathon demo work with fixtures before file upload is built.

```ts
type InputFileDescriptor = {
  fileId: string;
  fileName: string;
  mimeType: string;
  inputKind: "expected_payments" | "payment_proof" | "bank_statement";
  sizeBytes?: number;
  textLayer?: boolean;
  tableLikely?: boolean;
  imageQuality?: "high" | "medium" | "low";
  rawTextFixture?: string;
  rawTableFixture?: string[][];
  rawOcrFixture?: string;
  warnings: string[];
};
```

### Timeline Event

The timeline is how the demo proves the extraction is agentic.

```ts
type TimelineEvent = {
  id: string;
  timestamp: string;
  agent: "Extraction Agent" | "Code Tools";
  action: string;
  toolName?: "ocr_image" | "parse_pdf_text" | "parse_pdf_tables" | "manual_correction";
  inputSummary: string;
  resultSummary: string;
  reasoning: string;
  observedConfidence?: number;
  warnings: string[];
};
```

## Example JSON Formats

These are the concrete JSON shapes to use for fixtures, API responses, and demo output. The TypeScript/Zod schemas above are the source of truth; these examples show what valid data should look like.

### 1. Expected Payment Record JSON

This represents what the SME expects to receive, usually from invoice records, accounts receivable exports, or a payment schedule.

```json
{
  "expectedPaymentId": "exp_001",
  "invoiceNumber": "INV-1001",
  "issueDate": "2026-05-19",
  "dueDate": "2026-06-18",
  "seller": {
    "name": "ReconPilot Sdn Bhd",
    "normalizedName": "RECONPILOT"
  },
  "buyer": {
    "name": "Acme Pte Ltd",
    "normalizedName": "ACME"
  },
  "invoiceCurrency": "USD",
  "amountDue": {
    "value": "10.00",
    "currency": "USD"
  },
  "expectedSettlementCurrency": "MYR",
  "paymentReference": {
    "raw": "INV-1001",
    "normalized": "INV1001"
  },
  "buyerReference": null,
  "purchaseOrderReference": null,
  "paymentTerms": "Due within 30 days",
  "outstandingAmount": {
    "value": "10.00",
    "currency": "USD"
  },
  "sourceFileId": "expected-payments.csv",
  "sourceRowNumber": 2,
  "fieldConfidence": {
    "invoiceNumber": 1,
    "amountDue.value": 1,
    "amountDue.currency": 1,
    "buyer.name": 1
  },
  "evidenceSpans": [
    {
      "field": "invoiceNumber",
      "value": "INV-1001",
      "confidence": 1,
      "source": "csv",
      "evidenceText": "invoice_number=INV-1001",
      "page": null,
      "bbox": null,
      "warnings": []
    }
  ],
  "warnings": []
}
```

### 2. Bank Statement Transaction JSON

This represents the actual booked transaction in the local bank account. For incoming customer receipts, the important direction is `CRDT`.

```json
{
  "transactionId": "txn_001",
  "accountId": "MYR_MAIN_ACCOUNT",
  "bookingDate": "2026-05-20",
  "valueDate": "2026-05-20",
  "creditDebitIndicator": "CRDT",
  "amount": {
    "value": "42.50",
    "currency": "MYR"
  },
  "counterpartyName": "ACME PTE LTD",
  "remittanceInfo": "Payment for INV-1001",
  "bankReference": "BNK-9001",
  "accountServicerReference": "ASR-20260520-001",
  "endToEndId": null,
  "bankTransactionCode": "NTRF",
  "description": "Foreign inward remittance INV-1001 ACME",
  "rawDescription": "Foreign inward remittance INV-1001 ACME",
  "sourceFileId": "maybank-statement.csv",
  "sourceRowNumber": 4,
  "warnings": []
}
```

### 3. Payment Proof Input Descriptor JSON

This is the pre-extraction file descriptor. It lets the MVP simulate upload handling and extraction routing before real OCR/PDF integrations are added.

```json
{
  "fileId": "proof_file_001",
  "fileName": "wise-transfer-inv-1001.pdf",
  "mimeType": "application/pdf",
  "inputKind": "payment_proof",
  "sizeBytes": 248910,
  "textLayer": true,
  "tableLikely": false,
  "imageQuality": "high",
  "rawTextFixture": "Wise transfer receipt. Paid USD 10.00 to ReconPilot Sdn Bhd. Reference INV-1001. Date 2026-05-20.",
  "rawTableFixture": null,
  "rawOcrFixture": null,
  "warnings": []
}
```

### 4. Payment Proof Extraction Output JSON

This is the most important Agent 1 output. It should look like payment/remittance evidence, not generic OCR text.

```json
{
  "proofId": "proof_001",
  "sourceFileId": "proof_file_001",
  "documentType": "provider_receipt",
  "paymentStatus": "paid",
  "payer": {
    "name": "Acme Pte Ltd",
    "normalizedName": "ACME"
  },
  "beneficiary": {
    "name": "ReconPilot Sdn Bhd",
    "normalizedName": "RECONPILOT"
  },
  "paidAmount": {
    "value": "10.00",
    "currency": "USD"
  },
  "paymentDate": "2026-05-20",
  "valueDate": null,
  "bookingDate": null,
  "reference": {
    "raw": "INV-1001",
    "normalized": "INV1001"
  },
  "transactionId": "WISE-TRX-88291",
  "providerOrBankName": "Wise",
  "invoiceIds": ["INV-1001"],
  "endToEndId": null,
  "uetr": null,
  "feeAmount": null,
  "netAmount": null,
  "sourceAmount": {
    "value": "10.00",
    "currency": "USD"
  },
  "targetAmount": {
    "value": "42.50",
    "currency": "MYR"
  },
  "fxRate": "4.2500",
  "fxRateType": "fixed",
  "remittanceInformation": {
    "raw": "Payment for INV-1001",
    "structured": {
      "invoiceNumber": "INV-1001"
    }
  },
  "rawText": "Wise transfer receipt. Paid USD 10.00 to ReconPilot Sdn Bhd. Reference INV-1001. Date 2026-05-20.",
  "fieldConfidence": {
    "payer.name": 0.94,
    "beneficiary.name": 0.96,
    "paidAmount.value": 0.99,
    "paidAmount.currency": 0.99,
    "paymentDate": 0.98,
    "reference.raw": 0.97
  },
  "evidenceSpans": [
    {
      "field": "paidAmount.value",
      "value": "10.00",
      "confidence": 0.99,
      "source": "pdf_text",
      "evidenceText": "Paid USD 10.00",
      "page": 1,
      "bbox": null,
      "warnings": []
    },
    {
      "field": "reference.raw",
      "value": "INV-1001",
      "confidence": 0.97,
      "source": "pdf_text",
      "evidenceText": "Reference INV-1001",
      "page": 1,
      "bbox": null,
      "warnings": []
    }
  ],
  "overallConfidence": 0.96,
  "extractionRoute": "parse_pdf_text",
  "requiresManualReview": false,
  "warnings": []
}
```

### 5. Agent Timeline Event JSON

This is what makes the demo show that Agent 1 is choosing tools, not just running hidden OCR.

```json
{
  "id": "timeline_001",
  "timestamp": "2026-05-23T08:30:00.000Z",
  "agent": "Extraction Agent",
  "action": "Selected extraction route",
  "toolName": "parse_pdf_text",
  "inputSummary": "wise-transfer-inv-1001.pdf has a PDF text layer and no table signal",
  "resultSummary": "Using embedded text extraction before OCR",
  "reasoning": "Text-layer PDFs provide cleaner field evidence than OCR for this proof type.",
  "observedConfidence": 0.96,
  "warnings": []
}
```

## Solo Build Order

### Step 1: Project Foundation

Goal: create the minimum Next.js + TypeScript base.

Files:

- `package.json`
- `tsconfig.json`
- `next.config.ts`
- `vitest.config.ts`
- `src/app/page.tsx`

Install:

```bash
npm install next react react-dom zod
npm install -D typescript vitest tsx @types/node @types/react @types/react-dom
```

Scripts:

```json
{
  "dev": "next dev",
  "build": "next build",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "demo:extract": "tsx src/scripts/run-extraction-demo.ts"
}
```

Done when:

- `npm run typecheck` works.
- `npm test` works.
- The app has one simple page saying `ReconPilot Inputs + Extraction Agent`.

### Step 2: Data Schemas

Goal: implement the schema contract before building any parsing logic.

Files:

- `src/lib/recon/schemas.ts`
- `src/lib/recon/types.ts`
- `src/lib/recon/schemas.test.ts`

Implementation:

- Add Zod schemas for shared types.
- Add `expectedPaymentRecordSchema`.
- Add `bankStatementTransactionSchema`.
- Add `paymentProofExtractionSchema`.
- Add `inputFileDescriptorSchema`.
- Add `timelineEventSchema`.
- Export inferred TypeScript types.

Tests:

- Valid expected payment record passes.
- Valid bank transaction passes.
- Valid payment proof extraction passes.
- Bad currency fails.
- Bad date fails.
- Confidence outside `0..1` fails.
- Missing critical proof fields can be represented as `null`, but must create warnings/manual review.

This is the most important step. Do not move on until it is clean.

### Step 3: Normalizers

Goal: make raw input rows consistent before validation.

Files:

- `src/lib/recon/normalizers.ts`
- `src/lib/recon/normalizers.test.ts`

Implement:

- `normalizeCurrency(input)`
- `normalizeIsoDate(input)`
- `normalizeDecimalAmount(input)`
- `normalizeReference(input)`
- `normalizePartyName(input)`
- `normalizeCreditDebitIndicator(input)`
- `makeDeterministicTransactionId(row)`

Rules:

- Reject ambiguous date formats unless a locale is explicitly known.
- Convert currencies to uppercase ISO codes.
- Convert money to decimal strings.
- Preserve raw values somewhere else; normalizers only create comparable versions.

### Step 4: Demo Fixtures

Goal: create stable demo input data for blocks 1 and 2.

Files:

- `src/lib/recon/fixtures/expected-payment-rows.ts`
- `src/lib/recon/fixtures/bank-statement-rows.ts`
- `src/lib/recon/fixtures/payment-proof-descriptors.ts`
- `src/lib/recon/fixtures/index.ts`

Create:

- 3 expected payment rows.
- 3 bank statement rows.
- 4 payment proof descriptors.

Proof descriptors must force different routes:

- One scanned image -> `ocr_image`.
- One digital PDF with text layer -> `parse_pdf_text`.
- One table PDF/remittance advice -> `parse_pdf_tables`.
- One low-quality ambiguous proof -> `manual_correction`.

Done when:

- Fixtures include all three input groups.
- Proof fixtures visibly prove Agent 1 can choose different tools.

### Step 5: Input Parsers

Goal: turn expected payment rows and bank rows into validated internal records.

Files:

- `src/lib/recon/parsers/expected-payments.ts`
- `src/lib/recon/parsers/bank-statements.ts`
- parser tests

Expected payment parser:

- Accept CSV/XLSX-like object rows.
- Map common column names into `ExpectedPaymentRecord`.
- Normalize date, currency, amount, reference, and names.
- Add field confidence and evidence spans.
- Validate through Zod.

Bank statement parser:

- Accept CSV/XLSX-like object rows.
- Map common bank columns into `BankStatementTransaction`.
- Normalize direction to `CRDT` or `DBIT`.
- Store amount as positive decimal string.
- Generate deterministic transaction ID if missing.
- Preserve bank description.
- Validate through Zod.

Do not parse real binary XLSX in this step. Use object rows first.

### Step 6: Extraction Tools

Goal: create deterministic tool functions the agent can call.

Files:

- `src/lib/recon/extraction/tools.ts`
- `src/lib/recon/extraction/ocr-image.ts`
- `src/lib/recon/extraction/parse-pdf-text.ts`
- `src/lib/recon/extraction/parse-pdf-tables.ts`
- `src/lib/recon/extraction/request-manual-correction.ts`

Tool result shape:

```ts
type ExtractionToolResult = {
  route: "ocr_image" | "parse_pdf_text" | "parse_pdf_tables" | "manual_correction";
  rawText: string;
  candidateFields: Partial<PaymentProofExtraction>;
  fieldEvidence: FieldEvidence[];
  confidenceByField: Record<string, number>;
  warnings: string[];
};
```

Implement fixture-backed tools first:

- `ocrImage(descriptor)`
- `parsePdfText(descriptor)`
- `parsePdfTables(descriptor)`
- `requestManualCorrection(descriptor, missingFields)`

Important:

- These tools can use simple regex/table extraction for demo fixtures.
- They must return evidence and confidence.
- They must not do matching.
- They must not do FX math.
- They must not invent missing values.

### Step 7: Extraction Agent

Goal: build the actual Agent 1 loop.

Files:

- `src/lib/recon/extraction/extraction-agent.ts`
- `src/lib/recon/extraction/extraction-agent.test.ts`
- `src/lib/recon/timeline.ts`

Agent loop:

1. Observe file descriptor.
2. Decide route:
   - image and not low quality -> `ocr_image`
   - PDF with table signal -> `parse_pdf_tables`
   - PDF with text layer -> `parse_pdf_text`
   - low quality or unknown -> `manual_correction`
3. Call selected tool.
4. Observe tool result.
5. Assemble `PaymentProofExtraction`.
6. Validate with Zod.
7. Flag manual review if confidence/critical fields are unsafe.
8. Write timeline events.

Timeline events:

- Observed file type and quality.
- Chose route and why.
- Called tool.
- Produced structured JSON.
- Flagged manual review if needed.

Done when:

- The same agent routes different fixtures to different tools.
- Output always matches `PaymentProofExtraction`.
- Timeline proves the agent loop.

### Step 8: Minimal Demo Endpoint And Page

Goal: show blocks 1 and 2 working without building the full product.

Files:

- `src/app/api/recon/demo/route.ts`
- `src/app/api/recon/extract/route.ts`
- `src/app/page.tsx`
- `src/scripts/run-extraction-demo.ts`

Demo should show:

- Expected payment records parsed count.
- Bank statement rows parsed count.
- Each proof file.
- Chosen extraction route.
- Overall confidence.
- Manual review flag.
- Extracted fields.
- Timeline events.

The page can be simple. This is not dashboard work yet.

## Acceptance Tests

Run these before calling blocks 1 and 2 complete:

```bash
npm run typecheck
npm test
npm run demo:extract
npm run build
```

Manual checks:

- Expected payment schemas feel like invoice/receivable records, not generic rows.
- Bank statement schemas feel like booked bank transactions, not random CSV rows.
- Payment proof extraction feels like payment/remittance evidence, not plain OCR.
- Every important extracted field has confidence and evidence.
- Low-confidence proof is routed to manual correction.
- Agent 1 does not perform matching.
- Agent 1 does not perform FX calculations.
- Agent 1 does not create accounting entries.

## What To Build First If Time Is Tight

If there is limited time, prioritize in this order:

1. `schemas.ts` and `types.ts`
2. `normalizers.ts`
3. fixtures
4. expected payment parser
5. bank statement parser
6. extraction tools
7. extraction agent
8. timeline
9. simple demo script
10. simple page/API

The schema is the prize. Once the schema is solid, the rest of the hackathon build has a strong spine.

## Definition Of Done

Blocks 1 and 2 are done when:

- The app can load demo expected payment records.
- The app can load demo bank statement rows.
- The app can process demo payment proofs.
- The Extraction Agent chooses different extraction tools based on proof type.
- The extracted proof JSON follows the industry-standard-inspired schema.
- Every critical extracted field includes confidence and evidence.
- Ambiguous proofs require manual review.
- Timeline events make the agentic behavior visible.
- No reconciliation matching has been implemented yet.
