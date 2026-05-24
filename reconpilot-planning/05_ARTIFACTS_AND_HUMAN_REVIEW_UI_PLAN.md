# 05 Artifacts And Human Review UI Plan

Status: implementation handoff
Owner: UI / Artifact / Human Review implementer
Branch: `agent-2`
Date: 2026-05-24

## 1. Purpose

This document defines the UI for lane 5:

```text
Artifacts + Human Review
```

This is the final screen judges will care about. It must prove ReconPilot does more than extract JSON:

```text
Agent 2 reconciles bank credits,
routes each result,
generates actionable artifacts,
and creates human-review tasks for risky cases.
```

The UI must not look like a generic JSON dump. JSON can remain available for debugging, but the main demo view must be a reconciliation dashboard.

## 2. Input To This UI

The UI should consume Agent 2 output:

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

Current Agent 2 code is expected to expose:

```ts
runReconciliationOrchestrator(normalizedInputBatch)
```

The data path should be:

```text
Upload files
-> Agent 1 extraction
-> Code Tools parse + normalize
-> response.codeTools.normalizedInputBatch
-> Agent 2 runReconciliationOrchestrator()
-> Artifacts + Human Review UI
```

Do not make this UI parse files, normalize values, calculate FX, or score matches.

## 3. UX Goal

The user should immediately understand:

1. How many bank credits were reconciled.
2. Which payments are safe.
3. Which payments need review.
4. Why each decision happened.
5. What artifact was generated.
6. What action the human should take next.

One-line product promise:

```text
Auto-match clean cross-border payments, escalate risky discrepancies with evidence.
```

## 4. Main Page Layout

After extraction and Agent 2 run, the page should show these sections in order:

```text
1. Batch Summary
2. Reconciliation Work Queue
3. Selected Case Detail
4. Artifact Preview
5. Human Review Panel
6. Agent Activity Timeline
7. Debug JSON
```

The current upload/extraction UI can stay above this. Add the reconciliation dashboard below the existing parsed/normalized output or replace JSON as the primary view once Agent 2 is wired.

## 5. Batch Summary

Show four compact status counters:

```text
AUTO MATCHED     3
LIKELY MATCHED   1
NEEDS REVIEW     2
UNMATCHED        1
```

Use color coding:

| Status | Color Meaning |
|---|---|
| `AUTO_MATCHED` | green / safe |
| `LIKELY_MATCHED` | blue / approval recommended |
| `NEEDS_REVIEW` | orange / human needed |
| `UNMATCHED` | red / unresolved |

Also show:

```text
Batch ID
Total bank credits processed
Total artifact requests
Total human review requests
```

Do not show giant raw JSON as the first thing after reconciliation. That is weak demo UX.

## 6. Reconciliation Work Queue

Show one row/card per `ReconciliationResult`.

Required fields per row:

```text
Status badge
Bank transaction ID
Invoice number if available
Payment proof ID if available
Score
Residual percent or "No FX scenario"
Top reason codes
Human review required? yes/no
Artifact type generated
```

Example row:

```text
AUTO_MATCHED | Bank txn ...003 | INV-1001 | Score 97
FX residual 0.00% | EXACT_REFERENCE_MATCH, FX_EXPLAINS_AMOUNT
Artifact: Reconciliation Report
```

For `NEEDS_REVIEW`:

```text
NEEDS_REVIEW | Bank txn ...007 | INV-1005 | Score 81
Residual 3.4% | RESIDUAL_ABOVE_THRESHOLD, POSSIBLE_SHORT_PAYMENT
Review: Was an intermediary fee deducted?
```

Rows should be clickable. Clicking a row changes the Selected Case Detail.

Default selected row:

1. First `NEEDS_REVIEW` case, if any.
2. Else first `UNMATCHED`.
3. Else first result.

Reason: show the interesting exception-first workflow in the demo.

## 7. Selected Case Detail

This is the most important panel.

For the selected result, show:

```text
Decision
Evidence
FX reasoning
Score breakdown
Review flags
Explanation
```

### 7.1 Decision Header

Display:

```text
CASE-txn_...
Status: NEEDS_REVIEW
Score: 81
Decision: Escalated for human review
```

Use the exact `result.explanation`.

### 7.2 Evidence Comparison

Show three evidence columns:

```text
Expected Payment / Invoice
Payment Proof
Bank Credit
```

Each column should show the comparable fields:

| Field | Expected Payment | Payment Proof | Bank Credit |
|---|---|---|---|
| Reference | `INV1001` | `INV1001` | `INV1001` |
| Party | `ACME` | `ACME` | `ACME` |
| Amount | `USD 10000` | `MYR 42500` | `MYR 42500` |
| Date | issue/due date | payment date | booking/value date |
| Source confidence | record confidence | proof confidence | parsed row |

If a field is missing or mismatched, make it visible:

```text
Reference: missing
Party: weak match
Amount: 3.4% residual
```

Do not hide mismatch details behind a tooltip only. Judges need to see the evidence.

### 7.3 FX Reasoning Panel

If `result.bestFxScenario` exists, show:

```text
Best FX scenario: Payment-date FX
Rate: 4.2500
Rate date: 2026-05-21
Expected local amount: MYR 42500
Bank received: MYR 42500
Residual: MYR 0 / 0.00%
Source: payment proof / fixture / fallback
```

Important copy:

```text
Best explains the received amount.
```

Do not write:

```text
Bank used this exact rate.
```

If no usable FX scenario:

```text
No usable FX scenario was available. This case requires review.
```

### 7.4 Score And Flags

Show:

```text
Score: 97 / 100
Reason codes:
- EXACT_REFERENCE_MATCH
- FX_EXPLAINS_AMOUNT
- DATE_CLOSE
- NAME_MATCH

Hard review flags:
- none
```

For risky cases:

```text
Hard review flags:
- RESIDUAL_ABOVE_THRESHOLD
- COMPETING_CANDIDATES_CLOSE
```

Hard flags should be visually stronger than score. A score of 90 with hard flags still needs review.

## 8. Artifact Preview

Artifacts are generated from `artifactRequests`.

Artifact request types:

```ts
type ArtifactType =
  | "RECONCILIATION_REPORT"
  | "RECONCILIATION_REPORT_DRAFT"
  | "DISCREPANCY_SUMMARY"
  | "MOCK_EMAIL_DRAFT";
```

Show artifact cards linked to the selected case.

### 8.1 AUTO_MATCHED Artifact

Type:

```text
RECONCILIATION_REPORT
```

Display:

```text
Reconciliation Report
Status: Auto matched
Bank credit: ...
Matched invoice: ...
Matched proof: ...
FX basis: ...
Residual: ...
Evidence summary: ...
Generated at: ...
```

Primary action:

```text
View report
```

Secondary action:

```text
Copy summary
```

No approval button is required for `AUTO_MATCHED` in MVP, but showing an audit trail is required.

### 8.2 LIKELY_MATCHED Artifact

Type:

```text
RECONCILIATION_REPORT_DRAFT
```

Display:

```text
Report Draft
This match is likely correct but needs approval before posting.
```

Primary action:

```text
Approve match
```

Secondary actions:

```text
Reject
Request more info
```

Approval is local UI state only for MVP. Do not post to accounting software.

### 8.3 NEEDS_REVIEW Artifact

Type:

```text
DISCREPANCY_SUMMARY
```

Display:

```text
Discrepancy Summary
Why this needs review:
- residual above threshold
- possible short payment
- FX scenario does not fully explain bank amount

Recommended next step:
Ask payer/bank whether an intermediary fee was deducted.
```

Primary action:

```text
Open review task
```

### 8.4 UNMATCHED Artifact

Types:

```text
DISCREPANCY_SUMMARY
MOCK_EMAIL_DRAFT
```

Display discrepancy:

```text
No candidate survived matching gates.
Possible reasons:
- missing reference
- no plausible proof
- no expected payment
- amount/date/name do not align
```

Display mock email draft:

```text
Subject: Payment clarification needed for bank credit [transaction id]

Hi [customer],

We received a bank credit of [amount] on [date], but could not match it to an open invoice.
Could you confirm which invoice this payment is for and provide the payment reference?

Thanks.
```

Important: this is a **mock email draft**, not a sent email.

UI action:

```text
Copy email draft
```

Do not implement real email sending.

## 9. Human Review Panel

The panel consumes `humanReviewRequests`.

Show all review requests for the selected case.

Required fields:

```text
Severity
Blocking? yes/no
Question
Options if provided
Evidence references
Reason codes
Action buttons
```

Example:

```text
HIGH REVIEW
Question:
This bank credit is MYR 1487.50 away from the best FX explanation.
Was an intermediary fee or FX spread applied?

Actions:
[Confirm fee/spread] [Reject match] [Request more proof]
```

If competing candidates exist, show option buttons:

```text
Which invoice should receive this payment?

[INV-1001 - Closes INV-1001]
[INV-1002 - Closes INV-1002]
[None of these]
```

## 10. Human Actions

For MVP, actions are local UI state only.

Implement these actions:

```ts
type ReviewAction =
  | "APPROVE_MATCH"
  | "REJECT_MATCH"
  | "REQUEST_MORE_INFO"
  | "SELECT_CANDIDATE"
  | "MARK_EMAIL_COPIED";
```

When user clicks an action, update only the UI:

```text
Review status: pending -> approved / rejected / info requested
```

Do not call real bank, accounting, or email APIs.

### Button Rules

| Status | Primary Button | Secondary Buttons |
|---|---|---|
| `AUTO_MATCHED` | View report | Copy summary |
| `LIKELY_MATCHED` | Approve match | Reject, Request more info |
| `NEEDS_REVIEW` | Resolve review | Reject, Request more proof |
| `UNMATCHED` | Copy email draft | Mark as investigated |

## 11. Agent Activity Timeline

The timeline is mandatory for judging.

Show timeline events from:

```ts
orchestratorOutput.timeline
```

Filter behavior:

- Default: show selected case events only.
- Add toggle: show full batch timeline.

Each timeline row should show:

```text
Step number
Actor
Event type
Action
Tool name if present
Input summary
Result summary
Reasoning
Related IDs
```

Example display:

```text
12 Agent 2
call calculateFxScenarios
Input: candidate CAND-001
Reasoning: Need FX scenarios to evaluate amount residual.

13 Reconciliation Tool
calculateFxScenarios returned
Result: proof FX 4.2500 explains bank credit with 0.00% residual.
```

This is where the project demonstrates "agentic" behavior. Without the timeline, the architecture looks like a normal script.

## 12. Suggested Components

Keep components small and boring:

```text
app/page.tsx
  ReconciliationDashboard
    BatchSummaryCards
    ReconciliationQueue
    CaseDetailPanel
      EvidenceComparison
      FxReasoningPanel
      ScoreAndFlagsPanel
    ArtifactPreviewPanel
    HumanReviewPanel
    AgentTimelinePanel
    DebugJsonPanel
```

Suggested file location:

```text
src/components/reconciliation/
```

If the project does not yet have a component folder, it is acceptable to start inside `app/page.tsx` for speed, but split once the file becomes hard to read.

## 13. Visual Direction

This is an operational treasury tool, not a marketing page.

Use:

- dense but readable tables/cards;
- small status badges;
- restrained colors;
- clear evidence comparison;
- stable panel heights;
- no hero section;
- no decorative gradients/orbs;
- no giant AI branding.

The UI should feel like:

```text
finance operations dashboard
```

Not:

```text
AI landing page
```

## 14. Empty And Error States

Before Agent 2 runs:

```text
Run reconciliation to generate match results.
```

If no bank credits exist:

```text
No inbound bank credits found. Debits are ignored for inbound payment reconciliation.
```

If Agent 2 fails:

```text
Reconciliation failed before classification.
Show error message and keep extraction JSON visible.
```

If a selected case has no artifact:

```text
No artifact generated for this case.
```

That should almost never happen. It indicates a routing bug.

## 15. Acceptance Criteria

The UI is acceptable when:

- [ ] User can upload sample files and run extraction.
- [ ] Agent 2 output appears in a reconciliation dashboard.
- [ ] Batch summary counts match `orchestratorOutput.summary`.
- [ ] Every `ReconciliationResult` appears in the queue.
- [ ] Selecting a case updates detail, artifact, review, and timeline panels.
- [ ] `AUTO_MATCHED` shows a reconciliation report artifact.
- [ ] `LIKELY_MATCHED` shows approval actions.
- [ ] `NEEDS_REVIEW` shows a specific review question.
- [ ] `UNMATCHED` shows discrepancy summary and mock email draft.
- [ ] Timeline shows tool calls and observed tool results.
- [ ] Debug JSON remains available but is not the main story.
- [ ] Review buttons update local UI state.
- [ ] No real email sending, bank posting, or accounting posting occurs.

## 16. What To Cut If Time Is Short

Cut:

- polished filters;
- export PDF;
- persistent review state;
- real email integration;
- account posting simulation;
- advanced charts.

Do not cut:

- status summary;
- selected case detail;
- artifact preview;
- human review question;
- agent timeline.

Those are the demo-critical pieces.

## 17. Demo Story

Use this order in the live demo:

```text
1. Upload invoice, bank statement, payment proof.
2. Show extraction JSON briefly.
3. Show parsed + normalized JSON briefly.
4. Run reconciliation.
5. Open an AUTO_MATCHED case and show evidence + report.
6. Open a NEEDS_REVIEW case and show discrepancy + review question.
7. Open timeline and show Agent 2 calling deterministic tools.
8. End with: AI orchestrates; code decides money math; humans approve risky cases.
```

The final line should be:

```text
ReconPilot does not blindly trust AI with money. It uses AI to orchestrate and explain, deterministic tools to reconcile, and humans to approve risky cases.
```
