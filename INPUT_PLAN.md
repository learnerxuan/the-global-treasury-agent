# ReconPilot Input Schema Contract

Status: ready for implementation  
Owner: solo developer  
Stack: Next.js App Router, TypeScript, Zod, JSON Schema  
Scope: architecture block 1, plus the structured data contract consumed by block 2  
Date: 2026-05-23

## Purpose

This file defines the data formats for ReconPilot's first build phase.

The goal is not to implement full ISO 20022 XML messages. The goal is to produce **ISO 20022-aligned JSON** that uses banking-standard concepts while staying practical for a 24-48 hour hackathon.

Use this file as the source of truth for:

- input batches;
- uploaded file descriptors;
- expected payment records;
- bank statement transactions;
- payment proof input descriptors;
- payment proof extraction outputs;
- shared financial primitives.

The Extraction Agent implementation plan has been moved to:

[EXTRACTION_AGENT_PLAN.md](EXTRACTION_AGENT_PLAN.md)

## What This File Covers

This schema contract covers:

1. **Expected Payment Records**
   - Invoice, accounts receivable, or payment schedule rows.
   - Describes what the SME expects to receive.

2. **Bank Statement Transactions**
   - Local booked bank transactions.
   - Describes what actually entered or left the bank account.

3. **Payment Proof Input Descriptors**
   - Uploaded proof metadata before extraction.
   - Helps Agent 1 choose a route.

4. **Payment Proof Extraction Outputs**
   - Structured, evidence-backed payment data extracted from proof files.
   - This is the most important output of Agent 1.

5. **Input Batches**
   - Groups files, parsed records, proof descriptors, and extraction outputs for one upload/reconciliation run.

This file does **not** cover:

- reconciliation matching;
- FX scenario comparison;
- scoring;
- report generation;
- accounting journal entries;
- email generation.

## Standards Positioning

Pitch wording:

> ReconPilot maps messy payment proofs into an ISO 20022-aligned JSON payload with source evidence and confidence metadata.

Avoid overclaiming:

> Do not say "fully ISO 20022-compliant" unless we implement exact ISO 20022 message definitions such as `camt.053`, `pacs.008`, or `pain.001`.

## Standards To Follow

- **ISO 20022-inspired parties**
  - `creditor` = party receiving money.
  - `debtor` = party sending money.

- **ISO 20022-inspired bank direction**
  - `CRDT` = credit to the account.
  - `DBIT` = debit from the account.

- **ISO 20022-inspired remittance**
  - `remittanceInformation.raw` maps to unstructured remittance information.
  - `remittanceInformation.structured` maps to parsed structured remittance details.

- **ISO 4217**
  - Currency codes must be uppercase alpha codes such as `USD`, `MYR`, `SGD`.
  - For the MVP, restrict accepted currencies to `MYR`, `USD`, `SGD`, and `EUR`.

- **ISO 8601**
  - Invoice-style dates may be `YYYY-MM-DD`.
  - Bank/payment events may use `YYYY-MM-DD` for MVP fixtures or full datetime when available.

- **Money**
  - Store money values as decimal strings, not floats.

- **FX**
  - If the input proof contains an exchange rate, extract it.
  - If the proof only contains source and target amounts, an implied rate may be computed later, but must be labelled as `IMPLIED`.
  - If no FX data exists in the input, keep `exchangeRateInformation` as `null`.
  - Never pretend fetched reference FX is the actual bank-applied rate.

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

## Recommended File Structure

```text
src/lib/recon/schemas.ts
src/lib/recon/types.ts
src/lib/recon/normalizers.ts

src/lib/recon/fixtures/expected-payment-rows.ts
src/lib/recon/fixtures/bank-statement-rows.ts
src/lib/recon/fixtures/payment-proof-descriptors.ts
src/lib/recon/fixtures/payment-proof-extractions.ts
src/lib/recon/fixtures/input-batch.ts

src/lib/recon/parsers/expected-payments.ts
src/lib/recon/parsers/bank-statements.ts
```

## Shared Schema Primitives

### TypeScript Target

```ts
type CurrencyCode = string; // ISO 4217 uppercase, validated by Zod allowlist
type IsoDate = string; // YYYY-MM-DD
type IsoDateTime = string; // full ISO 8601 datetime with timezone offset
type ReconDate = IsoDate | IsoDateTime;

const mvpCurrencies = ["MYR", "USD", "SGD", "EUR"] as const;

type MoneyAmount = {
  value: string; // non-negative decimal string, e.g. "42.50"
  currency: CurrencyCode;
};

type NormalizedParty = {
  name: string | null;
  normalizedName: string | null;
};

type RawExtractedParty = {
  rawName: string | null;
};

type AccountIdentifier = {
  iban: string | null;
  swiftBic: string | null;
  localAccountId: string | null;
  maskedAccount: string | null;
};

type PaymentReference = {
  raw: string | null;
  normalized: string | null;
};

type RawExtractedReference = {
  raw: string | null;
};

type ExchangeRateInformation = {
  unitCurrency: CurrencyCode;
  quotedCurrency: CurrencyCode;
  exchangeRate: string | null;
  rateType: "AGREED" | "SPOT" | "ACTUAL" | "INSTRUCTED" | "IMPLIED" | "UNKNOWN";
  source: "payment_proof" | "bank_statement" | "manual" | "computed_implied" | "not_provided";
  contractId: string | null;
  evidenceText: string | null;
};

type WarningCode =
  | "UNMAPPED_COLUMN"
  | "AMBIGUOUS_COLUMN_MAPPING"
  | "MISSING_REQUIRED_COLUMN"
  | "INVALID_MONEY_FORMAT"
  | "INVALID_DATE_FORMAT"
  | "INVALID_CURRENCY"
  | "MISSING_PAID_AMOUNT"
  | "MISSING_PAYMENT_DATE"
  | "MISSING_PAYMENT_REFERENCE"
  | "MISSING_DEBTOR"
  | "MISSING_CREDITOR"
  | "LOW_QUALITY_PROOF"
  | "LOW_CONFIDENCE_EXTRACTION"
  | "PAYMENT_NOT_SETTLED"
  | "IMPLIED_FX_MISSING_AMOUNTS";

type Warning = {
  code: WarningCode;
  message: string;
  field: string | null;
};

type FieldEvidence = {
  field: string;
  value: string | null;
  originalValue: string | null;
  normalizedValue: string | null;
  confidence: number; // 0 to 1
  source: "csv" | "xlsx" | "pdf_text" | "pdf_table" | "image_ocr" | "manual" | "fixture";
  evidenceText: string | null;
  page: number | null;
  bbox: [number, number, number, number] | null;
  warnings: Warning[];
};

type RemittanceInformation = {
  raw: string | null;
  structured: {
    invoiceNumber?: string | null;
    creditorReference?: string | null;
    additionalInfo?: string | null;
  } | null;
};

type DemoFixture = {
  rawText?: string | null;
  rawTable?: string[][] | null;
  rawOcr?: string | null;
};

type FileStorageRef = {
  kind: "local_path" | "object_storage" | "uploaded_blob";
  uri: string;
  sha256?: string | null;
};
```

### Zod Implementation Notes

```ts
const mvpCurrencySchema = z.enum(["MYR", "USD", "SGD", "EUR"]);
const isoDateTimeSchema = z.string().datetime({ offset: true });
```

### Key Rules

- `PaymentReference.raw` and `PaymentReference.normalized` must allow `null` because missing reference is an MVP scenario.
- `NormalizedParty.name` must allow `null` because OCR may fail to identify debtor or creditor.
- Agent 1 proof extraction outputs raw party names and raw references only. Deterministic code tools create normalized names and normalized references later.
- Money amounts should be non-negative. Use `creditDebitIndicator` for bank direction.
- For hackathon fixtures, bank dates may be bare dates. If full datetimes are available, preserve them.
- Keep raw values somewhere when normalization changes them.
- Expected payment records need `reconciliationStatus` so later matching can skip records that are already matched, partially matched, or void.
- If `exchangeRateInformation.rateType` is `IMPLIED`, then both `sourceAmount` and `targetAmount` must be present.
- `normalizationMetadata.normalizedAt` must be an ISO 8601 datetime with timezone offset, not a free text string.
- If `financialPayload.paymentStatus` is not `ACSC`, then `aiMetadata.requiresManualReview` must be `true`.
- `FieldEvidence.originalValue` and `FieldEvidence.normalizedValue` should be used to show how raw extracted data changed after deterministic normalization.

## Schema 0: Input File Descriptor

This describes any uploaded file before parsing or extraction. Use it for expected payment files, bank statements, and payment proofs.

### TypeScript Target

```ts
type InputFileDescriptor = {
  schemaVersion: "1.0.0";
  fileId: string;
  fileName: string;
  mimeType: string;
  inputKind: "expected_payment_records" | "bank_statement" | "payment_proof";
  sizeBytes: number | null;
  storageRef: FileStorageRef | null;
  uploadedAt: IsoDateTime;
  parseStatus: "PENDING" | "PARSED" | "FAILED" | "NEEDS_MAPPING";
  warnings: Warning[];
};
```

### Example JSON

```json
{
  "schemaVersion": "1.0.0",
  "fileId": "file_expected_001",
  "fileName": "expected-payments.csv",
  "mimeType": "text/csv",
  "inputKind": "expected_payment_records",
  "sizeBytes": 12240,
  "storageRef": {
    "kind": "local_path",
    "uri": "src/lib/recon/fixtures/expected-payments.csv",
    "sha256": null
  },
  "uploadedAt": "2026-05-23T18:30:00+08:00",
  "parseStatus": "PARSED",
  "warnings": []
}
```

## Schema 1: Expected Payment Record

This is what the SME expects to receive.

Use `creditor` and `debtor`, not `seller` and `buyer`, so the vocabulary stays aligned with payment systems.

### TypeScript Target

```ts
type ExpectedPaymentRecord = {
  schemaVersion: "1.0.0";
  expectedPaymentId: string;
  invoiceNumber: string;
  issueDate: IsoDate;
  dueDate: IsoDate | null;
  creditor: NormalizedParty;
  debtor: NormalizedParty;
  creditorAccount: AccountIdentifier | null;
  debtorAccount: AccountIdentifier | null;
  invoiceCurrency: CurrencyCode;
  amountDue: MoneyAmount;
  expectedSettlementCurrency: CurrencyCode;
  paymentReference: PaymentReference;
  reconciliationStatus: "OPEN" | "MATCHED" | "PARTIALLY_MATCHED" | "VOID";
  debtorReference: PaymentReference | null;
  purchaseOrderReference: PaymentReference | null;
  paymentTerms: string | null;
  outstandingAmount: MoneyAmount | null;
  sourceFileId: string;
  sourceRowNumber: number | null;
  fieldConfidence: Record<string, number>;
  evidenceSpans: FieldEvidence[];
  warnings: Warning[];
};
```

### Example JSON

```json
{
  "schemaVersion": "1.0.0",
  "expectedPaymentId": "exp_001",
  "invoiceNumber": "INV-1001",
  "issueDate": "2026-05-19",
  "dueDate": "2026-06-18",
  "creditor": {
    "name": "ReconPilot Sdn Bhd",
    "normalizedName": "RECONPILOT"
  },
  "debtor": {
    "name": "Acme Pte Ltd",
    "normalizedName": "ACME"
  },
  "creditorAccount": {
    "iban": null,
    "swiftBic": null,
    "localAccountId": "MYR_MAIN_ACCOUNT",
    "maskedAccount": "****7788"
  },
  "debtorAccount": {
    "iban": null,
    "swiftBic": null,
    "localAccountId": null,
    "maskedAccount": null
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
  "reconciliationStatus": "OPEN",
  "debtorReference": null,
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
    "debtor.name": 1
  },
  "evidenceSpans": [
    {
      "field": "invoiceNumber",
      "value": "INV-1001",
      "originalValue": "INV-1001",
      "normalizedValue": "INV1001",
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

## Schema 2: Bank Statement Transaction

This is the actual transaction booked by the bank.

For incoming receipts:

- `creditDebitIndicator` is `CRDT`.
- `debtorName` is the sender/payer.
- `creditorName` is our SME if known.

For outgoing payments:

- `creditDebitIndicator` is `DBIT`.
- `creditorName` is the receiving party if known.

### TypeScript Target

```ts
type BankStatementTransaction = {
  schemaVersion: "1.0.0";
  internalTxId: string;
  accountId: string;
  bookingDate: ReconDate;
  valueDate: ReconDate | null;
  creditDebitIndicator: "CRDT" | "DBIT";
  amount: MoneyAmount;
  acctSvcrRef: string | null;
  endToEndId: string | null;
  txId: string | null;
  debtorName: string | null;
  debtorNormalizedName: string | null;
  debtorAccount: AccountIdentifier | null;
  creditorName: string | null;
  creditorNormalizedName: string | null;
  creditorAccount: AccountIdentifier | null;
  remittanceInformation: RemittanceInformation;
  description: string | null;
  rawDescription: string | null;
  sourceFileId: string;
  sourceRowNumber: number | null;
  warnings: Warning[];
};
```

### Example JSON

```json
{
  "schemaVersion": "1.0.0",
  "internalTxId": "txn_001",
  "accountId": "MYR_MAIN_ACCOUNT",
  "bookingDate": "2026-05-20",
  "valueDate": "2026-05-20",
  "creditDebitIndicator": "CRDT",
  "amount": {
    "value": "42.50",
    "currency": "MYR"
  },
  "acctSvcrRef": "BNK-9001",
  "endToEndId": null,
  "txId": null,
  "debtorName": "ACME PTE LTD",
  "debtorNormalizedName": "ACME",
  "debtorAccount": {
    "iban": null,
    "swiftBic": null,
    "localAccountId": null,
    "maskedAccount": null
  },
  "creditorName": "ReconPilot Sdn Bhd",
  "creditorNormalizedName": "RECONPILOT",
  "creditorAccount": {
    "iban": null,
    "swiftBic": null,
    "localAccountId": "MYR_MAIN_ACCOUNT",
    "maskedAccount": "****7788"
  },
  "remittanceInformation": {
    "raw": "Payment for INV-1001",
    "structured": {
      "invoiceNumber": "INV-1001"
    }
  },
  "description": "Foreign inward remittance INV-1001 ACME",
  "rawDescription": "Foreign inward remittance INV-1001 ACME",
  "sourceFileId": "maybank-statement.csv",
  "sourceRowNumber": 4,
  "warnings": []
}
```

## Schema 3: Payment Proof Input Descriptor

This extends the general `InputFileDescriptor` with proof-specific routing hints. It is not yet a financial record.

### TypeScript Target

```ts
type PaymentProofInputDescriptor = InputFileDescriptor & {
  mimeType:
    | "application/pdf"
    | "image/jpeg"
    | "image/png"
    | "image/webp"
    | "image/tiff"
    | "text/plain";
  inputKind: "payment_proof";
  textLayer: boolean;
  tableLikely: boolean;
  imageQuality: "high" | "medium" | "low" | "unknown";
  demoFixture?: DemoFixture;
};
```

### Example JSON

```json
{
  "schemaVersion": "1.0.0",
  "fileId": "proof_file_001",
  "fileName": "wise-transfer-inv-1001.pdf",
  "mimeType": "application/pdf",
  "inputKind": "payment_proof",
  "sizeBytes": 248910,
  "storageRef": {
    "kind": "local_path",
    "uri": "src/lib/recon/fixtures/proofs/wise-transfer-inv-1001.pdf",
    "sha256": null
  },
  "uploadedAt": "2026-05-23T18:31:00+08:00",
  "parseStatus": "PENDING",
  "textLayer": true,
  "tableLikely": false,
  "imageQuality": "high",
  "demoFixture": {
    "rawText": "Wise transfer receipt. Paid USD 10.00 to ReconPilot Sdn Bhd. Reference INV-1001. Exchange rate: 1 USD = 4.2500 MYR. Date 2026-05-20.",
    "rawTable": null,
    "rawOcr": null
  },
  "warnings": []
}
```

## Schema 4: Payment Proof Extraction Output

This is the main output of Agent 1.

It separates the financial payload from AI-specific extraction metadata:

- `financialPayload` contains ISO-aligned payment data.
- `aiMetadata` contains confidence, route, evidence spans, and manual review state.
- Agent 1 does not normalize names or references. It extracts raw values. The Step 3 deterministic code tools produce normalized records after this output.

### TypeScript Target

```ts
type PaymentProofExtractionOutput = {
  schemaVersion: "1.0.0";
  proofId: string;
  sourceFileId: string;
  financialPayload: {
    documentType:
      | "provider_receipt"
      | "bank_advice"
      | "swift_confirmation"
      | "remittance_advice"
      | "internal_transfer_slip"
      | "other";
    paymentStatus: "ACSC" | "ACSP" | "PNDG" | "RJCT" | "CANC" | "UNKNOWN";
    paymentStatusLabel: string | null;
    rawPaymentStatus: string | null;
    debtor: RawExtractedParty;
    creditor: RawExtractedParty;
    debtorAccount: AccountIdentifier | null;
    creditorAccount: AccountIdentifier | null;
    paidAmount: MoneyAmount | null;
    paymentDate: ReconDate | null;
    valueDate: ReconDate | null;
    bookingDate: ReconDate | null;
    reference: RawExtractedReference;
    providerTransactionId: string | null;
    providerOrBankName: string | null;
    invoiceIds: string[];
    endToEndId: string | null;
    uetr: string | null;
    feeAmount: MoneyAmount | null;
    netAmount: MoneyAmount | null;
    sourceAmount: MoneyAmount | null;
    targetAmount: MoneyAmount | null;
    exchangeRateInformation: ExchangeRateInformation | null;
    remittanceInformation: RemittanceInformation;
    rawText: string | null;
  };
  aiMetadata: {
    extractionRoute: "parse_pdf_text" | "parse_pdf_table" | "parse_image_ocr" | "manual_correction";
    overallConfidence: number;
    fieldConfidence: Record<string, number>;
    evidenceSpans: FieldEvidence[];
    requiresManualReview: boolean;
    warnings: Warning[];
  };
};
```

### Example JSON

```json
{
  "schemaVersion": "1.0.0",
  "proofId": "proof_001",
  "sourceFileId": "proof_file_001",
  "financialPayload": {
    "documentType": "provider_receipt",
    "paymentStatus": "ACSC",
    "paymentStatusLabel": "Settled",
    "rawPaymentStatus": "Paid",
    "debtor": {
      "rawName": "Acme Pte Ltd"
    },
    "creditor": {
      "rawName": "ReconPilot Sdn Bhd"
    },
    "debtorAccount": {
      "iban": null,
      "swiftBic": "WISEGB22",
      "localAccountId": null,
      "maskedAccount": "****1234"
    },
    "creditorAccount": {
      "iban": null,
      "swiftBic": null,
      "localAccountId": "MYR_MAIN_ACCOUNT",
      "maskedAccount": "****7788"
    },
    "paidAmount": {
      "value": "10.00",
      "currency": "USD"
    },
    "paymentDate": "2026-05-20",
    "valueDate": null,
    "bookingDate": null,
    "reference": {
      "raw": "INV-1001"
    },
    "providerTransactionId": "WISE-TRX-88291",
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
    "exchangeRateInformation": {
      "unitCurrency": "USD",
      "quotedCurrency": "MYR",
      "exchangeRate": "4.2500",
      "rateType": "AGREED",
      "source": "payment_proof",
      "contractId": null,
      "evidenceText": "Exchange rate: 1 USD = 4.2500 MYR"
    },
    "remittanceInformation": {
      "raw": "Payment for INV-1001",
      "structured": {
        "invoiceNumber": "INV-1001"
      }
    },
    "rawText": "Wise transfer receipt. Paid USD 10.00 to ReconPilot Sdn Bhd. Reference INV-1001. Exchange rate: 1 USD = 4.2500 MYR. Date 2026-05-20."
  },
  "aiMetadata": {
    "extractionRoute": "parse_pdf_text",
    "overallConfidence": 0.96,
    "fieldConfidence": {
      "financialPayload.debtor.rawName": 0.94,
      "financialPayload.creditor.rawName": 0.96,
      "financialPayload.paidAmount.value": 0.99,
      "financialPayload.paidAmount.currency": 0.99,
      "financialPayload.paymentDate": 0.98,
      "financialPayload.reference.raw": 0.97,
      "financialPayload.exchangeRateInformation.exchangeRate": 0.95
    },
    "evidenceSpans": [
      {
        "field": "financialPayload.paidAmount.value",
        "value": "10.00",
        "originalValue": "USD 10.00",
        "normalizedValue": "10.00",
        "confidence": 0.99,
        "source": "pdf_text",
        "evidenceText": "Paid USD 10.00",
        "page": 1,
        "bbox": null,
        "warnings": []
      },
      {
        "field": "financialPayload.exchangeRateInformation.exchangeRate",
        "value": "4.2500",
        "originalValue": "1 USD = 4.2500 MYR",
        "normalizedValue": "4.2500",
        "confidence": 0.95,
        "source": "pdf_text",
        "evidenceText": "Exchange rate: 1 USD = 4.2500 MYR",
        "page": 1,
        "bbox": null,
        "warnings": []
      }
    ],
    "requiresManualReview": false,
    "warnings": []
  }
}
```

### Example When FX Is Not Provided

```json
{
  "exchangeRateInformation": null
}
```

### Example When FX Is Only Implied

Use this only when the proof contains both source and target amounts but no explicit rate.

```json
{
  "exchangeRateInformation": {
    "unitCurrency": "USD",
    "quotedCurrency": "MYR",
    "exchangeRate": "4.2500",
    "rateType": "IMPLIED",
    "source": "computed_implied",
    "contractId": null,
    "evidenceText": "Computed from sourceAmount USD 10.00 and targetAmount MYR 42.50"
  }
}
```

Validation rule:

```ts
if (financialPayload.exchangeRateInformation?.rateType === "IMPLIED") {
  sourceAmount must not be null;
  targetAmount must not be null;
}

if (financialPayload.paymentStatus !== "ACSC") {
  aiMetadata.requiresManualReview must be true;
}
```

## Normalized Post-Processing Record

After Agent 1 extracts raw fields, deterministic code tools normalize the output. This matches the architecture rule:

> Agent 1 extracts. Code normalizes.

The normalized record is created after running tools such as `normalize_party_name()` and `normalize_reference()`.

```ts
type NormalizedPaymentProofRecord = {
  schemaVersion: "1.0.0";
  proofId: string;
  sourceFileId: string;
  financialPayload: Omit<
    PaymentProofExtractionOutput["financialPayload"],
    "debtor" | "creditor" | "reference"
  > & {
    debtor: NormalizedParty;
    creditor: NormalizedParty;
    reference: PaymentReference;
  };
  aiMetadata: PaymentProofExtractionOutput["aiMetadata"];
  normalizationMetadata: {
    normalizedAt: IsoDateTime;
    toolsUsed: Array<"normalize_party_name" | "normalize_reference" | "normalize_date">;
    warnings: Warning[];
  };
};
```

Zod implementation note:

```ts
const isoDateTimeSchema = z.string().datetime({ offset: true });
```

## Schema 5: Input Batch

This is the parent object for one upload/reconciliation run. The dashboard and later Orchestrator Agent should use `batchId` to keep expected payments, bank rows, proof inputs, and proof extractions together.

### TypeScript Target

```ts
type InputBatch = {
  schemaVersion: "1.0.0";
  batchId: string;
  uploadedAt: IsoDateTime;
  files: InputFileDescriptor[];
  expectedPayments: ExpectedPaymentRecord[];
  bankTransactions: BankStatementTransaction[];
  paymentProofInputs: PaymentProofInputDescriptor[];
  paymentProofExtractions: PaymentProofExtractionOutput[];
  warnings: Warning[];
};
```

### Example JSON

```json
{
  "schemaVersion": "1.0.0",
  "batchId": "batch_001",
  "uploadedAt": "2026-05-23T18:32:00+08:00",
  "files": [
    {
      "schemaVersion": "1.0.0",
      "fileId": "file_expected_001",
      "fileName": "expected-payments.csv",
      "mimeType": "text/csv",
      "inputKind": "expected_payment_records",
      "sizeBytes": 12240,
      "uploadedAt": "2026-05-23T18:30:00+08:00",
      "parseStatus": "PARSED",
      "warnings": []
    }
  ],
  "expectedPayments": [],
  "bankTransactions": [],
  "paymentProofInputs": [],
  "paymentProofExtractions": [],
  "warnings": []
}
```

## Implementation Order For This File

1. Create `src/lib/recon/schemas.ts`.
2. Add shared Zod primitives.
3. Add general input file descriptor schema.
4. Add expected payment schema.
5. Add bank statement transaction schema.
6. Add payment proof input descriptor schema.
7. Add payment proof extraction output schema.
8. Add input batch schema.
9. Export TypeScript types from `src/lib/recon/types.ts`.
10. Create fixtures that match the JSON examples in this file.
11. Add tests for valid and invalid examples.

## Schema Tests

Minimum tests:

- valid expected payment record passes;
- valid bank statement transaction passes;
- valid general input file descriptor passes;
- valid payment proof input descriptor passes;
- input file descriptors include `storageRef` for real uploaded/local proof files;
- valid payment proof extraction output passes;
- valid input batch passes;
- expected payment record includes `reconciliationStatus`;
- payment proof descriptor uses `demoFixture` instead of root-level fixture fields;
- lowercase currency fails;
- unsupported MVP currency fails;
- invalid date fails;
- negative money amount fails;
- missing reference is allowed but creates a warning;
- missing debtor or creditor is allowed in extraction output but creates a warning;
- Agent 1 extraction output uses raw debtor, creditor, and reference fields;
- normalized payment proof record is created after deterministic normalization;
- `exchangeRateInformation` can be explicit, implied, or null;
- `IMPLIED` exchange rate requires both `sourceAmount` and `targetAmount`.
- payment status other than `ACSC` requires manual review;
- parser warning codes include `UNMAPPED_COLUMN`, `AMBIGUOUS_COLUMN_MAPPING`, `MISSING_REQUIRED_COLUMN`, `INVALID_MONEY_FORMAT`, and `LOW_CONFIDENCE_EXTRACTION`;
- proof extraction warning codes include `MISSING_PAID_AMOUNT`, `MISSING_PAYMENT_DATE`, `MISSING_PAYMENT_REFERENCE`, `MISSING_DEBTOR`, `MISSING_CREDITOR`, and `LOW_QUALITY_PROOF`;
- `FieldEvidence` includes `originalValue` and `normalizedValue`.

## Definition Of Done

The schema contract is done when:

- input batch, file descriptor, expected payment, bank transaction, proof input, and proof extraction schemas exist in TypeScript/Zod;
- all example JSON payloads validate;
- expected payment records include `reconciliationStatus`;
- uploaded files are grouped under an `InputBatch`;
- uploaded files include `storageRef` so extraction/parsing tools can read real file content;
- payment proof demo fixture data is nested under `demoFixture`;
- MVP currencies are explicitly allowlisted;
- missing messy-source fields can be represented truthfully as `null`;
- warnings explain missing or low-confidence fields;
- parser mapping issues have explicit warning codes;
- payment proof extraction separates `financialPayload` from `aiMetadata`;
- payment proof extraction keeps raw party/reference fields before deterministic normalization;
- evidence spans show original and normalized values;
- exchange rate data is extracted only when present or clearly implied;
- no reconciliation matching is implemented in this schema phase.
