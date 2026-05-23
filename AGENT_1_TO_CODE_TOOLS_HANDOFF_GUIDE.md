# ReconPilot Agent 1 to Code Tools Transition Guide

Status: handoff contract for Agent 1 extraction tools to deterministic parse/normalize code  
Audience: Code Tools / parse-normalize teammates  
Date: 2026-05-23

## Purpose

This guide defines exactly what Agent 1 hands to the next architecture block.

Agent 1 is **Extraction Agent**. It turns messy payment proof files into raw, evidence-backed structured extraction output.

Next architecture block is **Code Tools: Parse + Normalize**. It takes parsed expected payments, parsed bank transactions, and Agent 1 proof extractions, then produces clean normalized records for Agent 2 matching.

The central boundary is:

```text
Agent 1 extracts raw proof fields.
Code Tools deterministically normalize fields.
Agent 2 matches normalized evidence.
```

## Agent 1 Output

Agent 1 returns:

```ts
type ExtractionAgentResult = {
  extraction: PaymentProofExtractionOutput;
  timeline: TimelineEvent[];
};
```

The `extraction` object is the primary data passed into Code Tools.

Code Tools should read:

```ts
result.extraction.financialPayload
result.extraction.aiMetadata
result.timeline
```

Code Tools should not depend on internal Agent 1 helper objects such as `ExtractionToolResult`. Tool results are internal to Agent 1 and are assembled into `PaymentProofExtractionOutput` before handoff.

## Code Tools Input Contract

Code Tools should accept an `InputBatch` or enough data to build one:

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

At minimum, Code Tools need:

- `expectedPayments`: parsed expected payment records from CSV/XLSX.
- `bankTransactions`: parsed local bank statement transactions from CSV/XLSX.
- `paymentProofExtractions`: Agent 1 proof extraction outputs.
- `warnings`: batch-level parser or extraction warnings.

## Code Tools Responsibilities

Code Tools own deterministic parsing and normalization:

- `parse_expected_payments(file)` for expected payment records.
- `parse_bank_statement(file)` for local bank transactions.
- `normalize_reference(value)`.
- `normalize_party_name(value)`.
- `normalize_date(value)`.
- `normalize_currency_amount(value)`.
- Create `NormalizedPaymentProofRecord` from each `PaymentProofExtractionOutput`.
- Preserve evidence, confidence, and warnings from Agent 1.
- Add normalization metadata showing which deterministic tools ran.

Code Tools do **not**:

- choose extraction routes;
- OCR images;
- infer missing proof fields;
- match proofs to invoices;
- match proofs to bank deposits;
- fetch FX rates for scenario comparison;
- score candidates;
- classify `AUTO_MATCHED`, `LIKELY_MATCHED`, `NEEDS_REVIEW`, or `UNMATCHED`;
- generate reconciliation reports or emails.


## Suggested Code Tools Implementation Files

Suggested files for the parse/normalize teammates:

- `src/lib/recon/normalizers.ts`
- `src/lib/recon/normalizers.test.ts`
- `src/lib/recon/normalize-payment-proof.ts`
- `src/lib/recon/normalize-payment-proof.test.ts`
- `src/lib/recon/normalize-input-batch.ts`
- `src/lib/recon/normalize-input-batch.test.ts`
- `src/lib/recon/parsers/expected-payments.ts`
- `src/lib/recon/parsers/expected-payments.test.ts`
- `src/lib/recon/parsers/bank-statements.ts`
- `src/lib/recon/parsers/bank-statements.test.ts`

Keep parser files focused on structured CSV/XLSX inputs. Keep proof normalization focused on Agent 1 `PaymentProofExtractionOutput` records.

## Payment Proof Normalization

Agent 1 output keeps raw parties and references:

```ts
financialPayload: {
  debtor: { rawName: "ABC Singapore" },
  creditor: { rawName: "ReconPilot Sdn Bhd" },
  reference: { raw: "INV-1001" },
  paidAmount: { value: "10.00", currency: "USD" },
  paymentDate: "2026-05-20"
}
```

Code Tools convert it to a normalized proof record:

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

Example transformation:

```text
raw debtor: "ABC Singapore"
normalized debtor: "ABC SINGAPORE" or "ABC"

raw reference: "INV-1001"
normalized reference: "INV1001"

raw payment date: "2026-05-20"
normalized payment date: "2026-05-20"
```

Use the same normalization logic for expected payment references, proof references, and bank remittance references so Agent 2 compares like with like.

## Evidence Rules

Code Tools must preserve Agent 1 evidence:

- `aiMetadata.fieldConfidence`
- `aiMetadata.evidenceSpans`
- `aiMetadata.warnings`
- `aiMetadata.overallConfidence`
- `aiMetadata.requiresManualReview`
- `timeline`

Do not discard low-confidence or missing-field warnings during normalization.

For `FieldEvidence`:

- `originalValue` is the raw extracted fragment, such as `"USD 10.00"` or `"INV-1001"`.
- `normalizedValue` may show low-level extraction cleanup for money/date values, such as `"10.00"` or `"2026-05-20"`.
- For party names, invoice IDs, and references, deterministic Code Tools normalization should create or update normalization evidence rather than pretending Agent 1 already normalized those values.

## Warning Handling

Code Tools should carry these Agent 1 warnings forward:

- `MISSING_PAID_AMOUNT`
- `MISSING_PAYMENT_DATE`
- `MISSING_PAYMENT_REFERENCE`
- `MISSING_DEBTOR`
- `MISSING_CREDITOR`
- `LOW_QUALITY_PROOF`
- `LOW_CONFIDENCE_EXTRACTION`
- `PAYMENT_NOT_SETTLED`
- `IMPLIED_FX_MISSING_AMOUNTS`

Code Tools parser warnings are separate:

- `UNMAPPED_COLUMN`
- `AMBIGUOUS_COLUMN_MAPPING`
- `MISSING_REQUIRED_COLUMN`
- `INVALID_MONEY_FORMAT`
- `INVALID_DATE_FORMAT`
- `INVALID_CURRENCY`

Do not use `MISSING_REQUIRED_COLUMN` for blurred image proofs. That code is for structured CSV/XLSX parser problems.

## Expected Output From Code Tools

Code Tools should produce a normalized batch that Agent 2 can consume:

```ts
type NormalizedInputBatch = {
  schemaVersion: "1.0.0";
  batchId: string;
  uploadedAt: IsoDateTime;
  expectedPayments: ExpectedPaymentRecord[];
  bankTransactions: BankStatementTransaction[];
  paymentProofs: NormalizedPaymentProofRecord[];
  warnings: Warning[];
  timelines: TimelineEvent[];
};
```

If the exact type name changes during implementation, keep the shape and intent:

- normalized expected payment records;
- normalized bank transaction records;
- normalized payment proof records;
- warnings preserved;
- timelines preserved.

## What Agent 2 Needs From Code Tools

Agent 2 needs comparable records:

```text
Expected payment:
invoiceNumber: INV-1001
normalized reference: INV1001
debtor/customer: ABC
amount due: USD 10.00
expected settlement currency: MYR

Payment proof:
normalized reference: INV1001
debtor/payer: ABC
paid amount: USD 10.00
payment date: 2026-05-20
confidence + evidence

Bank transaction:
normalized remittance/reference: INV1001
debtor/sender: ABC
credit amount: MYR 42.50
booking date: 2026-05-20
raw description: ABC SG TRANSFER INV1001
```

Agent 2 then answers:

```text
Can this bank deposit be explained by this payment proof and this expected payment?
```

## Handoff Checklist

Before Code Tools output is considered ready for Agent 2:

- `PaymentProofExtractionOutput` validates against `INPUT_PLAN.md`.
- Every proof extraction has `financialPayload` with required keys filled or `null`.
- Every proof extraction has `aiMetadata.extractionRoute`.
- Every proof extraction has `aiMetadata.fieldConfidence`.
- Every proof extraction preserves warnings and evidence spans.
- `NormalizedPaymentProofRecord` is created without changing raw evidence.
- References are normalized consistently across expected payments, proofs, and bank rows.
- Party names are normalized consistently across expected payments, proofs, and bank rows.
- Dates are normalized to comparable ISO strings.
- Money values remain decimal strings, not floats.
- No matching, scoring, classification, or FX scenario comparison happens in Code Tools.

## Example End-to-End Handoff

Input to Code Tools from Agent 1:

```json
{
  "proofId": "proof_001",
  "sourceFileId": "proof_file_001",
  "financialPayload": {
    "debtor": { "rawName": "ABC Singapore" },
    "creditor": { "rawName": "ReconPilot Sdn Bhd" },
    "paidAmount": { "value": "10.00", "currency": "USD" },
    "paymentDate": "2026-05-20",
    "reference": { "raw": "INV-1001" },
    "invoiceIds": ["INV-1001"],
    "rawText": "ABC paid USD 10.00 for INV-1001"
  },
  "aiMetadata": {
    "extractionRoute": "parse_pdf_text",
    "overallConfidence": 0.96,
    "fieldConfidence": {
      "financialPayload.debtor.rawName": 0.94,
      "financialPayload.paidAmount.value": 0.99,
      "financialPayload.paymentDate": 0.98,
      "financialPayload.reference.raw": 0.97
    },
    "evidenceSpans": [],
    "requiresManualReview": false,
    "warnings": []
  }
}
```

Code Tools normalized proof output:

```json
{
  "proofId": "proof_001",
  "sourceFileId": "proof_file_001",
  "financialPayload": {
    "debtor": {
      "name": "ABC Singapore",
      "normalizedName": "ABC"
    },
    "creditor": {
      "name": "ReconPilot Sdn Bhd",
      "normalizedName": "RECONPILOT"
    },
    "paidAmount": {
      "value": "10.00",
      "currency": "USD"
    },
    "paymentDate": "2026-05-20",
    "reference": {
      "raw": "INV-1001",
      "normalized": "INV1001"
    },
    "invoiceIds": ["INV-1001"]
  },
  "normalizationMetadata": {
    "normalizedAt": "2026-05-23T18:45:00+08:00",
    "toolsUsed": [
      "normalize_party_name",
      "normalize_reference",
      "normalize_date"
    ],
    "warnings": []
  }
}
```

This is ready for Agent 2 candidate generation and matching.
