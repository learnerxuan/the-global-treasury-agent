# ReconPilot Latest Workflow Plan

## Summary

ReconPilot is a cross-border reconciliation system for SMEs.

The system has three separate ingestion flows:

1. Invoice upload/import
2. Bank statement upload/import
3. Payment proof upload/import

Each flow extracts, parses, normalizes, and stores its own records independently.

After storage, records enter a local waiting stage. Reconciliation reads from the waiting stage and attempts to match one invoice, one payment proof, and one bank transaction.

The main trigger for automatic reconciliation is a newly stored payment proof.

This matches real business logic:

- invoices usually exist first
- bank statement transactions usually arrive through bank import
- customer payment proof arrives later and triggers the question: "Can this proof be matched to an invoice and a bank transaction?"

If ReconPilot can match the records, it moves them from waiting to completed and generates a reconciliation report.

If ReconPilot cannot match them, it creates a discrepancy summary and a mock notification explaining what is missing or suspicious.

## Core Principle

Extraction and reconciliation are separate stages.

```text
Upload/import
-> extract
-> parse
-> normalize
-> store in waiting stage
-> reconciliation reads waiting stage
-> matched records move to completed stage
```

The system should not require all three document types to be uploaded together.

## Three Separate Upload Flows

### 1. Invoice Upload / Import

Invoices represent expected payments.

In production, invoices often come directly from ERP/accounting systems.

Examples:

- Xero
- QuickBooks
- SQL database
- internal ERP
- accounting export

In the MVP, invoices can be uploaded manually through the UI.

Supported UI upload types:

```text
PDF
image
XLSX
CSV
TXT
```

Markdown is not supported.

Invoice flow:

```text
User uploads invoice file(s)
or ERP sends invoice data by API
-> extraction agent/code tools extract invoice records
-> system parses and normalizes fields
-> system stores invoice records in waiting stage
```

Invoice waiting record example:

```json
{
  "recordId": "inv_wait_001",
  "sourceDocumentId": "doc_invoice_001",
  "type": "invoice",
  "status": "waiting",
  "invoiceNumber": "INV-1001",
  "customerName": "ABC Inc.",
  "issueDate": "2026-05-20",
  "dueDate": "2026-05-30",
  "amountDue": {
    "value": "10.00",
    "currency": "USD"
  },
  "paymentReference": "INV-1001",
  "normalizedReference": "INV1001",
  "normalizedCustomerName": "ABC INC"
}
```

### 2. Bank Statement Upload / Import

Bank statements represent actual cash movement.

In production, bank transactions may come from:

- bank statement CSV/XLSX export
- bank API
- accounting system bank feed
- manual upload

In the MVP, bank statements can be uploaded separately through the UI.

Bank statement flow:

```text
User uploads bank statement file(s)
or bank integration sends transaction rows
-> extraction agent/code tools extract transactions
-> system parses and normalizes rows
-> system stores bank transaction records in waiting stage
```

Bank statement records are separate from the original bank statement file.

A single bank statement file can produce many bank transaction records.

Bank transaction waiting record example:

```json
{
  "recordId": "bank_wait_001",
  "sourceDocumentId": "doc_bank_001",
  "type": "bank_transaction",
  "status": "waiting",
  "transactionDate": "2026-05-24",
  "valueDate": "2026-05-25",
  "description": "TT INWARD FROM ABC INC USD10 @ 4.25 LESS RM0.50 FEE",
  "amount": {
    "value": "42.00",
    "currency": "MYR"
  },
  "amountReceived": {
    "value": "42.50",
    "currency": "MYR"
  },
  "bankFeeDeducted": {
    "value": "0.50",
    "currency": "MYR"
  },
  "feeCurrency": "MYR",
  "netCreditAmount": {
    "value": "42.00",
    "currency": "MYR"
  },
  "sourceAmount": {
    "value": "10.00",
    "currency": "USD"
  },
  "exchangeRateApplied": "4.25",
  "referenceNo": "TT20260524XYZ",
  "normalizedReference": "TT20260524XYZ"
}
```

Important rule:

If the bank statement only shows local currency, do not invent source amount or FX rate. A local MYR bank fee can still be extracted if it is explicitly shown in the statement narration, fee column, or separate charge row.

```json
{
  "sourceAmount": null,
  "exchangeRateApplied": null,
  "bankFeeDeducted": {
    "value": "0.50",
    "currency": "MYR"
  }
}
```

### 3. Payment Proof Upload / Import

Payment proof is customer evidence that a payment was made.

Payment proof may be:

- bank receipt
- SWIFT MT103
- remittance advice
- Wise/PayPal/Stripe receipt
- screenshot
- PDF confirmation
- email text exported as TXT

Payment proof flow:

```text
User uploads payment proof file(s)
or API receives payment proof
-> extraction agent extracts payment proof fields
-> system parses and normalizes fields
-> system stores payment proof records in waiting stage
-> system automatically triggers reconciliation
```

Payment proof is the main automatic reconciliation trigger.

Payment proof waiting record example:

```json
{
  "recordId": "proof_wait_001",
  "sourceDocumentId": "doc_proof_001",
  "type": "payment_proof",
  "status": "waiting",
  "payerName": "ABC Inc.",
  "creditorName": "ReconPilot Sdn Bhd",
  "paymentDate": "2026-05-24",
  "paidAmount": {
    "value": "10.00",
    "currency": "USD"
  },
  "grossAmount": {
    "value": "10.00",
    "currency": "USD"
  },
  "feeAmount": {
    "value": "0.25",
    "currency": "USD"
  },
  "feeCurrency": "USD",
  "netAmount": {
    "value": "9.75",
    "currency": "USD"
  },
  "reference": "INV-1001",
  "normalizedReference": "INV1001",
  "paymentStatus": "ACSC",
  "providerOrBankName": "Sender Bank"
}
```

## One File, One Extraction Job, One LLM Call

Each uploaded file becomes a separate extraction job.

```text
invoice-001.pdf -> extraction job 1
invoice-002.pdf -> extraction job 2
bank-may.csv -> extraction job 3
proof-001.png -> extraction job 4
```

For each file that needs LLM extraction, the system makes one LLM call.

```text
1 file = 1 LLM extraction call
```

Batch upload is allowed, but batch upload does not mean one combined LLM call.

Example:

```text
User uploads 10 payment proofs
-> system creates 10 extraction jobs
-> each file is extracted separately
-> each result is stored separately
```

This helps because:

- one failed file does not fail the whole batch
- rate-limit retry can happen per file
- successful extractions are still stored
- re-running does not require extracting successful files again
- payment proof upload can trigger reconciliation per proof

## Local Storage Plan

For MVP, extracted data should be stored locally in the project folder.

Raw uploaded files can remain in:

```text
runtime/uploads/
```

Extracted and normalized records should be stored in:

```text
runtime/extracted/
```

Recommended structure:

```text
runtime/
  uploads/
    invoice/
    bank_statement/
    payment_proof/

  extracted/
    waiting/
      invoices/
      bank_transactions/
      payment_proofs/

    completed/
      invoices/
      bank_transactions/
      payment_proofs/
      reconciliation_reports/

    discrepancies/
      payment_proofs/
      discrepancy_summaries/
      mock_notifications/

    jobs/
      queued/
      processing/
      completed/
      failed/
```

## Waiting Stage

The waiting stage contains extracted, parsed, and normalized records that have not yet been reconciled.

Waiting folders:

```text
runtime/extracted/waiting/invoices/
runtime/extracted/waiting/bank_transactions/
runtime/extracted/waiting/payment_proofs/
```

Each invoice is stored separately.

Each payment proof is stored separately.

Each bank transaction is stored separately.

This is important because one bank statement file can contain many transactions.

Example:

```text
runtime/extracted/waiting/invoices/inv_wait_001.json
runtime/extracted/waiting/bank_transactions/bank_wait_001.json
runtime/extracted/waiting/payment_proofs/proof_wait_001.json
```

## Completed Stage

When reconciliation succeeds, matched records move from waiting to completed.

Completed folders:

```text
runtime/extracted/completed/invoices/
runtime/extracted/completed/bank_transactions/
runtime/extracted/completed/payment_proofs/
runtime/extracted/completed/reconciliation_reports/
```

Example movement:

```text
waiting/invoices/inv_wait_001.json
waiting/bank_transactions/bank_wait_001.json
waiting/payment_proofs/proof_wait_001.json

-> completed/invoices/inv_wait_001.json
-> completed/bank_transactions/bank_wait_001.json
-> completed/payment_proofs/proof_wait_001.json
-> completed/reconciliation_reports/recon_001.json
```

The completed report links all matched records.

Example reconciliation report:

```json
{
  "reconciliationId": "recon_001",
  "status": "AUTO_MATCHED",
  "matchedAt": "2026-05-25T10:15:00.000Z",
  "invoiceRecordId": "inv_wait_001",
  "paymentProofRecordId": "proof_wait_001",
  "bankTransactionRecordId": "bank_wait_001",
  "matchScore": 0.96,
  "reasoning": [
    "Payment proof reference INV-1001 matched invoice reference INV-1001.",
    "Payment proof payer ABC Inc. matched invoice customer ABC Inc.",
    "Invoice amount USD 10.00 matched proof gross amount USD 10.00.",
    "Bank transaction net credit MYR 42.00 is explainable by FX and fees."
  ],
  "fx": {
    "sourceAmount": {
      "value": "10.00",
      "currency": "USD"
    },
    "targetAmount": {
      "value": "42.50",
      "currency": "MYR"
    },
    "exchangeRate": "4.25"
  },
  "fees": {
    "upstreamFee": {
      "value": "0.25",
      "currency": "USD"
    },
    "receiverBankFee": {
      "value": "0.50",
      "currency": "MYR"
    }
  }
}
```

## Discrepancy Stage

If reconciliation cannot match a payment proof, the proof should not disappear.

It should move or be copied into a discrepancy stage.

Discrepancy folders:

```text
runtime/extracted/discrepancies/payment_proofs/
runtime/extracted/discrepancies/discrepancy_summaries/
runtime/extracted/discrepancies/mock_notifications/
```

The system should generate:

1. discrepancy summary
2. mock notification
3. recommended next action

Example discrepancy summary:

```json
{
  "discrepancyId": "disc_001",
  "paymentProofRecordId": "proof_wait_009",
  "status": "NEEDS_REVIEW",
  "createdAt": "2026-05-25T10:20:00.000Z",
  "summary": "Payment proof was extracted successfully but no matching MYR bank credit was found.",
  "possibleReasons": [
    "Bank statement has not been updated yet.",
    "Payment has not settled into the receiving bank account.",
    "Payment was sent to a different account.",
    "Reference number does not match invoice or bank narration.",
    "FX conversion or fees exceed configured tolerance."
  ],
  "recommendedActions": [
    "Check if the latest bank statement has been imported.",
    "Ask customer for SWIFT/TT reference.",
    "Verify beneficiary account number in the proof.",
    "Review unmatched bank credits around the payment date."
  ]
}
```

Example mock notification:

```json
{
  "notificationId": "notif_001",
  "type": "mock_email",
  "to": "finance-team@example.com",
  "subject": "ReconPilot needs review: payment proof could not be matched",
  "body": "Payment proof proof_wait_009 was received, but ReconPilot could not find a matching bank credit. Please check whether the latest bank statement has been uploaded or whether the customer sent payment to the correct receiving account."
}
```

## When Reconciliation Starts

Automatic reconciliation starts when a new payment proof is successfully extracted, normalized, and stored in the waiting stage.

```text
Payment proof uploaded
-> extract
-> parse
-> normalize
-> store in waiting/payment_proofs
-> trigger reconciliation for this payment proof
```

Payment proof is the trigger because it is the strongest signal that a customer claims payment was made.

## Why Payment Proof Triggers Reconciliation

In the expected real-world company flow:

1. invoice already exists in ERP
2. bank statement/import is updated regularly
3. customer sends payment proof
4. finance team wants to know whether the proof truly matches cash received

So when proof arrives, ReconPilot should immediately ask:

```text
Can I find the matching invoice?
Can I find the matching bank credit?
Can I explain amount differences using FX and fees?
```

## What If Bank Statement Is Not Updated Yet?

This is a normal real-world problem.

If a payment proof arrives but no bank transaction is found, ReconPilot should create a discrepancy result.

Classification:

```text
NEEDS_REVIEW
```

Possible reason:

```text
Bank statement not updated yet.
```

Recommended action:

```text
Upload or import the latest bank statement.
```

The payment proof can remain in waiting or move to discrepancy depending on implementation.

Recommended MVP behavior:

```text
Keep proof in waiting/payment_proofs
Also write discrepancy summary under discrepancies/
```

This allows the proof to be retried when a new bank statement is uploaded.

## What If Payment Went To The Wrong Account?

If payment proof has a beneficiary account that does not match the company account, ReconPilot should flag it.

Classification:

```text
NEEDS_REVIEW
```

or

```text
UNMATCHED
```

Possible reasons:

- beneficiary account mismatch
- creditor name mismatch
- no matching bank credit
- reference does not appear in bank statement

Mock notification should explain:

```text
The payment proof may not belong to this receiving account.
Please verify beneficiary account details and request corrected proof from customer.
```

## What If Invoice Is Missing?

If a proof and bank transaction match each other, but no invoice is found:

Classification:

```text
NEEDS_REVIEW
```

Possible reasons:

- invoice has not been imported
- customer paid without invoice reference
- invoice number was extracted incorrectly
- invoice belongs to another period/customer

Recommended action:

```text
Import invoice records or manually link proof to invoice.
```

## What If Bank Transaction Exists But Proof Is Missing?

This should not automatically trigger reconciliation in the current plan because payment proof is the main trigger.

However, the Reconciliation tab can have a manual scan button:

```text
Run reconciliation scan
```

This scan can find:

- bank credits with no proof
- invoices with no proof
- stale waiting records

This is useful for finance teams but not required for the first MVP.

## Reconciliation Matching Logic

When a payment proof triggers reconciliation, the orchestrator should:

1. Load the stored payment proof.
2. Search waiting invoices.
3. Search waiting bank transactions.
4. Score candidates.
5. Apply FX and fee reasoning.
6. Classify result.
7. Move matched records or create discrepancy.

### Candidate Search

Search invoice candidates by:

- normalized reference
- invoice number
- customer/payer name
- amount and currency
- date window

Search bank transaction candidates by:

- TT/reference number
- normalized narration
- payer name
- transaction date/value date
- MYR amount
- source amount if visible
- FX/fee explanation

### Scoring Signals

Strong signals:

- exact invoice reference match
- exact TT/SWIFT/reference match
- exact amount match after FX/fees
- same payer/customer

Medium signals:

- fuzzy name match
- date within expected settlement window
- narration contains customer name
- amount within tolerance

Weak signals:

- only date and amount match
- missing reference
- missing FX details

## Match Classifications

### AUTO_MATCHED

Use when confidence is high and money math is explainable.

Example:

```text
Proof reference matches invoice.
Bank TT reference matches proof.
MYR net credit matches FX conversion minus fees.
```

Action:

```text
Move all 3 records to completed.
Generate reconciliation report.
```

### LIKELY_MATCHED

Use when evidence is strong but not perfect.

Example:

```text
Name and amount match, but reference is missing.
```

Action:

```text
Keep records waiting or move to review stage.
Generate approval prompt.
```

### NEEDS_REVIEW

Use when there is a plausible match but a gap exists.

Examples:

- bank statement not updated
- fee mismatch
- FX rate missing
- partial amount received
- duplicate candidate records

Action:

```text
Generate discrepancy summary.
Generate mock notification.
```

### UNMATCHED

Use when no good candidate exists.

Examples:

- no invoice candidate
- no bank transaction candidate
- wrong beneficiary account
- payment reference unrelated

Action:

```text
Keep proof unresolved.
Generate discrepancy summary.
```

## Local Folder State Transitions

### Successful Match

```text
waiting/invoices/inv_001.json
waiting/payment_proofs/proof_001.json
waiting/bank_transactions/bank_001.json

-> completed/invoices/inv_001.json
-> completed/payment_proofs/proof_001.json
-> completed/bank_transactions/bank_001.json
-> completed/reconciliation_reports/recon_001.json
```

### Needs Review

```text
waiting/payment_proofs/proof_009.json

-> stays in waiting/payment_proofs/proof_009.json
-> discrepancies/discrepancy_summaries/disc_009.json
-> discrepancies/mock_notifications/notif_009.json
```

### Likely Match

Recommended MVP behavior:

```text
Do not move records to completed automatically.
Create review artifact.
Let human approve.
```

After human approval:

```text
Move records to completed.
```

## UI Plan

The UI should have separate tabs.

```text
Invoices
Bank Statements
Payment Proofs
Reconciliation
Matched Payments
Review / Discrepancies
```

### Invoices Tab

Purpose:

```text
Upload/import invoice files and view waiting invoice records.
```

Actions:

- upload one invoice
- upload invoice batch
- extract invoices
- view waiting invoices
- view completed invoices

### Bank Statements Tab

Purpose:

```text
Upload/import bank statement files and view waiting bank transactions.
```

Actions:

- upload one bank statement
- upload bank statement batch
- extract bank transactions
- view waiting bank transactions
- view completed bank transactions

### Payment Proofs Tab

Purpose:

```text
Upload payment proof files and automatically trigger reconciliation.
```

Actions:

- upload one proof
- upload proof batch
- extract payment proofs
- auto-run reconciliation after extraction
- show reconciliation status per proof

### Reconciliation Tab

Purpose:

```text
Show active reconciliation runs and allow manual scan/retry.
```

Actions:

- run manual reconciliation scan
- retry unresolved proof
- retry rate-limited extraction
- filter by date/customer/status

### Matched Payments Tab

Purpose:

```text
Show completed matched payments and reports.
```

Content:

- invoice
- proof
- bank transaction
- match score
- status
- reconciliation report
- FX and fee explanation

### Review / Discrepancies Tab

Purpose:

```text
Show unresolved cases.
```

Content:

- discrepancy summary
- likely reason
- missing evidence
- recommended action
- mock notification draft
- approve/reject/manual link actions

## API Plan

### Ingestion APIs

```text
POST /api/invoices/extractions
POST /api/bank-statements/extractions
POST /api/payment-proofs/extractions
```

Each accepts one or many files.

Each stores:

- raw uploaded file
- readable text
- extraction job
- structured extraction
- normalized waiting records

### Reconciliation APIs

```text
POST /api/reconciliation/run-for-proof
POST /api/reconciliation/scan
GET /api/reconciliation/matched
GET /api/reconciliation/discrepancies
```

`run-for-proof` is called automatically after payment proof extraction.

`scan` is for manual retry or periodic reconciliation.

### Listing APIs

```text
GET /api/invoices/waiting
GET /api/bank-transactions/waiting
GET /api/payment-proofs/waiting
GET /api/reconciliation/completed
GET /api/reconciliation/discrepancies
```

## Agent and Code Responsibilities

### Extraction Agent

Responsible for:

- reading unstructured text
- selecting extraction route
- extracting fields
- returning structured JSON

Not responsible for:

- matching
- money math
- deciding final reconciliation status

### Code Tools

Responsible for:

- parsing CSV/XLSX
- normalizing date
- normalizing amount
- normalizing currency
- normalizing reference
- normalizing party name
- calculating FX/fee math
- scoring candidates

### Reconciliation Orchestrator

Responsible for:

- loading waiting records
- selecting candidate matches
- calling code tools
- classifying match status
- writing completed/discrepancy outputs

### Artifact Generator

Responsible for:

- reconciliation report
- discrepancy summary
- mock notification
- approval prompt

## Rate Limit Strategy

Shared keys may hit provider rate limits.

The system should not make one giant request with many files.

Instead:

```text
one file = one job
one LLM-needed file = one LLM call
small concurrency
retry/backoff on 429
store partial successes
```

Recommended MVP concurrency:

```text
1 LLM call at a time
```

or:

```text
2 LLM calls at a time
```

Recommended 429 behavior:

```text
attempt 1 fails with 429
-> wait
-> retry
-> if still failing, store job as rate_limited
-> user can retry later
```

## Speed Strategy

Use deterministic parsing where possible.

### Invoice

If from ERP/API:

```text
No LLM.
Store directly.
```

If CSV/XLSX:

```text
Parse with code first.
Use LLM only if columns are unclear.
```

### Bank Statement

If CSV/XLSX:

```text
Parse with code first.
Use LLM only for messy narration or PDF/image.
```

### Payment Proof

Payment proof often needs LLM, especially screenshots and PDFs.

Still, cache results:

```text
If same file already extracted, reuse stored extraction.
```

## MVP Implementation Order

### Step 1: Local Waiting/Completed Storage

Create folder writer for:

```text
runtime/extracted/waiting/
runtime/extracted/completed/
runtime/extracted/discrepancies/
```

### Step 2: Separate Upload APIs

Add:

```text
POST /api/invoices/extractions
POST /api/bank-statements/extractions
POST /api/payment-proofs/extractions
```

### Step 3: Separate UI Upload Tabs

Replace one combined upload form with separate tabs/sections.

### Step 4: Store Waiting Records

After each extraction:

```text
write invoice records to waiting/invoices
write bank transactions to waiting/bank_transactions
write payment proofs to waiting/payment_proofs
```

### Step 5: Auto-Reconcile After Payment Proof Upload

After payment proof records are stored:

```text
for each new proof:
  run reconciliation against waiting invoices and waiting bank transactions
```

### Step 6: Move Matched Records

If `AUTO_MATCHED`:

```text
move invoice, proof, bank transaction to completed
write reconciliation report
```

### Step 7: Generate Discrepancy Output

If not matched:

```text
write discrepancy summary
write mock notification
keep unresolved proof available for retry
```

### Step 8: Add Matched Payments and Review UI

Add tabs:

```text
Matched Payments
Review / Discrepancies
```

## Final Target Flow

```text
Invoice uploaded/imported
-> extracted
-> parsed
-> normalized
-> stored in waiting/invoices

Bank statement uploaded/imported
-> extracted
-> parsed
-> normalized
-> stored as separate records in waiting/bank_transactions

Payment proof uploaded/imported
-> extracted
-> parsed
-> normalized
-> stored in waiting/payment_proofs
-> automatically triggers reconciliation

Reconciliation reads waiting folders
-> finds matching invoice
-> finds matching bank transaction
-> applies FX and fee reasoning

If matched:
-> move all matched records to completed
-> generate reconciliation report

If unresolved:
-> keep unresolved records available
-> generate discrepancy summary
-> generate mock notification
```

## Definition Of Done

The new workflow is complete when:

1. Invoices can be uploaded independently.
2. Bank statements can be uploaded independently.
3. Payment proofs can be uploaded independently.
4. One file creates one extraction job.
5. One LLM-needed file makes one LLM call.
6. Extracted records are parsed and normalized.
7. Invoice records are stored separately in waiting.
8. Bank transactions are stored separately in waiting.
9. Payment proofs are stored separately in waiting.
10. Uploading a payment proof automatically triggers reconciliation.
11. A successful match moves all matched records to completed.
12. A successful match creates a reconciliation report.
13. A failed match creates a discrepancy summary.
14. A failed match creates a mock notification.
15. The UI has a place to see matched payments.
16. The UI has a place to see discrepancy/review cases.
17. Reconciliation can be retried when new bank statement records arrive.
