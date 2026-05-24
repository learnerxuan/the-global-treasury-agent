# Opus Agent 2 Implementation Handoff

Status: implementation handoff
Audience: Claude Opus / Agent 2 implementer
Date: 2026-05-24

## 1. Current Repo State

The repo already has:

- Next.js App Router UI and API.
- Multi-file upload for invoices, bank statements, and payment proofs.
- Agent 1 extraction flow.
- NVIDIA-backed AI extraction support for now.
- Parse + Normalize Code Tools.
- UI panel for:
  - `Structured Extraction JSON`
  - `Parsed + Normalized JSON`

The current API endpoint is:

```text
POST /api/reconciliation/extractions
```

That endpoint returns:

```ts
type ReconciliationExtractionResponse = {
  batchId: string;
  uploadedAt: string;
  documents: Record<DocumentRole, StoredDocument[]>;
  extractions: Record<DocumentRole, StructuredDocumentExtraction[]>;
  codeTools: {
    parsedInputBatch: InputBatch;
    normalizedInputBatch: NormalizedInputBatch;
  };
};
```

Agent 2 must start from:

```ts
response.codeTools.normalizedInputBatch
```

Do not make Agent 2 read uploaded files directly. That would duplicate Agent 1 and Code Tools.

## 2. What To Build

Build Agent 2 as the reconciliation layer:

```text
NormalizedInputBatch
-> validate normalized input
-> generate bank-anchored candidates
-> calculate FX scenarios
-> evaluate residual and fee hypotheses
-> score candidates
-> detect competition
-> classify result
-> create artifact and human-review requests
-> return dashboard-ready reconciliation output
```

Recommended entrypoint:

```ts
runReconciliationOrchestrator(
  batch: NormalizedInputBatch,
  options?: ReconciliationOrchestratorOptions
): OrchestratorOutput
```

Recommended file location:

```text
src/lib/recon/reconciliation/
  schemas.ts
  types.ts
  policy.ts
  tools.ts
  orchestrator.ts
  timeline.ts
  fixtures.ts
  *.test.ts
```

Keep Agent 2 independent from the UI at first. The first milestone is a tested library function.

## 3. Existing Types To Reuse

Use the current source-of-truth types from:

```text
src/lib/recon/types.ts
src/lib/recon/schemas.ts
```

Important existing types:

```ts
NormalizedInputBatch
ExpectedPaymentRecord
BankStatementTransaction
NormalizedPaymentProofRecord
Warning
TimelineEvent
```

Do not redefine these unless you are extending them in a new Agent 2-specific output schema.

## 4. Current Normalized Input Shape

Agent 2 receives:

```ts
type NormalizedInputBatch = {
  schemaVersion: "1.0.0";
  batchId: string;
  uploadedAt: string;
  expectedPayments: ExpectedPaymentRecord[];
  bankTransactions: BankStatementTransaction[];
  paymentProofs: NormalizedPaymentProofRecord[];
  warnings: Warning[];
  timelines: TimelineEvent[];
};
```

Useful fields:

```ts
expectedPayment.expectedPaymentId
expectedPayment.invoiceNumber
expectedPayment.issueDate
expectedPayment.dueDate
expectedPayment.debtor.normalizedName
expectedPayment.amountDue
expectedPayment.expectedSettlementCurrency
expectedPayment.paymentReference.normalized

bankTransaction.internalTxId
bankTransaction.bookingDate
bankTransaction.valueDate
bankTransaction.creditDebitIndicator
bankTransaction.amount
bankTransaction.normalizedReference
bankTransaction.debtorNormalizedName
bankTransaction.remittanceInformation.raw
bankTransaction.remittanceInformation.structured?.invoiceNumber

paymentProof.proofId
paymentProof.financialPayload.paymentStatus
paymentProof.financialPayload.debtor.normalizedName
paymentProof.financialPayload.paidAmount
paymentProof.financialPayload.paymentDate
paymentProof.financialPayload.reference.normalized
paymentProof.financialPayload.exchangeRateInformation
paymentProof.aiMetadata.overallConfidence
paymentProof.aiMetadata.fieldConfidence
paymentProof.aiMetadata.warnings
```

## 5. Hard Boundary

Agent 2 may orchestrate and explain.

Agent 2 must not:

- OCR documents;
- parse PDFs/XLSX/CSV;
- normalize names/references/dates/money;
- use LLM output for FX math;
- use LLM output for scoring;
- use LLM output for final status classification;
- send real emails;
- mark invoices paid in an accounting system.

All money decisions must come from deterministic Reconciliation Tools.

## 6. First Implementation Milestone

Do this first:

```text
NormalizedInputBatch fixture
-> generateBankAnchoredCandidates()
-> scoreCandidate()
-> classifyMatch()
-> OrchestratorOutput
```

Minimum clean-case acceptance:

```text
invoice paymentReference.normalized = INV1001
proof reference.normalized          = INV1001
bank normalizedReference            = INV1001
invoice amount                      = USD 10000
proof paidAmount                    = MYR 42500
proof FX                            = 1 USD = 4.2500 MYR
bank amount                         = MYR 42500
status                              = AUTO_MATCHED
```

## 7. Candidate Generation

Use bank-anchored matching:

```text
for each inbound bank credit:
  find plausible payment proofs
  find plausible expected payments
  build candidate triples
```

Skip:

- bank debits;
- payment proofs with failed/cancelled status, except to create review/discrepancy output;
- expected payments already closed/matched, unless explicitly testing duplicates.

Candidate should include:

```ts
type MatchCandidate = {
  candidateId: string;
  bankTransactionId: string;
  proofId?: string;
  expectedPaymentId?: string;
  signals: CandidateSignal[];
};
```

Strong signals:

- exact normalized reference match;
- proof target/paid amount equals bank credit amount;
- proof FX rate explains bank amount;
- bank description contains invoice reference.

Medium signals:

- payer/customer normalized name match;
- payment date near bank date;
- invoice due date plausible;
- amount plausible after FX conversion;
- partial reference token overlap.

## 8. FX Scenario Algorithm

Do not ask users to upload FX rates for the MVP.

For each candidate, evaluate:

```text
1. proof-extracted FX rate, if available
2. invoice issue-date FX
3. proof payment-date FX
4. bank booking-date FX
5. fallback fixture FX
```

For each scenario:

```text
expectedLocalAmount = foreignAmount * fxRate
residualAmount = bankCreditAmount - expectedLocalAmount
residualPercent = abs(residualAmount) / expectedLocalAmount
```

Pick the scenario with the lowest residual.

Correct explanation:

```text
Payment-date FX best explains the received amount.
```

Forbidden explanation:

```text
The bank definitely used this FX rate.
```

## 9. Classification Rules

Use deterministic `classifyMatch()`.

Suggested statuses:

```ts
"AUTO_MATCHED" | "LIKELY_MATCHED" | "NEEDS_REVIEW" | "UNMATCHED"
```

Residual policy:

| Residual | Route |
|---:|---|
| <= 0.5% | can auto-match if other signals are strong |
| > 0.5% and <= 2% | likely matched or review |
| > 2% and <= 5% | needs review |
| > 5% | unmatched or high-severity review |

Hard review overrides:

- proof confidence below `0.8` on critical fields;
- top two candidates within `10` score points;
- missing reference and weak name match;
- proof status not settled/completed;
- possible partial payment;
- possible overpayment;
- possible batch payment;
- duplicate proof transaction ID;
- residual above `2%`;
- no usable FX scenario.

High score must not override hard review flags.

## 10. Output Contract

Return:

```ts
type OrchestratorOutput = {
  schemaVersion: "1.0.0";
  batchId: string;
  results: ReconciliationResult[];
  timeline: AgentTimelineEvent[];
  artifactRequests: ArtifactRequest[];
  humanReviewRequests: HumanReviewRequest[];
  summary: {
    autoMatched: number;
    likelyMatched: number;
    needsReview: number;
    unmatched: number;
  };
};
```

Each result:

```ts
type ReconciliationResult = {
  caseId: string;
  status: "AUTO_MATCHED" | "LIKELY_MATCHED" | "NEEDS_REVIEW" | "UNMATCHED";
  selectedCandidateId?: string;
  expectedPaymentId?: string;
  proofId?: string;
  bankTransactionId?: string;
  score: number;
  reasonCodes: string[];
  hardReviewFlags: string[];
  explanation: string;
};
```

## 11. Timeline Requirement

Agent 2 must emit a timeline. This is demo-critical.

Each important step should show:

```text
Agent selected action
Tool called
Tool result observed
Reasoning after observation
Classification or routing decision
```

Example:

```text
Agent 2 selected calculateFxScenarios for CAND-001.
Tool result: proof FX 4.2500 explains bank credit with 0.00% residual.
Agent 2 continues to scoreCandidate because reference, party, date, and amount are aligned.
```

## 12. Tests Required Before UI Integration

Required tests:

- clean exact-reference case returns `AUTO_MATCHED`;
- FX date variance picks the lowest-residual scenario;
- short payment over 2% returns `NEEDS_REVIEW`;
- no candidate returns `UNMATCHED`;
- competing candidates create `HumanReviewRequest`;
- failed/pending proof does not auto-match;
- timeline contains tool calls and observed results.

Use:

```bash
npm test
npm run build
```

If `npm run typecheck` fails because `tsc` is not on PATH on this Windows machine, use:

```powershell
& 'C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\typescript\bin\tsc --noEmit
```

## 13. What Not To Build Yet

Do not build these in the first Agent 2 pass:

- LangChain/LangGraph/Google ADK;
- real email sending;
- real bank API;
- accounting-system posting;
- arbitrary many-invoice allocation;
- production queue/state persistence;
- full admin dashboard redesign.

Start with deterministic tools and a visible orchestrator timeline. Anything else is scope creep.
