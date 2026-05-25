# ReconPilot Main UI Redesign Spec

This is an implementation handoff for redesigning ReconPilot from a developer debug console into a clean, judge-ready finance operations UI.

Do not change the reconciliation engine as part of this UI task unless a small adapter is needed for display labels. The goal is presentation, clarity, and demo flow.

## Goal

The main UI must communicate this within 10 seconds:

> ReconPilot ingests messy cross-border payment evidence, matches it against invoices and bank statements, tests FX-date explanations, and produces either an auto-match report or a human-review discrepancy packet.

## Current Problem

The current UI works for testing, but it is not suitable for judging.

Problems:

- The main page shows runtime paths, ingestion IDs, UUID-heavy filenames, and debug JSON paths.
- The actual product outcome is buried under developer details.
- There is no proper reconciliation results table.
- There is no focused case detail view.
- The page looks like an internal engineering control panel, not a treasury workflow product.

Bluntly: this is fine for debugging, but weak for a hackathon demo.

## Route Structure

Use two routes:

| Route | Purpose | Audience |
| --- | --- | --- |
| `/` | Clean product dashboard | Judges and normal users |
| `/debug` | Raw technical diagnostics | Developers only |

The main page must not show raw JSON or internal runtime paths.

The debug page should keep all technical diagnostics so we can still test the system.

## Main Page Structure

The main page should have these sections:

1. Header
2. Upload strip
3. Summary metrics
4. Reconciliation results table
5. Detail modal opened from a table row

Desktop wireframe:

```text
+------------------------------------------------------------------------------+
| ReconPilot                                             [Debug] [Clear Demo]   |
| Cross-border reconciliation workspace                                         |
| AI extracts evidence. Code does money math. Humans approve risky cases.       |
+------------------------------------------------------------------------------+

+----------------------+----------------------+-------------------------------+
| Invoices             | Bank Statements      | Payment Proofs                |
| PDF, image, CSV...   | PDF, image, CSV...   | PDF, image, CSV...            |
| [Extract invoices]   | [Extract banks]      | [Extract payment proofs]      |
| Stored waiting: 1    | Stored waiting: 5    | Last run: AUTO_MATCHED        |
+----------------------+----------------------+-------------------------------+

+----------------+----------------+----------------+--------------------------+
| Open invoices  | Bank rows       | Auto matched   | Needs review             |
| 0              | 4              | 1              | 0                        |
+----------------+----------------+----------------+--------------------------+

+------------------------------------------------------------------------------+
| Reconciliation Results                                      [Status filter]   |
+--------------+----------+--------------+-------------+------------+---------+
| Status       | Invoice  | Customer     | Expected    | Received   | Action  |
+--------------+----------+--------------+-------------+------------+---------+
| AUTO_MATCHED | INV-1001 | Acme Pte Ltd | USD 10,000  | MYR 42,500 | View    |
+--------------+----------+--------------+-------------+------------+---------+
```

Mobile wireframe:

```text
ReconPilot
Cross-border reconciliation workspace

[Invoices upload card]
[Bank statements upload card]
[Payment proofs upload card]

[Open invoices] [Bank rows]
[Auto matched]  [Needs review]

Reconciliation Results
[AUTO_MATCHED] INV-1001
Acme Pte Ltd
USD 10,000 -> MYR 42,500
[View]
```

## Visual Direction

Use a quiet finance-operations style:

- clean
- dense enough for operations work
- trustworthy
- not decorative
- not a marketing landing page
- not playful

Avoid:

- hero sections
- decorative gradients
- purple/blue AI-style gradients
- nested cards inside cards
- huge rounded UI everywhere
- raw JSON on the main page
- runtime paths on the main page

Recommended palette:

| Role | Direction |
| --- | --- |
| Background | light cool gray or off-white |
| Primary text | navy-black |
| Secondary text | slate |
| Border | cool gray |
| Main accent | teal or blue-green |
| Success | green |
| Review | amber or orange |
| Error | red |

Typography:

- Use a modern sans font such as `Inter`, `Geist`, or `IBM Plex Sans`.
- Use tabular numbers for money, scores, dates, and counters.
- Do not overuse uppercase labels.

## Header

Header copy:

```text
ReconPilot
Cross-border reconciliation workspace
AI extracts evidence. Code does money math. Humans approve risky cases.
```

Header actions:

- `Debug` link to `/debug`
- `Clear Demo Data` button

For final submission, `Clear Demo Data` can be moved to `/debug` if it feels too developer-facing.

## Upload Strip

Keep three upload cards:

1. Invoices
2. Bank Statements
3. Payment Proofs

Each upload card should show:

- title
- supported file hint
- selected file count
- extract/upload button
- upload status
- stored waiting count

Example:

```text
Invoices
PDF, image, CSV, XLSX, TXT

1 file selected
[Extract invoices]

Stored waiting invoices: 1
```

Do not show these on the main page:

- ingestion ID
- local folder
- full debug response path
- waiting JSON file path
- normalized JSON path

For the Payment Proof card, after upload, show the latest reconciliation summary:

```text
Last reconciliation
AUTO_MATCHED - Report generated
```

## Summary Metrics

Add a compact metric strip after upload cards.

Recommended metrics:

| Metric | Meaning |
| --- | --- |
| Open invoices | invoice records still waiting |
| Bank rows | bank transaction records still waiting |
| Auto matched | successful auto matches in current session |
| Needs review | review/unmatched cases in current session |

If exact historical counts are not available, derive from current client state for now. Do not block the UI redesign on perfect analytics.

## Reconciliation Results Table

The results table is the main product surface.

Each reconciliation run should become one row.

Columns:

| Column | Source / rule |
| --- | --- |
| Status | `run.status` |
| Invoice | invoice number if available, otherwise expected payment ID |
| Customer | debtor/customer from invoice, proof, or bank transaction |
| Expected | invoice amount and currency |
| Received | bank/proof received amount and currency |
| FX basis | best FX scenario label/date if available |
| Score | selected candidate score |
| Action | `View`, `Review`, or `Inspect` |

Status rules:

| Status | Chip color | Action label |
| --- | --- | --- |
| `AUTO_MATCHED` | green | `View` |
| `LIKELY_MATCHED` | blue or amber | `Review` |
| `NEEDS_REVIEW` | orange | `Review` |
| `UNMATCHED` | red | `Inspect` |
| `NO_PROOF_RECORD` | gray | `Inspect` |

Empty state:

```text
No reconciliation results yet.
Upload invoices and bank statements first, then upload a payment proof to trigger matching.
```

Loading state:

```text
Reconciling payment proof...
Generating candidates, testing FX dates, and scoring matches.
```

Error state:

```text
Reconciliation failed.
Show the error message and provide retry guidance.
```

## Detail Modal

Clicking a results row opens a centered modal.

The modal replaces the current long debug layout. It should explain one reconciliation case clearly.

Modal header:

```text
INV-1001
AUTO_MATCHED
Score 100
```

Modal tabs:

1. Overview
2. Evidence
3. FX Reasoning
4. Agent Timeline
5. Artifacts

### Tab 1: Overview

For `AUTO_MATCHED`:

```text
Decision
AUTO_MATCHED

Reason
Exact reference match, customer name match, and invoice-date FX explains the bank credit with 0.00% residual.

Next action
No human action required. Reconciliation report generated.
```

For `LIKELY_MATCHED`:

```text
Decision
LIKELY_MATCHED

Reason
Strong evidence, but approval is recommended before moving records to completed.

Next action
Review the evidence and approve or reject the match.
```

For `NEEDS_REVIEW`:

```text
Decision
NEEDS_REVIEW

Reason
Evidence is conflicting, incomplete, or financially risky.

Next action
Review discrepancy summary and request more proof if needed.
```

For `UNMATCHED`:

```text
Decision
UNMATCHED

Reason
No reliable invoice/bank candidate was found.

Next action
Upload missing evidence or keep as unresolved.
```

### Tab 2: Evidence

Show invoice, payment proof, and bank row evidence side by side on desktop. Stack them on mobile.

Example:

```text
Invoice
- Invoice: INV-1001
- Customer: Acme Pte Ltd
- Amount due: USD 10,000
- Issue date: 2026-05-20

Payment Proof
- Payer: Acme Pte Ltd
- Paid amount: MYR 42,500
- Payment date: 2026-05-21
- Reference: INV-1001

Bank Statement Row
- Description: Inward remittance ACME PTE LTD INV-1001
- Amount: MYR 42,500
- Booking date: 2026-05-21
- Reference: INV-1001
```

Show match signals:

| Signal | Example |
| --- | --- |
| Reference | `INV1001 = INV1001` |
| Name | `ACME = ACME` |
| Amount | expected MYR 42,500 vs received MYR 42,500 |
| Date | proof date close to bank booking date |

### Tab 3: FX Reasoning

This is a key judging area. Make it explicit.

Show all FX scenarios tested:

```text
FX scenarios tested

Invoice issue date
Rate: 4.2500
Expected: MYR 42,500
Residual: 0.00%

Payment date
Rate: 4.2500
Expected: MYR 42,500
Residual: 0.00%

Bank booking date
Rate: 4.2500
Expected: MYR 42,500
Residual: 0.00%

Selected basis
Invoice issue-date FX produced the lowest residual.
```

If local fixture FX is used, label it honestly:

```text
Rate source: local FX fixture table
```

Do not claim live FX API unless live FX is actually implemented.

### Tab 4: Agent Timeline

Keep the timeline in the product modal, not only on `/debug`.

This proves the system is agentic.

Example:

```text
12:01 Agent 1 chose parse_pdf_table for invoice
12:02 Code Tools normalized INV-1001 to INV1001
12:03 Agent 2 generated candidate CAND-001
12:04 Agent 2 tested invoice/payment/bank-date FX
12:05 Code Tools scored candidate 100/100
12:06 Agent 2 classified AUTO_MATCHED
12:07 Artifact module generated reconciliation report
```

Each timeline item should show:

- time
- actor
- action/tool
- result
- reasoning summary

Do not show raw JSON here.

### Tab 5: Artifacts

Show generated artifacts as user-facing documents, not file paths.

For `AUTO_MATCHED`:

```text
Reconciliation Report
- Status: generated
- Matched invoice: INV-1001
- Matched bank transaction: ...
- Matched payment proof: ...
```

For `NEEDS_REVIEW` or `UNMATCHED`:

```text
Discrepancy Summary
- Status: generated
- Main issue: amount variance / missing reference / competing candidates

Mock Notification
- Status: generated
- Message preview shown here
```

## Human Review Actions

Show action buttons only when relevant.

For `AUTO_MATCHED`:

- `View Report`

For `LIKELY_MATCHED`:

- `Approve Match`
- `Reject`
- `Request More Info`

For `NEEDS_REVIEW`:

- `Approve with Note`
- `Reject Match`
- `Request More Proof`

For `UNMATCHED`:

- `Mark as Unresolved`
- `Upload Missing Evidence`
- `Create Discrepancy Note`

MVP rule:

- These buttons can be UI-only if backend approval actions are not implemented yet.
- Do not show visible text saying "mock" or "not implemented" in the judge-facing flow.

## Debug Page

Create `/debug`.

Move the following from `/` to `/debug`:

- full response JSON path
- ingestion summary path
- parsed input batch path
- normalized input batch path
- waiting record paths
- reconciliation run JSON path
- report JSON path
- discrepancy JSON path
- mock notification JSON path
- raw JSON viewers
- clear runtime / clear demo data controls

Debug page wireframe:

```text
Debug Console
[Back to Dashboard] [Clear Demo Data]

Latest Upload Debug Files
- Full response JSON: ...
- Parsed input batch: ...
- Normalized input batch: ...

Latest Reconciliation Files
- Run JSON: ...
- Report JSON: ...
- Discrepancy JSON: ...
- Mock notification JSON: ...

Raw JSON Viewer
[select file/run] [JSON block]
```

The debug page can be functional and plain. It is not the demo surface.

## Data Mapping Notes

The existing API response has enough data for the MVP:

- `RoleApiResult.reconciliationRuns`
- `ReconciliationRun.status`
- `ReconciliationRun.summary`
- `ReconciliationRun.nextAction`
- `ReconciliationRun.selectedResult`
- `ReconciliationRun.outputPaths`
- `ReconciliationRun.reconciliation.timeline`
- `ReconciliationRun.reconciliation.results`
- `ReconciliationRun.reconciliation.artifactRequests`
- `ReconciliationRun.reconciliation.humanReviewRequests`

If display fields are missing, create a UI adapter instead of changing Agent 2 core logic.

Recommended adapter type:

```ts
type ReconciliationDisplayRow = {
  id: string;
  status: string;
  invoiceLabel: string;
  customerLabel: string;
  expectedAmountLabel: string;
  receivedAmountLabel: string;
  fxBasisLabel: string;
  scoreLabel: string;
  summary: string;
  run: ReconciliationRun;
};
```

Keep this adapter near the UI layer.

Do not pollute reconciliation logic just to create prettier labels.

## Component Plan

Recommended structure:

```text
app/page.tsx
  DashboardPage
    AppHeader
    UploadStrip
      UploadCard
    MetricsStrip
      MetricTile
    ReconciliationResultsTable
      StatusChip
    ReconciliationDetailModal

app/debug/page.tsx
  DebugPage
    DebugFileList
    JsonViewer
```

If speed matters, it is acceptable to keep the page simple, but extract at least:

- `UploadCard`
- `StatusChip`
- `ReconciliationResultsTable`
- `ReconciliationDetailModal`

Do not leave one giant unreadable page component.

## Acceptance Criteria

The UI redesign is acceptable when:

- `/` no longer displays raw JSON blocks.
- `/` no longer displays internal runtime paths.
- `/` has a small link to `/debug`.
- `/` shows upload controls for invoices, bank statements, and payment proofs.
- `/` shows a reconciliation results table or mobile card list.
- Clicking a result opens a modal with Overview, Evidence, FX Reasoning, Agent Timeline, and Artifacts.
- The clean sample shows `AUTO_MATCHED`, report generated, no discrepancy, and no mock notification.
- Review/unmatched cases clearly explain why human action is required.
- `/debug` preserves technical paths and raw JSON diagnostics.
- UI is responsive on desktop and mobile.
- No decorative gradients, orbs, or marketing hero sections.

## Do Not Build Yet

Do not build these unless there is extra time:

- authentication
- historical database
- real approval persistence
- real email sending
- live FX API integration
- multi-user audit roles
- advanced filters
- charts

Focus on:

```text
upload evidence -> reconciliation runs -> result table -> detail modal -> report/discrepancy visible
```

## Final Implementation Warning

Do not make the debug page beautiful while the main workflow is weak.

The judging page is `/`. The debug page is disposable.

If a judge sees raw JSON before they understand the reconciliation result, the UI has failed.
