# ReconPilot Final Technical Blueprint

Date: 2026-05-23  
Status: Frozen plan for AI Marathon 2026  
Decision: Build with **2 real agents + 1 artifact generation module**

## 1. Final Product Definition

ReconPilot is a file-first FX reconciliation workflow agent for SMEs. It matches foreign payment proofs and expected payment records against local bank deposits, explains FX/date/fee discrepancies, auto-matches clean cases, escalates risky cases, and generates reconciliation or discrepancy artifacts.

One-line pitch:

> ReconPilot auto-matches clean cross-border payments and escalates risky FX/payment discrepancies with evidence before SME finance teams close their books.

Do **not** pitch this as a generic "AI reconciliation platform." That is crowded and weak.

## 2. Problem Statement

SMEs receive local-currency bank deposits that do not obviously match foreign-currency invoices or payment proofs.

Example:

```text
Expected payment: USD 10
Bank received: RM 42.50
```

Today, a finance/admin user manually checks:

- payment proof amount and currency;
- expected invoice/payment amount;
- payment date;
- bank posting date;
- FX reference rate;
- possible bank fee or FX spread;
- sender/reference similarity;
- whether the payment should be marked matched, reviewed, or unresolved.

ReconPilot turns that manual workflow into a tool-using reconciliation agent.

## 3. What We Are Solving

We solve the reconciliation decision:

```text
Given payment proofs, expected payment records, and local bank statements,
which payments match, which are risky, and what evidence explains the decision?
```

We are **not** building:

- a full accounting system;
- invoice management;
- ERP integration;
- live bank integration;
- tax handling;
- journal entries;
- treasury forecasting;
- fraud platform;
- blockchain/Web3 wallet flow.

## 4. Business Value

ReconPilot creates value by reducing manual reconciliation effort, reducing error risk, and improving month-end confidence.

### User Value

- **Faster month-end close:** finance/admin users spend less time manually comparing proofs, invoices, FX rates, and bank rows.
- **Fewer matching mistakes:** deterministic matching and hard review rules reduce accidental wrong matches.
- **Better audit readiness:** every match has evidence, FX calculation, confidence, and human action logged.
- **Lower cognitive load:** users see a clear status and reason instead of hunting across spreadsheets and receipts.
- **Safer AI use:** clean cases can auto-match, but risky money decisions are escalated.

### Business Metrics To Claim In Demo

Use conservative, defensible claims:

```text
Manual process: 10-20 minutes per messy cross-border payment
ReconPilot demo flow: under 30 seconds per batch case
Target benefit: reduce review time, not eliminate accountants
```

### Buyer / User

Primary user:

- SME finance/admin staff;
- bookkeepers;
- small accounting teams handling foreign customer payments.

Best segment:

- SMEs receiving USD/SGD/EUR payments into MYR bank accounts;
- digital agencies, training providers, small exporters, event operators, ecommerce sellers.

### Differentiation

Existing accounting tools reconcile inside their own systems. ReconPilot sits before accounting entry:

```text
messy proof + expected payment file + local bank statement
-> explainable reconciliation decision
-> report / discrepancy artifact
```

## 5. Inputs

Required user inputs:

```text
1. Payment proofs: image / PDF / text
2. Local bank statement: CSV / XLSX
3. Expected payment records: invoice CSV / XLSX, receivables export, or payment schedule
```

Internal system inputs:

```text
1. FX reference rate tool with local fallback
2. Matching rules
3. Fee/tolerance configuration
```

Important wording: invoices are **expected payment records**, not full invoice management.

## 6. Outputs

Primary outputs:

- reconciliation dashboard;
- side-by-side evidence view: `Expected Payment | Payment Proof | Bank Deposit`;
- FX reasoning panel;
- match signal breakdown;
- agent activity timeline;
- reconciliation report for clean/approved matches;
- discrepancy summary for unresolved cases;
- mock email notification draft for user follow-up;
- clarification request when the agent cannot choose safely between plausible matches.

Status model:

```text
AUTO_MATCHED    = strong evidence, no conflict, reversible
LIKELY_MATCHED  = strong but not perfect, human approval recommended
NEEDS_REVIEW    = missing/weak/conflicting signal, human approval required
UNMATCHED       = no plausible match, discrepancy artifact generated
```

Artifact routing:

```text
AUTO_MATCHED    -> reconciliation report + audit timeline
LIKELY_MATCHED  -> reconciliation report draft + human approval prompt
NEEDS_REVIEW    -> discrepancy summary + clarification request / approval prompt
UNMATCHED       -> discrepancy summary + mock email notification draft
```

The system does **not** generate every artifact for every case. Artifacts depend on classification.

## 7. Real-World Cases

MVP hero cases:

1. **Clean auto-match**
   - USD10 proof/expected payment maps to RM42.50 bank deposit.
   - Reference, date, amount, and sender align.

2. **FX date variance**
   - Invoice-date FX does not explain deposit.
   - Payment-date or bank-date reference FX better explains the amount.
   - Output says likely FX date/spread variance, not exact truth.

3. **Missing reference / fuzzy sender**
   - Bank row has no invoice reference.
   - System uses amount, date, and sender similarity.
   - Status: likely matched or needs review.

4. **Short payment / possible fee**
   - Expected local amount is higher than bank deposit.
   - System classifies as possible bank fee, FX spread, partial payment, or short payment.
   - Status: needs review.

Optional table-only case:

5. **Unmatched proof**
   - Payment proof exists but no plausible bank deposit is found.
   - Artifact Generator creates discrepancy summary/mock email.

Cut from live demo unless already rock solid:

- combined payment;
- duplicate payment;
- installment schedule;
- withholding tax;
- credit notes;
- refunds/chargebacks.

## 8. Hidden Risks We Must Handle Honestly

1. **FX is not exact**
   - Banks use settlement rates, spreads, internal conversion, and posting delays.
   - We use date-aware reference FX to explain likely variance, not guarantee exact bank rate.

2. **Fees are not certain**
   - We classify possible bank fee/spread, not confirmed fee, unless proof explicitly shows fees.

3. **Payment proof is not settlement**
   - Proof shows customer intent/payment initiation.
   - Bank statement shows actual receipt.
   - Expected payment record shows obligation.

4. **OCR can misread money**
   - Extracted fields need confidence and manual correction.

5. **LLM must not make money decisions**
   - Deterministic code does FX math, scoring, and classification.
   - AI extracts, orchestrates, explains, and generates artifacts.

6. **Human review is a strength**
   - Pitch as: auto-match clean cases, escalate risky exceptions.

## 9. What Is An Agent In This Project?

An agent is not just an LLM call.

A real agent has:

```text
goal -> observes state -> chooses tool/action -> observes result -> decides next step -> produces outcome
```

Therefore:

- image-to-JSON extraction alone is not necessarily an agent;
- JSON-to-report prose generation is not an agent;
- a workflow controller that chooses tools and branches by observed results is an agent.

Final architecture uses:

```text
2 real agents + 1 artifact generation module
```

## 10. Agentic Architecture

### Agent 1: Extraction Agent

This is a real agent because it chooses extraction strategy.

Responsibilities:

- inspect uploaded payment proof type;
- choose extraction path:
  - `ocr_image()`;
  - `parse_pdf_text()`;
  - `parse_pdf_tables()`;
  - `request_manual_correction()`;
- produce structured JSON with confidence;
- flag ambiguous or low-confidence fields.

Decision examples:

```text
If scanned image -> call OCR/image vision.
If text PDF -> parse embedded text first.
If table PDF -> parse table structure.
If amount/reference is ambiguous -> request manual correction.
```

Agency test:

> The demo batch must cause the Extraction Agent to call different tools for different proof types. If every proof only calls `ocr_image()`, the agentic routing is invisible.

### Agent 2: Reconciliation Orchestrator Agent

This is the main agent.

Responsibilities:

- inspect extracted/parsed records;
- call FX scenario tool;
- call fee/tolerance tool;
- call candidate matching engine;
- call scoring/classification tool;
- decide workflow path:
  - auto-match;
  - likely matched;
  - needs review;
  - unmatched;
- request clarification when competing candidates or ambiguous extracted fields make the decision unsafe;
- trigger artifact generation.

Decision examples:

```text
If reference exact + amount variance <= 0.5% + no competing candidate -> AUTO_MATCHED.
If FX date scenario explains variance but amount is not exact -> LIKELY_MATCHED.
If variance > 2% or reference missing -> NEEDS_REVIEW.
If no plausible bank row -> UNMATCHED and trigger discrepancy email.
If top two candidates are close -> ask human to clarify before approval.
```

### Module: Artifact Generator

This is **not** called an agent. It is a generation module.

Responsibilities:

- generate reconciliation report;
- generate discrepancy summary;
- generate mock email notification;
- summarize audit timeline.

Why not an agent:

- it does not need open-ended tool choice for the MVP;
- it transforms verified match results into artifacts.

This honesty is defensible in judging Q&A.

## 11. Tools

Deterministic tools:

```text
parse_expected_payments(file)
parse_bank_statement(file)
ocr_image(file)
parse_pdf_text(file)
parse_pdf_tables(file)
request_manual_correction(fields)
normalize_reference(value)
normalize_party_name(value)
normalize_date(value)
fetch_fx_rate(from, to, date)
calculate_fx_scenarios(expected_record, proof, bank_txn)
evaluate_amount_tolerance(expected, received)
evaluate_fee_hypothesis(expected, received)
generate_match_candidates(records)
score_candidate(candidate)
classify_match(score, signals)
detect_competing_candidates(candidates)
request_clarification(question, candidate_options)
write_audit_event(event)
generate_report_json(result)
generate_mock_email(discrepancy)
```

Clarification tool distinction:

```text
request_manual_correction(fields)
  Field-level correction from the Extraction Agent.
  Example: "The receipt amount looks like 4Z0.00; please confirm."

request_clarification(question, candidate_options)
  Candidate-level clarification from the Orchestrator.
  Example: "Two bank rows could match this proof. Which one should be used?"
```

FX tool rule:

- try live/reference lookup only if stable;
- always have local fallback;
- never make demo depend on network.

Fee tool rule:

- use tolerance/hypothesis only;
- output "possible fee/spread," not "confirmed fee."

## 12. Data Model

Expected payment record:

```json
{
  "expected_id": "INV-1001",
  "customer_name": "ABC Singapore Pte Ltd",
  "expected_date": "2026-05-18",
  "due_date": "2026-05-25",
  "currency": "USD",
  "amount": 100.0,
  "normalized_reference": "INV1001",
  "status": "OPEN"
}
```

Payment proof:

```json
{
  "proof_id": "PROOF-001",
  "source_file": "proof_001.png",
  "payer_name": "ABC Singapore",
  "payment_date": "2026-05-20",
  "paid_currency": "USD",
  "paid_amount": 100.0,
  "reference": "INV1001",
  "normalized_reference": "INV1001",
  "extraction_confidence": {
    "payer_name": 0.91,
    "payment_date": 0.88,
    "paid_amount": 0.97,
    "reference": 0.86
  }
}
```

Bank transaction:

```json
{
  "bank_txn_id": "BANK-001",
  "bank_date": "2026-05-21",
  "description": "ABC SG TRANSFER INV1001",
  "currency": "MYR",
  "credit_amount": 423.80,
  "reference": "INV1001",
  "normalized_reference": "INV1001"
}
```

FX rate:

```json
{
  "date": "2026-05-20",
  "base_currency": "USD",
  "quote_currency": "MYR",
  "rate": 4.25,
  "source": "demo_fx_table",
  "is_fallback": true
}
```

## 13. Extraction And Matching Process

Pipeline:

```text
Upload/load files
-> parse structured files
-> Extraction Agent extracts payment proof fields
-> normalize references/names/dates/currencies
-> generate candidates
-> compute FX date scenarios
-> evaluate tolerance/fee hypotheses
-> score candidates
-> classify status
-> generate report, discrepancy artifact, or clarification request
-> human review when needed
```

## 14. Amount Tolerance Specification

This must be explicit because it controls the matching engine.

| Amount Variance | Amount Score | Meaning | Status Impact |
|---|---:|---|---|
| `<= 0.5%` | 30/30 | Strong amount match | Can auto-match if other signals are strong |
| `> 0.5% and <= 2%` | 20/30 | Small variance, possible FX spread/fee | Likely matched or review depending on other signals |
| `> 2% and <= 5%` | 10/30 | Significant variance | Needs review |
| `> 5%` | 0/30 | Weak amount match | Needs review or unmatched |

Hard override:

```text
variance > 2% => human review required, regardless of total score
```

This prevents inferred fees from silently auto-approving risky money decisions.

## 15. FX Date Selection Algorithm

The LLM does not choose the FX date. Code does.

For each candidate match:

```text
1. Get invoice/expected payment date.
2. Get payment proof date.
3. Get bank posting date.
4. Fetch/reference FX rate for each date.
5. Calculate expected local amount for each date.
6. Compare each expected local amount to actual bank deposit.
7. Pick the date scenario with the smallest absolute variance.
8. Report the best scenario and show all alternatives.
```

Example:

```text
Expected payment: USD100
Invoice-date FX 4.20 -> RM420.00
Payment-date FX 4.25 -> RM425.00
Bank-date FX 4.24 -> RM424.00
Bank received: RM423.80

Best reference explanation: bank-date FX
Variance: RM0.20
```

Wording:

```text
"Best reference explanation"
```

Not:

```text
"Confirmed bank FX rate"
```

## 16. Scoring Model

| Signal | Max Points | Rule |
|---|---:|---|
| Reference match | 35 | exact normalized reference = 35, partial = 20 |
| Amount/FX match | 30 | use tolerance table above |
| Date proximity | 15 | 0-1 days = 15, 2-3 days = 10, 4-7 days = 5 |
| Name similarity | 15 | fuzzy payer/customer/bank description |
| Extraction confidence | 5 | proof fields high confidence |

Classification:

```text
95-100 = AUTO_MATCHED
80-94  = LIKELY_MATCHED
60-79  = NEEDS_REVIEW
<60    = UNMATCHED
```

Competing candidate rule:

```text
If top candidate score - second candidate score < 10 points,
flag as NEEDS_REVIEW due to competing candidates.
```

Hard overrides:

```text
OCR confidence < 0.8 -> NEEDS_REVIEW
variance > 2% -> NEEDS_REVIEW
multiple plausible bank rows -> NEEDS_REVIEW
reference exact but amount wildly off -> NEEDS_REVIEW
no FX rate for relevant dates -> NEEDS_REVIEW
payment proof exists but no bank deposit -> UNMATCHED
```

Clarification trigger:

```text
If two candidates are close enough that the score gap is < 10 points,
the Orchestrator does not force a match. It asks the user to choose or provide more proof.
```

## 17. Agent Activity Timeline

This is the central UI proof of agentic behavior.

Every tool call and major decision writes an audit/timeline event.

Timeline event schema:

```json
{
  "step": 4,
  "timestamp": "2026-05-23T12:30:00+08:00",
  "actor": "Reconciliation Orchestrator",
  "action": "fetch_fx_rate",
  "input": {
    "from": "USD",
    "to": "MYR",
    "date": "2026-05-20"
  },
  "result": {
    "rate": 4.25,
    "source": "fallback_fx_table"
  },
  "reasoning": "Payment proof date is a relevant settlement-date candidate.",
  "decision": "Continue to FX scenario comparison"
}
```

Visual treatment:

```text
[12:30:01] Extraction Agent
Called ocr_image(proof_001.png)
Extracted USD100, ref INV1001, confidence 94%

[12:30:03] Reconciliation Orchestrator
Called fetch_fx_rate(USD, MYR, 2026-05-20)
Returned 4.25 from fallback table

[12:30:04] Reconciliation Orchestrator
Calculated expected RM425.00 vs bank RM423.80
Variance 0.28%

[12:30:05] Reconciliation Orchestrator
Decision: LIKELY_MATCHED
Reason: reference exact, amount within tolerance, date close
```

This panel must be visible during the demo.

## 18. Deterministic Code vs AI Responsibilities

AI responsibilities:

- route extraction strategy for payment proofs;
- extract messy proof fields;
- interpret ambiguous text;
- orchestrate tool calls through the Reconciliation Orchestrator;
- ask targeted clarification questions when deterministic evidence is insufficient;
- explain reasoning in plain language;
- generate reconciliation reports;
- generate discrepancy summaries/mock emails.

Code responsibilities:

- parse CSV/XLSX;
- normalize references/dates/currencies;
- perform FX math;
- select best FX date scenario;
- evaluate amount tolerance;
- evaluate fee/spread hypotheses;
- calculate amount variance;
- generate candidates;
- score matches;
- classify status;
- detect competing candidates;
- write audit logs.

Non-negotiable rule:

> The LLM does not perform final money math or final match classification.

## 19. Human Review Rules

Auto-match allowed only when:

```text
reference exact
amount variance <= 0.5%
date close
sender/customer similar
all critical OCR/extraction confidence >= 0.85
no competing candidate
expected record still open
```

Human review required when:

- confidence below 95;
- missing reference;
- weak/fuzzy sender;
- inferred fee/spread;
- variance greater than 2%;
- multiple possible matches;
- any critical OCR/extraction confidence < 0.8;
- any critical OCR/extraction confidence between 0.8 and 0.85 should remain visible as a warning flag;
- no FX rate available;
- bank transaction date outside expected window;
- proof exists but bank deposit missing;
- top two candidate matches have a score gap below 10 points;
- final state affects money but evidence is incomplete.

Pitch wording:

> ReconPilot auto-matches clean cases and escalates risky discrepancies with evidence.

## 20. Mock Notification Format

Use email because it is familiar and easy to judge. This is a **draft shown inside the product**, not a real email sent by the MVP.

Example:

```text
To: finance@company.com
Subject: Discrepancy found for INV-1003

ReconPilot could not safely reconcile this payment.

Expected: RM850.00
Received: RM812.40
Variance: RM37.60

Possible explanations:
- bank/intermediary fee
- FX spread
- partial payment
- short payment

Recommended action:
Request confirmation or fee breakdown from the customer before closing this invoice.
```

UI behavior:

```text
Generated Email Draft
[Copy Email] [Mark as Sent] [Discard]
```

No real email sending is needed for the MVP. The point is to show the agent can produce an actionable follow-up artifact.

## 21. Cost Per Reconciliation Estimate

Use a rough, defensible estimate for Q&A:

```text
Vision/extraction call: ~US$0.01
Orchestrator turns/tool reasoning: ~US$0.02-0.04
Artifact generation: ~US$0.005

Estimated total: ~US$0.03-0.06 per reconciliation case
```

This is an estimate, not a guarantee. Actual cost depends on model, proof size, and number of tool turns.

## 22. Judging Criteria Fit

Impact / Problem Relevance:

- Directly solves SME cross-border reconciliation pain.
- Shows time/error reduction for manual finance workflow.

Innovation / Creativity:

- Exception-first workflow, not generic OCR.
- Date-aware FX reasoning, discrepancy summaries, audit artifacts.

Technical Implementation:

- OCR/extraction routing;
- parsers;
- deterministic matching engine;
- FX/tolerance tools;
- status classifier;
- report/discrepancy artifact generation.

Agentic Architecture:

- visible tool calls;
- branch decisions;
- artifact generation;
- human escalation;
- activity timeline.

Prototype Functionality:

- working demo batch;
- 3-column evidence view;
- dashboard;
- report and mock notification.

Pitch/Demo:

- simple opening example: USD10 expected payment, RM42.50 bank deposit;
- show exact match, FX variance, missing reference, and discrepancy.

## 23. Final MVP Scope

Build:

- load demo batch;
- expected payment CSV/XLSX parser;
- bank statement CSV/XLSX parser;
- payment proof image/PDF/text extraction with fallback JSON;
- extraction routing agent;
- local FX reference table with optional live lookup;
- deterministic matching engine;
- status classifier;
- agent activity timeline;
- dashboard;
- detail view;
- report generator;
- discrepancy summary/mock email.

Demo fixture requirement:

```text
The demo batch must include at least:
- 1 scanned image payment proof;
- 1 digital PDF proof with a text layer;
- 1 PDF proof with embedded table-like payment details.
```

This is required so the Extraction Agent visibly routes to different extraction tools during the demo.

Support:

- USD -> MYR;
- SGD -> MYR optional;
- 4 hero cases.

Cut:

- real bank integration;
- ERP/accounting posting;
- live-only FX;
- exact bank fee claims;
- unlimited currencies;
- combined/duplicate/partial complexity unless ahead of schedule;
- tax/withholding;
- fraud detection;
- Web3 mechanics as product feature.

## 24. Demo Plan

3-4 minute script:

1. **0:00-0:25 Problem**
   - "SMEs receive RM deposits that do not obviously match USD invoices."

2. **0:25-0:45 Product**
   - "ReconPilot reconciles payment proofs, expected records, and local bank statements."

3. **0:45-1:15 Run demo batch**
   - Click `Load Demo Batch`, then `Run Reconciliation`.
   - Show agent activity timeline.

4. **1:15-2:00 Dashboard**
   - Show auto-matched, likely matched, needs review, unmatched.

5. **2:00-2:50 Detail view**
   - Show Expected Payment | Payment Proof | Bank Deposit.
   - Show FX reasoning and match signals.

6. **2:50-3:30 Exception**
   - Open short payment / possible fee case.
   - Generate discrepancy summary.

7. **3:30-4:00 Artifact**
   - Show reconciliation report/mock email.
   - Close: "Clean cases auto-match; risky cases escalate with evidence."

## 25. Revised Build Plan

The LLM/agent loop must be wired early. Do not bolt it on at the end.

### Day 1

- Create schemas and demo fixtures.
- Implement CSV/XLSX parsers.
- Implement normalized JSON records.
- Build one terminal end-to-end path with:
  - one expected payment;
  - one payment proof fixture;
  - one bank transaction;
  - one hardcoded orchestrator call with stub tools.
- End of day target: one reconciliation case runs through the agent loop in terminal.

### Day 2

- Implement FX lookup/fallback.
- Implement FX date selection algorithm.
- Implement candidate generator.
- Implement scoring/classifier.
- Implement tolerance table and hard overrides.
- Implement timeline JSONL logging.
- End of day target: 4 hero cases pass deterministically.

### Day 3

- Build dashboard UI.
- Build detail view.
- Build agent activity timeline panel.
- Build report and discrepancy email views.
- Refine prompts and explanations.
- End of day target: browser demo works.

### Day 4

- Polish UI.
- Record demo video.
- Finalize README.
- Finalize pitch deck and agent framework diagram.
- No new features.

## 26. Team Role Assignment

Assign before coding:

```text
Engineer 1: parsers, schemas, fixtures
Engineer 2: matching engine, FX algorithm, scoring
Engineer 3: agent loop, prompts, activity timeline
Engineer 4 / designer: dashboard UI, detail view, demo polish
Presenter/PM: deck, script, README, judging narrative
```

If team is smaller, combine roles, but keep ownership clear.

## 27. Kill/Pivot Criteria

Kill or pivot if:

- matching engine does not work after first build session;
- demo depends on live network/OCR with no fallback;
- output is only a confidence score with no evidence;
- team cannot explain the problem in one sentence;
- UI hides FX reasoning and audit trail;
- agent activity timeline is missing.

## 28. Frozen Decision

Build ReconPilot as:

> A file-first, exception-first FX reconciliation workflow agent for SMEs.

Freeze these choices:

- 2 real agents + 1 artifact generation module;
- deterministic matching;
- AI for extraction routing, orchestration, explanation, and artifact text;
- expected payment records instead of invoice-management scope;
- FX rates framed as date-aware reference estimates;
- fees framed as hypotheses/tolerance, not confirmed truth;
- human review for risky cases;
- 4 hero demo cases;
- agent activity timeline as core demo asset.

No more broad research. Next step is implementation.
