# Global Treasury Agent: Current Findings And Plan

Date: 2026-05-23  
Working title: **ReconPilot**  
Alternate name considered: **ClearMatch Treasury**

## 1. Executive Summary

We are building a hackathon MVP for the **Global Treasury Agent** challenge.

The strongest product direction is:

> **ReconPilot is an exception-first, agentic FX reconciliation assistant for SMEs. It reads messy payment proofs, invoice files, FX rates, and local bank statements, then explains why a foreign-currency payment does or does not match a local bank deposit.**

This should not be pitched as generic "AI reconciliation software." That category already exists across enterprise reconciliation platforms, SME accounting tools, payment processors, and document AI vendors.

The defensible hackathon wedge is narrower:

- SME-focused
- document-first
- no ERP required for the MVP
- cross-border incoming payment reconciliation
- date-aware FX reasoning
- evidence-backed exception explanation
- human approval and audit trail
- agentic workflow with LLM tool use

## 2. Product Positioning

### Bad Positioning

Avoid:

- "AI-powered bank reconciliation"
- "Automated invoice matching"
- "A smarter Xero"
- "We replace accountants"
- "A full treasury management platform"
- "Autonomous accounting"

These are too broad, already crowded, or unsafe for finance workflows.

### Strong Positioning

Use:

> **An evidence-first FX reconciliation agent for SMEs that turns invoices, payment proofs, FX rates, and local bank statements into explainable matches and review-ready exceptions.**

### One-Sentence Pitch

> ReconPilot helps exporting SMEs reconcile foreign-currency invoices to local bank receipts with explicit FX math, source evidence, and human review controls.

### Demo-Friendly Pitch

> An SME invoices a customer in USD but receives RM in a Malaysian bank account. ReconPilot's agent reads the invoice, payment proof, FX table, and bank CSV, then explains whether the payment matches, why the amount differs, and what needs human review.

## 3. Target Customer

### Primary ICP

**Small international service/export SME finance admin**

Profile:

- 5-100 employees
- receives overseas customer payments
- invoices in USD, SGD, EUR, AUD, or GBP
- receives local bank deposits in MYR
- uses Excel, bank portal exports, PDFs, email, or WhatsApp payment proofs
- may use Xero, QuickBooks, or Zoho, but still reconciles messy evidence manually
- no enterprise ERP or dedicated treasury team

Examples:

- digital agencies serving foreign clients
- training or education providers with overseas customers
- small exporters
- event/conference teams
- ecommerce sellers handling off-platform transfers
- B2B service firms

### Secondary ICP

**Bookkeepers and small accounting firms serving multiple SME clients**

Why attractive:

- repeated pain across clients
- strong need for audit trail
- potential channel for distribution

Risk:

- may require accounting integrations and stronger data controls sooner

## 4. Problem Being Solved

SMEs often receive payments across currencies. Example:

```text
Invoice: INV-1001, USD 100
Local bank received: RM 423.80
```

The finance/admin person must decide:

- Is this the right payment?
- Which invoice does it settle?
- Which FX date/rate explains the local amount?
- Was a bank fee deducted?
- Is it a partial payment?
- Is the reference missing, wrong, or typoed?
- Does the sender name match the customer?
- Should the case be approved, rejected, or reviewed?

The real pain is not just matching numbers. It is explaining mismatches with enough evidence for month-end close.

## 5. Market Findings

### Market Reality

This market already exists in pieces:

| Category | Examples | What They Already Do | Our Gap |
|---|---|---|---|
| Enterprise reconciliation platforms | Ledge, BlackLine, HighRadius, Esker, Trintech, AutoRek, Simetrik | High-volume reconciliation, exception workflows, ERP/bank integrations, audit trails | Too heavy for SMEs; our wedge is file-first and SME-simple |
| SME accounting tools | Xero, QuickBooks, Zoho Books, Odoo | Bank feeds, suggested matches, bank rules, multicurrency accounting | They assume data is already inside the accounting system |
| Payment processors | Stripe, PayPal, Wise, Synder, A2X | Payout reconciliation, settlement currency, fees, platform-specific reports | They only explain their own rails |
| Document AI/OCR | Nanonets, Veryfi, Docsumo, Dext, Google Document AI, Azure Document Intelligence | Extract invoices, receipts, bank statements, remittance data | Extraction is not enough; our wedge is FX reasoning and exception explanation |

### Main Competitor Insight

Do not compete on:

- generic reconciliation
- OCR extraction
- enterprise automation rate
- accounting-system replacement
- bank/payment integrations

Compete on:

- messy SME files
- no-ERP upload workflow
- date-aware FX reasoning
- payment proof to local bank receipt matching
- exception-first review
- audit-ready evidence timeline

## 6. Differentiation

The product becomes differentiated if it visibly includes:

1. **Document-first, no-ERP workflow**
   - invoice CSV/Excel/PDF
   - payment proof image/PDF/text
   - local bank statement CSV
   - FX rate table

2. **Date-aware FX reasoning**
   - invoice-date FX
   - payment-date FX
   - bank-received-date FX
   - best explanation for received local amount

3. **Exception-first output**
   - exact match
   - likely match
   - missing reference
   - bank fee / short payment
   - partial payment
   - grouped payment
   - duplicate proof
   - ambiguous candidate

4. **Evidence timeline**
   - source document
   - extracted fields
   - FX rate source
   - expected local amount
   - bank received amount
   - variance
   - reason codes
   - human decision

5. **Human approval**
   - AI suggests
   - deterministic tools calculate
   - human approves/rejects/reviews

## 7. Product Scope

### Must Build For Hackathon

- One-click demo data load
- Invoice list import or fixture
- Bank statement import or fixture
- Payment proof extraction or fixture
- FX rate table by date
- Agentic extraction to structured JSON
- Deterministic matching engine
- Date-aware FX comparison
- Variance and fee calculation
- Exception classifier
- Human review dashboard
- Evidence drawer / timeline
- AI-generated explanation
- Audit/export report
- Fallback if Chutes/API fails

### Should Build

- Chutes-powered extraction/explanation
- Mock AI provider fallback
- Multi-model router by task
- Editable extracted-field preview
- Confidence and reason codes
- Duplicate proof detection by file hash
- Clear review statuses

### Cut For Hackathon

- Real bank integration
- Real accounting integration
- Live FX API dependency
- Full OCR robustness
- Journal entries
- Tax treatment automation
- Fraud detection claims
- ERP posting
- All-currency support
- Web3 wallet mechanics

## 8. Agentic Architecture

We should make the product feel agentic.

Core framing:

> **The LLM is the brain. Tools are the hands. The evidence store is memory. Human review is the safety gate.**

The LLM should orchestrate tool use, but deterministic tools must own money math and final classification rules.

### Agent Loop

```text
User starts reconciliation
-> Agent inspects invoice, bank statement, proof, and FX table
-> Agent classifies documents
-> Agent calls extraction tools
-> Agent normalizes fields into structured JSON
-> Agent calls FX and matching tools
-> Agent checks contradictions
-> Agent generates explanation and recommended action
-> If safe: auto-match eligible
-> If uncertain: route to human review
```

### Tool Set

| Tool | Purpose |
|---|---|
| `classify_document` | Identify invoice, bank statement, payment proof, remittance advice |
| `extract_invoice` | Extract invoice fields |
| `extract_bank_statement` | Extract bank transaction rows |
| `extract_payment_proof` | Extract amount, currency, payer, beneficiary, reference, FX rate, fees |
| `normalize_to_schema` | Convert messy text into canonical JSON |
| `lookup_fx_rate` | Select transaction-date FX rate using source hierarchy |
| `calculate_variance` | Compute gross local, fee, net local, delta |
| `find_candidate_matches` | Generate ranked invoice/transaction/proof candidates |
| `score_match` | Compute deterministic score and reason codes |
| `check_contradictions` | Detect duplicate proof, wrong beneficiary, conflicting FX, etc. |
| `create_review_question` | Produce the human question needed to resolve uncertainty |
| `generate_report` | Produce audit/export summary |

### What The LLM Must Not Do

- invent FX rates
- perform final money math without tools
- auto-match if contradictions exist
- claim fraud
- auto-post accounting entries
- hide evidence behind a black-box confidence score

## 9. Agentic Extraction

The teammate idea is important: extraction should not be "OCR only."

Better pipeline:

```text
Document/image/text
-> OCR or vision model
-> Extraction agent
-> Field validation tools
-> Structured JSON
-> Human correction if needed
-> Reconciliation agent
```

The extraction agent should:

1. classify the document
2. extract fields
3. validate plausibility
4. organize output into JSON
5. attach confidence per field
6. preserve evidence snippets
7. flag uncertainty

Example JSON:

```json
{
  "document_type": "payment_proof",
  "fields": {
    "amount": 42.5,
    "currency": "MYR",
    "payer": "Acme Components",
    "beneficiary": "Demo Sdn Bhd",
    "reference": "INV-1042",
    "fx_rate": 4.25,
    "fee_amount": 0
  },
  "confidence": {
    "amount": 0.98,
    "currency": 0.96,
    "reference": 0.91
  },
  "warnings": [],
  "raw_evidence": [
    "Paid amount: RM42.50",
    "Reference: INV-1042"
  ]
}
```

This is a strong "AI brain" moment for the demo.

## 10. FX Policy

Use a **transaction-date FX table seeded with fixed demo rates**.

Do not depend on live FX during the demo.

### FX Source Hierarchy

1. Explicit proof or bank/payment-provider rate
2. Internal transaction-date FX table
3. Public reference rate as fallback
4. Manual reviewer-entered rate

### Demo Rates

```text
USD -> MYR = 4.25
SGD -> MYR = 3.50
EUR -> MYR = 5.00
GBP -> MYR = 5.85
```

### Variance Rules

```text
gross_local = round(invoice_foreign_amount * applied_fx_rate)
net_local = gross_local - local_fees
delta = bank_statement_credit - net_local
```

The UI must show:

- selected FX rate
- FX source
- date used
- gross local amount
- fee
- net local amount
- delta

## 11. Matching Policy

### Score Formula

```text
score =
  amount_similarity * 0.40
+ reference_similarity * 0.25
+ date_proximity * 0.20
+ name_similarity * 0.15
```

### Statuses

```text
score >= 90 and no hard contradictions -> auto_match_eligible
score >= 85 and variance within tolerance -> matched
score >= 60 -> needs_review
converted amount received < invoice amount by meaningful amount -> partial
score < 60 -> unmatched
```

### Hard Contradictions

Always force review:

- duplicate proof hash
- wrong beneficiary
- payer/customer mismatch with no explanation
- two invoices with near-identical scores
- unexplained variance above tolerance
- missing reference on material transaction
- reversal or chargeback
- conflicting FX sources

## 12. Payment Scenarios

### Must-Demo Scenarios

| Scenario | Product Response | Decision |
|---|---|---|
| Clean FX match | Show FX math and evidence | Auto-match eligible |
| Bank fee deducted | Explain fee variance | Auto-match if within tolerance, otherwise review |
| Partial payment | Calculate remaining balance | Review |
| Missing/typoed reference | Fuzzy match and explanation | Review unless evidence is very strong |
| Multiple candidate matches | Show ranked candidates | Review |
| Duplicate proof | Hash proof and block duplicate approval | Hard review stop |
| OCR extraction error | Show editable extraction preview | Review |

### Other Important Scenarios

- underpayment
- overpayment
- grouped payment
- split payment
- duplicate bank receipt
- third-party payer
- timing gap
- weekend/public holiday delay
- wrong currency
- separate bank fee row
- withholding tax
- credit note applied
- early payment discount
- unmatched cash
- unmatched invoice
- advance payment
- reversal/chargeback
- privacy-sensitive proof

## 13. Multi-Model / Chutes Strategy

Use Chutes or sponsor-compatible inference as the LLM layer.

The architecture should support multi-model routing:

| Task | Model Type |
|---|---|
| extraction normalization | fast/cheap model |
| payment proof interpretation | vision/document model if available |
| ambiguous case explanation | stronger reasoning model |
| report summary | fast/cheap model |
| demo fallback | mock/cached provider |

Suggested interface:

```ts
type AiTask = "extract" | "normalize" | "explain" | "triage" | "summarize";

type AiRouter = {
  run<TInput, TOutput>(task: AiTask, input: TInput): Promise<TOutput>;
};
```

Suggested pitch:

> ReconPilot uses sponsor-compatible decentralized inference for document understanding and explanation, while deterministic reconciliation tools handle FX math, matching, confidence, and audit state.

Do not let the live LLM/API be the single point of failure. Build mock/cached fallback first.

## 14. MVP Build Plan

### Build Order

1. Demo fixtures
2. Canonical schema
3. Agentic extraction JSON format
4. Deterministic matching engine
5. FX date comparison
6. Exception classifier
7. Reasoning timeline
8. Human review dashboard
9. Mock LLM explanation
10. Chutes provider integration
11. Upload polish
12. Audit export

### Suggested Files Once App Starts

```text
src/lib/treasury/types.ts
src/lib/treasury/sample-data.ts
src/lib/treasury/fx.ts
src/lib/treasury/similarity.ts
src/lib/treasury/scoring.ts
src/lib/treasury/reconcile.ts
src/lib/agents/extraction-agent.ts
src/lib/agents/reconciliation-agent.ts
src/lib/ai/provider.ts
src/lib/ai/mock-provider.ts
src/lib/ai/chutes-provider.ts
src/components/treasury/InputPanel.tsx
src/components/treasury/ExtractionPreview.tsx
src/components/treasury/ReconciliationBoard.tsx
src/components/treasury/EvidenceTimeline.tsx
src/components/treasury/ReportPreview.tsx
```

## 15. Demo Story

### Opening

> SMEs invoice customers in USD but receive money in MYR. The amount rarely matches perfectly because of FX date, bank fees, timing, and missing references.

### Demo Flow

1. Load demo invoice list, bank statement, payment proof, and FX table.
2. Agent classifies and extracts documents into structured JSON.
3. Agent calls FX/matching tools.
4. Dashboard shows:
   - exact match
   - fee variance
   - partial payment
   - missing reference
   - duplicate proof hard stop
5. Open evidence timeline.
6. Human approves/rejects/marks review.
7. Export audit report.

### 90-Second Arc

```text
0-15s: Show USD invoice, RM bank deposit, payment proof.
15-30s: Agent extracts structured JSON.
30-50s: Agent runs tools and classifies cases.
50-70s: Open exception with FX/date/fee reasoning.
70-85s: Human approval and audit timeline.
85-90s: Close with business value.
```

### Closing Line

> ReconPilot does not replace accounting software. It is the investigation layer before posting: payment proof, FX/date reasoning, local bank match, human approval, and audit trail.

## 16. Market Validation Plan

### Experiment 1: Manual vs ReconPilot Time Test

Give users 10 synthetic cases and compare manual spreadsheet reconciliation vs ReconPilot output.

Success:

- 50% faster
- 80%+ correct decisions
- users can explain the result

### Experiment 2: Explanation Trust Test

Compare:

- A: match table + confidence
- B: match table + FX/date/evidence timeline

Success:

- 70% prefer B
- users cite trust reasons like FX date, fee, source evidence

### Experiment 3: Demo Fixture Accuracy

Create deterministic tests for:

- exact match
- FX date mismatch
- missing reference
- fee/short payment
- partial payment
- combined payment
- duplicate proof

Success:

- 100% deterministic classification pass rate
- LLM only explains after classification

## 17. Kill Criteria

Pivot or cut scope if:

- deterministic matching is not working after the first build session
- demo depends on live OCR/API with no fallback
- output is just a confidence score
- team cannot explain the problem in one sentence
- UI hides the evidence trail
- product starts becoming a full accounting system

## 18. Final Recommendation

Build **ReconPilot** if the team commits to the wedge:

> Exception-first, date-aware FX reconciliation for SME payment proofs.

The product should be:

- agentic
- evidence-first
- deterministic at the money layer
- human-reviewed
- narrow enough to demo in 4 minutes

The winning demo is not broad automation. It is one small, credible workflow where the agent uses tools to explain why a foreign payment does or does not match a local bank receipt.


