# ReconPilot — Code Tools: Parse + Normalize

Status: ready for implementation
Stack: Next.js App Router, TypeScript, Zod, Vitest, PapaParse, SheetJS
Scope: deterministic layer between Agent 1 extraction output and Agent 2 reconciliation
Date: 2026-05-24

---

## 0. Implementation Todo

Use [CODE_TOOLS_PARSE_NORMALIZE_TODO.md](CODE_TOOLS_PARSE_NORMALIZE_TODO.md) as the implementation checklist for this plan.

This todo is intentionally limited to parsing and normalization. Agent 2 owns the separate Reconciliation Tools.

---

## 1. Boundary Rule

```
Agent 1  →  extracts raw proof fields
Code Tools  →  deterministically normalizes fields
Agent 2  →  matches normalized evidence
```

In this document, "Code Tools" means **Parse + Normalize Tools only**.

Parse + Normalize Tools must not: call any LLM, match proofs to invoices, fetch FX rates, score candidates, classify status, or generate reports.

Those reconciliation actions are still required, but they belong to **Agent 2 + Reconciliation Tools**, not this parse/normalize layer:

```text
Agent 2 owns:
- generateBankAnchoredCandidates()
- calculateFxScenarios()
- evaluateAmountResidual()
- evaluateFeeHypothesis()
- scoreCandidate()
- classifyMatch()
```

This boundary prevents the parse/normalize layer from accidentally becoming the matching engine.

**Schema reference:** All type definitions (`ExpectedPaymentRecord`, `BankStatementTransaction`, `PaymentProofInputDescriptor`, `PaymentProofExtractionOutput`, `InputBatch`, shared primitives) are defined in [INPUT_PLAN.md](INPUT_PLAN.md). Do not redefine them here — treat that file as the source of truth.

---

## 2. Input: What You Receive from Agent 1

Agent 1 returns an `ExtractionAgentResult` wrapper per proof — read both fields:

```ts
type ExtractionAgentResult = {
  extraction: PaymentProofExtractionOutput;  // primary data
  timeline: TimelineEvent[];                  // pass through to NormalizedInputBatch.timelines
};
```

Access via `result.extraction.financialPayload`, `result.extraction.aiMetadata`, and `result.timeline`. Do not depend on internal Agent 1 helper objects like `ExtractionToolResult` — those are internal to Agent 1 and not part of the handoff.

Agent 1 also expects proof files to be read via `PaymentProofInputDescriptor.storageRef`:

```ts
storageRef: {
  kind: "local_path" | "object_storage" | "uploaded_blob";
  uri: string;
  sha256?: string | null;
}
```

`demoFixture` is fallback/test content only — do not treat it as the primary demo source.

The full input Code Tools should accept is an `InputBatch` (or enough to build one):

```ts
type InputBatch = {
  schemaVersion: "1.0.0";
  batchId: string;
  uploadedAt: IsoDateTime;
  expectedPayments: ExpectedPaymentRecord[];
  bankTransactions: BankStatementTransaction[];
  paymentProofExtractions: PaymentProofExtractionOutput[];
  warnings: Warning[];
};
```

One `PaymentProofExtractionOutput` per proof file:

```json
{
  "schemaVersion": "1.0.0",
  "proofId": "proof_001",
  "sourceFileId": "proof_file_001",
  "financialPayload": {
    "documentType": "provider_receipt",
    "paymentStatus": "ACSC",
    "debtor": { "rawName": "ABC Singapore" },
    "creditor": { "rawName": "ReconPilot Sdn Bhd" },
    "paidAmount": { "value": "10.00", "currency": "USD" },
    "paymentDate": "2026-05-20",
    "reference": { "raw": "INV-1001" },
    "invoiceIds": ["INV-1001"],
    "exchangeRateInformation": {
      "unitCurrency": "USD",
      "quotedCurrency": "MYR",
      "exchangeRate": "4.2500",
      "rateType": "AGREED",
      "source": "payment_proof",
      "contractId": null,
      "evidenceText": "Exchange rate: 1 USD = 4.2500 MYR"
    },
    "targetAmount": { "value": "42.50", "currency": "MYR" },
    "rawText": "Wise transfer receipt. Paid USD 10.00..."
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

Key: `debtor`, `creditor`, and `reference` are **raw** — not normalized yet.

---

## 3. Output: What You Hand to Agent 2

You produce a `NormalizedInputBatch`:

> Contract note: `NormalizedInputBatch` is the handoff object from Parse + Normalize Tools to Agent 2. If `INPUT_PLAN.md` does not define this type yet during implementation, keep this exact shape as the working contract and align it into shared schemas before integration. Do not silently rename or reshape it without updating Agent 2.

```json
{
  "schemaVersion": "1.0.0",
  "batchId": "batch_001",
  "uploadedAt": "2026-05-24T10:00:00+08:00",
  "expectedPayments": [
    {
      "schemaVersion": "1.0.0",
      "expectedPaymentId": "exp_001",
      "invoiceNumber": "INV-1001",
      "issueDate": "2026-05-19",
      "dueDate": "2026-06-18",
      "creditor": { "name": "ReconPilot Sdn Bhd", "normalizedName": "RECONPILOT" },
      "debtor": { "name": "Acme Pte Ltd", "normalizedName": "ACME" },
      "invoiceCurrency": "USD",
      "amountDue": { "value": "10.00", "currency": "USD" },
      "expectedSettlementCurrency": "MYR",
      "paymentReference": { "raw": "INV-1001", "normalized": "INV1001" },
      "reconciliationStatus": "OPEN",
      "warnings": []
    }
  ],
  "bankTransactions": [
    {
      "schemaVersion": "1.0.0",
      "internalTxId": "txn_001",
      "accountId": "MYR_MAIN_ACCOUNT",
      "bookingDate": "2026-05-20",
      "creditDebitIndicator": "CRDT",
      "amount": { "value": "42.50", "currency": "MYR" },
      "debtorName": "ACME PTE LTD",
      "debtorNormalizedName": "ACME",
      "remittanceInformation": {
        "raw": "Payment for INV-1001",
        "structured": { "invoiceNumber": "INV-1001" }
      },
      "rawDescription": "Foreign inward remittance INV-1001 ACME",
      "warnings": []
    }
  ],
  "paymentProofs": [
    {
      "schemaVersion": "1.0.0",
      "proofId": "proof_001",
      "sourceFileId": "proof_file_001",
      "financialPayload": {
        "debtor": { "name": "ABC Singapore", "normalizedName": "ABC SINGAPORE" },
        "creditor": { "name": "ReconPilot Sdn Bhd", "normalizedName": "RECONPILOT" },
        "reference": { "raw": "INV-1001", "normalized": "INV1001" },
        "paidAmount": { "value": "10.00", "currency": "USD" },
        "paymentDate": "2026-05-20"
      },
      "aiMetadata": { "...": "preserved exactly from Agent 1" },
      "normalizationMetadata": {
        "normalizedAt": "2026-05-24T10:00:01+08:00",
        "toolsUsed": ["normalize_party_name", "normalize_reference", "normalize_date"],
        "warnings": []
      }
    }
  ],
  "warnings": [],
  "timelines": []
}
```

**The normalization invariant Agent 2 depends on:**
```
expectedPayments[0].paymentReference.normalized        = "INV1001"
paymentProofs[0].financialPayload.reference.normalized = "INV1001"
normalize_reference("INV-1001")                        = "INV1001"
```

---

## 4. What Agent 2 Actually Compares

Agent 2 answers: *"Can this bank deposit be explained by this payment proof and this expected payment?"*

It needs these three records to be comparable:

```
Expected payment:
  invoiceNumber:               INV-1001
  paymentReference.normalized: INV1001       ← must match proof and bank
  debtor.normalizedName:       ACME          ← must match proof and bank
  amountDue:                   USD 10.00
  expectedSettlementCurrency:  MYR

Payment proof:
  reference.normalized:        INV1001       ← must match expected and bank
  debtor.normalizedName:       ACME          ← must match expected and bank
  paidAmount:                  USD 10.00
  paymentDate:                 2026-05-20
  overallConfidence + evidenceSpans

Bank transaction:
  remittanceInformation.structured.invoiceNumber: INV-1001
  normalize_reference(remittanceInformation.raw): INV1001  ← call same function
  debtorNormalizedName:        ACME          ← must match proof and expected
  amount:                      MYR 42.50
  bookingDate:                 2026-05-20
  rawDescription:              ABC SG TRANSFER INV1001
```

If normalization is inconsistent across these three, Agent 2's string-equality matching breaks.

---

## 5. Data Flow

```
CSV/XLSX expected-payments  →  parsers/expected-payments.ts  ─┐
CSV/XLSX bank-statements    →  parsers/bank-statements.ts    ─┤→ 
Agent 1 extraction output    →  normalize-payment-proof.ts   ─┘
normalize-input-batch.ts → NormalizedInputBatch → Agent 2

All three paths call normalizers.ts for consistent reference/party/date normalization.
```

---

## 6. File Structure

```
src/lib/recon/
├── schemas.ts                      ← Zod schemas (source of truth)
├── types.ts                        ← TypeScript types inferred from schemas
├── normalizers.ts                  ← normalize_reference, normalize_party_name, normalize_date, normalize_currency_amount
├── normalizers.test.ts
├── normalize-payment-proof.ts      ← PaymentProofExtractionOutput → NormalizedPaymentProofRecord
├── normalize-payment-proof.test.ts
├── normalize-input-batch.ts        ← assembles NormalizedInputBatch
├── normalize-input-batch.test.ts
└── parsers/
    ├── expected-payments.ts        ← CSV/XLSX → ExpectedPaymentRecord[]
    ├── expected-payments.test.ts
    ├── bank-statements.ts          ← CSV/XLSX → BankStatementTransaction[]
    └── bank-statements.test.ts
```

Build order: `schemas.ts → types.ts → normalizers.ts → parsers/* → normalize-payment-proof.ts → normalize-input-batch.ts`

---

## 7. Normalizer Functions (`normalizers.ts`)

Four pure, synchronous, side-effect-free functions:

```ts
// Strip non-alphanumeric, uppercase
normalize_reference("INV-1001")         // → "INV1001"
normalize_reference("PO/2026/05/ABC")   // → "PO202605ABC"
normalize_reference(null)               // → null

// Strip legal entity suffixes (Pte Ltd, Sdn Bhd, Inc, Ltd, LLC...), uppercase
normalize_party_name("Acme Pte Ltd")         // → "ACME"
normalize_party_name("ReconPilot Sdn Bhd")   // → "RECONPILOT"
normalize_party_name("ABC Singapore")        // → "ABC SINGAPORE"
normalize_party_name(null)                   // → null

// Extract YYYY-MM-DD; never use new Date() — timezone-unsafe
normalize_date("2026-05-20")                    // → "2026-05-20"
normalize_date("2026-05-20T18:30:00+08:00")     // → "2026-05-20"
normalize_date("20/05/2026")                    // → null + INVALID_DATE_FORMAT

// Strip currency prefix/symbol, commas; return decimal string
normalize_currency_amount("USD 10.00")   // → "10.00"
normalize_currency_amount("$42.50")      // → "42.50"
normalize_currency_amount("1,234.56")    // → "1234.56"
normalize_currency_amount("-10.00")      // → null
```

**Money safety rule:** never use `parseFloat()` or `Number()` on money values. Keep as decimal strings throughout.

---

## 8. Parser Responsibilities

### `parsers/expected-payments.ts`

```ts
parseExpectedPayments(content: string | Buffer, format: "csv" | "xlsx", sourceFileId: string): ExpectedPaymentRecord[]
```

- Accepts flexible column names (invoice_number, inv no, customer, payer, amount due, total, etc.)
- Normalizes: `debtor.normalizedName`, `creditor.normalizedName`, `paymentReference.normalized`
- Sets `reconciliationStatus: "OPEN"` on every parsed record
- Emits warnings: `UNMAPPED_COLUMN`, `AMBIGUOUS_COLUMN_MAPPING`, `MISSING_REQUIRED_COLUMN`, `INVALID_MONEY_FORMAT`, `INVALID_DATE_FORMAT`, `INVALID_CURRENCY`

### `parsers/bank-statements.ts`

```ts
parseBankStatements(content: string | Buffer, format: "csv" | "xlsx", sourceFileId: string, accountId: string): BankStatementTransaction[]
```

- Handles two CSV formats: (a) single amount + direction column, (b) split credit/debit columns
- Direction mapping: `"CR"/"C"/"CRDT"` → `"CRDT"`, `"DR"/"D"/"DBIT"` → `"DBIT"`
- Extracts `remittanceInformation.structured.invoiceNumber` from description text via `INV-\d+` pattern
- Normalizes: `debtorNormalizedName`, `creditorNormalizedName`

---

## 9. Evidence Preservation Rules

Code Tools must preserve all Agent 1 evidence — never discard:

- `aiMetadata.fieldConfidence`
- `aiMetadata.evidenceSpans`
- `aiMetadata.warnings`
- `aiMetadata.overallConfidence`
- `aiMetadata.requiresManualReview`
- `timeline` (passed through to `NormalizedInputBatch.timelines`)

For `FieldEvidence` spans:
- `originalValue` — the raw extracted fragment e.g. `"USD 10.00"` or `"INV-1001"`. Never change this.
- `normalizedValue` — Agent 1 may set this for low-level extraction cleanup (money formatting, date formatting). For party names, invoice IDs, and references, **Code Tools should create or update normalization evidence** rather than pretending Agent 1 already normalized those fields. This means when Code Tools normalizes `"ABC Singapore"` → `"ABC SINGAPORE"`, it should record that transformation in a new or updated evidence entry with `originalValue: "ABC Singapore"` and `normalizedValue: "ABC SINGAPORE"`.

---

## 10. Warning Propagation

| Source | Warning codes | Stored on |
|---|---|---|
| CSV/XLSX column problems | `UNMAPPED_COLUMN`, `AMBIGUOUS_COLUMN_MAPPING`, `MISSING_REQUIRED_COLUMN` | `record.warnings[]` + `batch.warnings[]` |
| CSV/XLSX field validation | `INVALID_MONEY_FORMAT`, `INVALID_DATE_FORMAT`, `INVALID_CURRENCY` | `record.warnings[]` + `batch.warnings[]` |
| Agent 1 proof extraction | `MISSING_PAID_AMOUNT`, `MISSING_PAYMENT_DATE`, `MISSING_PAYMENT_REFERENCE`, `MISSING_DEBTOR`, `MISSING_CREDITOR`, `LOW_QUALITY_PROOF`, `LOW_CONFIDENCE_EXTRACTION`, `PAYMENT_NOT_SETTLED`, `IMPLIED_FX_MISSING_AMOUNTS` | `aiMetadata.warnings[]` (preserved as-is, never dropped) |
| Normalization | `PAYMENT_NOT_SETTLED` (if status ≠ ACSC and manual review not flagged) | `normalizationMetadata.warnings[]` + `batch.warnings[]` |

---

## 11. Handoff Checklist (Definition of Done)

Before Code Tools output is considered ready for Agent 2:

- [ ] `PaymentProofExtractionOutput` validates against `INPUT_PLAN.md` schemas
- [ ] Every proof extraction has `financialPayload` with required keys filled or `null`
- [ ] Every proof extraction has `aiMetadata.extractionRoute`
- [ ] Every proof extraction has `aiMetadata.fieldConfidence`
- [ ] Every proof extraction preserves `warnings` and `evidenceSpans` — not dropped
- [ ] `NormalizedPaymentProofRecord` created without mutating raw evidence
- [ ] References normalized consistently: same `normalize_reference` called on expected payments, proofs, and bank remittance
- [ ] Party names normalized consistently: same `normalize_party_name` called on all three record types
- [ ] Dates normalized to comparable ISO `YYYY-MM-DD` strings
- [ ] Money values remain decimal strings — no `parseFloat()` or `Number()`
- [ ] No matching, scoring, classification, or FX scenario comparison in Code Tools

---

## 12. Agent Activity Timeline

Code Tools writes timeline events using `agent: "Code Tools"`. These appear in the same activity panel as Agent 1 and Agent 2 events during the demo.

Timeline event shape (from `EXTRACTION_AGENT_PLAN.md`):

```ts
type TimelineEvent = {
  id: string;
  timestamp: string;           // ISO datetime
  agent: "Code Tools";
  action: string;
  toolName?: string;
  inputSummary: string;
  resultSummary: string;
  reasoning: string;
  warnings: Warning[];
};
```

Write one event per meaningful step. Examples:

```json
{
  "agent": "Code Tools",
  "action": "parse_expected_payments",
  "inputSummary": "expected-payments.csv (4 rows)",
  "resultSummary": "4 ExpectedPaymentRecords parsed, 0 warnings",
  "reasoning": "Mapped invoice_number → invoiceNumber, customer → debtor.name, amount → amountDue.value",
  "warnings": []
}
```

```json
{
  "agent": "Code Tools",
  "action": "parse_bank_statement",
  "inputSummary": "maybank-statement.csv (12 rows)",
  "resultSummary": "12 BankStatementTransactions parsed, 1 warning",
  "reasoning": "Format B detected (split credit/debit columns). Extracted invoiceNumber from description text for 8 rows.",
  "warnings": [{ "code": "UNMAPPED_COLUMN", "message": "Column 'branch_code' has no mapping", "field": null }]
}
```

```json
{
  "agent": "Code Tools",
  "action": "normalize_payment_proof",
  "inputSummary": "proof_001 (route: parse_pdf_text, confidence: 0.96)",
  "resultSummary": "Normalized debtor 'ABC Singapore' → 'ABC SINGAPORE', reference 'INV-1001' → 'INV1001'",
  "reasoning": "Applied normalize_party_name and normalize_reference. aiMetadata preserved unchanged.",
  "warnings": []
}
```

```json
{
  "agent": "Code Tools",
  "action": "assemble_normalized_batch",
  "inputSummary": "4 expected payments, 12 bank transactions, 3 payment proofs",
  "resultSummary": "NormalizedInputBatch ready for Agent 2",
  "reasoning": "All references normalize to INV1001/INV1002/INV1003 across all three record types.",
  "warnings": []
}
```

These events flow into `NormalizedInputBatch.timelines` alongside Agent 1's extraction timeline events.

---

## 13. Verification

```bash
npx vitest run src/lib/recon/
npx tsc --noEmit
```

End-to-end smoke: feed `reference.raw: "INV-1001"` through all three record types and assert all three normalize to `"INV1001"`.
