# ReconPilot Separate Ingestion and Local Extraction Storage Plan

## Purpose

ReconPilot should move away from one combined "upload invoices + bank statements + payment proofs and extract everything together" flow.

The target product flow is:

1. Invoices are uploaded or imported separately.
2. Bank statements are uploaded or imported separately.
3. Payment proofs are uploaded or received separately.
4. Each uploaded file becomes its own extraction job.
5. Each file gets its own LLM extraction call only when LLM extraction is needed.
6. The raw file, extracted JSON, normalized records, warnings, and metadata are stored locally in the project folder for the MVP.
7. Reconciliation runs later by reading stored invoice records, stored bank transactions, and stored payment proof records.

This makes the MVP closer to a real company workflow and prevents every test run from reprocessing all documents.

## Current Problem

The current UI and API are still shaped around a combined batch:

```text
Upload invoices
Upload bank statements
Upload payment proofs
Click Extract all files
Backend extracts all groups
Backend returns one combined response
```

This causes several issues:

- The user must upload all 3 categories every time.
- A new payment proof requires re-uploading or reprocessing invoice and bank statement files.
- Many files can trigger many LLM calls in one request.
- If one file fails because of provider rate limit or malformed JSON, the whole combined flow feels slow and fragile.
- Extracted results are returned to the browser but not stored as reusable extracted records.
- The flow does not represent production usage, where invoices and bank data already exist in company systems.

## Target Product Model

ReconPilot should treat invoices, bank statements, and payment proofs as separate source pipelines.

```text
Invoice ingestion pipeline
Bank statement ingestion pipeline
Payment proof ingestion pipeline
Reconciliation pipeline
```

Each pipeline stores records independently.

Reconciliation should not depend on one upload request. It should query stored records.

## Key Rule: One File, One Extraction Job

For the MVP, each uploaded file should become a separate extraction job.

```text
1 uploaded invoice file = 1 invoice extraction job
1 uploaded bank statement file = 1 bank statement extraction job
1 uploaded payment proof file = 1 payment proof extraction job
```

If the file needs an LLM, that file gets its own LLM call.

```text
file A -> LLM call A -> stored extraction A
file B -> LLM call B -> stored extraction B
file C -> LLM call C -> stored extraction C
```

This is better than bundling many files into one LLM call because:

- failures are isolated to one file
- retries are isolated to one file
- rate-limit backoff can be applied per file
- partial success can be stored
- users can upload one file at a time or batch many files
- stored results can be reused later

Important note: one-file-one-call does not reduce the total number of LLM calls by itself. It makes the work controllable, resumable, and cacheable. To reduce LLM calls, ReconPilot should also use deterministic parsers for structured CSV/XLSX/TXT where possible.

## Upload Modes

Each document category should support both one-by-one and batch upload.

### One-by-One Upload

Used when a single new document arrives.

Examples:

- One new invoice from ERP or manual upload.
- One daily bank statement file.
- One customer payment proof.

### Batch Upload

Used when importing many historical documents.

Examples:

- 50 invoices for May 2026.
- One bank statement CSV containing many rows.
- 20 payment proofs from email attachments.

Even in batch upload, each file is still stored and extracted separately.

```text
Batch upload: 10 payment proof files
Result: 10 stored documents + 10 extraction jobs + up to 10 LLM calls
```

## Local MVP Storage

For the MVP, we can store everything locally in the project folder instead of adding a real database immediately.

The current project already stores uploaded raw files under:

```text
runtime/uploads/
```

We should add extracted output storage under:

```text
runtime/extracted/
```

Recommended local folder structure:

```text
runtime/
  uploads/
    invoice/
    bank_statement/
    payment_proof/

  extracted/
    invoices/
      documents/
      extractions/
      normalized/
      jobs/

    bank_statements/
      documents/
      extractions/
      normalized/
      jobs/

    payment_proofs/
      documents/
      extractions/
      normalized/
      jobs/

    reconciliation_runs/
      runs/
      results/
      artifacts/
```

Alternative simpler structure:

```text
runtime/extracted/
  invoice/
  bank_statement/
  payment_proof/
  reconciliation/
```

The simpler structure is acceptable for the hackathon, but the more detailed one is easier to evolve into database tables later.

## Stored File Types

For every uploaded file, store the raw file first.

Example raw file metadata:

```json
{
  "documentId": "doc_abc123",
  "role": "payment_proof",
  "fileName": "proof-001.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 194222,
  "storageRef": {
    "kind": "local_path",
    "uri": "runtime/uploads/payment_proof/doc_abc123-proof-001.pdf"
  },
  "uploadedAt": "2026-05-25T00:00:00.000Z",
  "readableTextLength": 2048,
  "toolObservations": [
    "PDF text layer is available"
  ],
  "warnings": []
}
```

## Stored Extraction Job

Each file should create an extraction job.

Example:

```json
{
  "jobId": "job_abc123",
  "documentId": "doc_abc123",
  "role": "payment_proof",
  "status": "completed",
  "provider": "nvidia",
  "model": "meta/llama-3.3-70b-instruct",
  "selectedTool": "parse_pdf_text",
  "startedAt": "2026-05-25T00:00:02.000Z",
  "completedAt": "2026-05-25T00:00:18.000Z",
  "attempts": 1,
  "error": null
}
```

Possible statuses:

```text
queued
processing
completed
failed
manual_review
rate_limited
```

## Stored Raw Text

For every file, store the readable text used for extraction.

This helps because:

- We can debug bad LLM output.
- We can rerun extraction without rereading the original file.
- OCR/PDF parsing does not need to run again.
- The UI can show what evidence the agent saw.

Suggested path:

```text
runtime/extracted/payment_proofs/doc_abc123/raw_text.txt
```

## Stored Structured Extraction

Store the exact structured extraction response from the extraction agent.

Suggested path:

```text
runtime/extracted/payment_proofs/doc_abc123/extraction.json
```

Example:

```json
{
  "role": "payment_proof",
  "selectedTool": "parse_pdf_text",
  "confidence": 0.91,
  "summary": "Extracted SWIFT payment proof with upstream fee.",
  "invoices": [],
  "bankTransactions": [],
  "paymentProofs": [
    {
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
      "paymentStatus": "ACSC",
      "providerOrBankName": "Sender Bank",
      "exchangeRate": null
    }
  ],
  "warnings": []
}
```

## Stored Normalized Records

After extraction, store normalized records separately.

Suggested path:

```text
runtime/extracted/payment_proofs/doc_abc123/normalized.json
```

This should contain records that reconciliation can use directly.

## Invoice Ingestion Flow

### Production Flow

In production, invoices often come from ERP/accounting systems.

```text
ERP creates invoice
ERP sends invoice data to ReconPilot API
ReconPilot stores expected payment record
ReconPilot normalizes fields
No LLM required
```

Example production API:

```text
POST /api/invoices
```

Example payload:

```json
{
  "invoiceNumber": "INV-1001",
  "customerName": "ABC Inc.",
  "issueDate": "2026-05-20",
  "dueDate": "2026-05-30",
  "amountDue": {
    "value": "10.00",
    "currency": "USD"
  },
  "paymentReference": "INV-1001"
}
```

### MVP Upload Flow

For the MVP, invoices can also be uploaded.

```text
User uploads invoice file or invoice batch
Server stores raw file
Server extracts readable text
Server creates extraction job
Server calls deterministic parser or LLM
Server stores extracted JSON
Server stores normalized invoice record
UI shows stored result
```

Recommended MVP endpoint:

```text
POST /api/invoices/extractions
```

Allowed file types:

```text
PDF
image
XLSX
CSV
TXT
```

Markdown should not be supported in the UI or backend.

## Bank Statement Ingestion Flow

Bank statements should be ingested separately from invoices and payment proofs.

```text
User uploads bank statement file or batch
Server stores raw file
Server extracts readable text or rows
Server creates bank statement extraction job
Server parses rows
Server stores bank transactions
Server stores normalized bank transactions
```

Recommended MVP endpoint:

```text
POST /api/bank-statements/extractions
```

### Bank Statement Extraction Strategy

Use deterministic parsing first.

CSV/XLSX bank statements should normally not need LLM if they have clear columns:

```text
Date
Value Date
Description
Debit
Credit
Amount
Balance
Reference
```

LLM should be used when:

- the statement is a PDF with messy layout
- the statement is an image/scanned document
- columns are ambiguous
- FX/fee details are hidden in narration and code parser cannot extract them confidently

### Cross-Border Bank Statement Rule

For Malaysian SMEs, the bank statement is usually local currency only in the money columns.

Example:

```csv
Date,Description,Debit,Credit,Balance,Reference
2026-05-24,"TT INWARD FROM ABC INC USD10 @ 4.25 LESS RM0.50 FEE",,42.00,8420.55,TT20260524XYZ
```

The reliable value is:

```json
{
  "amount": {
    "value": "42.00",
    "currency": "MYR"
  }
}
```

Only extract source amount, FX rate, or bank fee if visible.

Do not invent:

```json
{
  "sourceAmount": null,
  "exchangeRateApplied": null,
  "bankFeeDeducted": null
}
```

Bank statement fee currency is usually MYR because it is deducted by the receiving Malaysian bank after conversion.

## Payment Proof Ingestion Flow

Payment proofs should be ingested separately.

```text
User uploads one proof or many proofs
Server stores raw file
Server extracts readable text or OCR
Server creates one extraction job per proof file
Server calls LLM for each proof file when needed
Server stores structured extraction
Server stores normalized proof record
```

Recommended MVP endpoint:

```text
POST /api/payment-proofs/extractions
```

### Payment Proof Extraction Strategy

Payment proofs are the most likely to need LLM because they can be:

- screenshots
- PDFs
- SWIFT MT103
- bank receipts
- remittance advice
- transfer confirmations
- email snippets saved as TXT

Payment proof fields should include:

```text
payerName
creditorName
paymentDate
paidAmount
grossAmount
feeAmount
feeCurrency
netAmount
reference
paymentStatus
providerOrBankName
exchangeRate
```

### Payment Proof Fee Rule

If an upstream or intermediary fee is deducted before conversion, that fee is usually in the transfer currency.

Example:

```text
Gross sent: USD 10.00
Intermediary fee: USD 0.25
Net sent: USD 9.75
```

Stored extraction:

```json
{
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
  }
}
```

## Reconciliation Flow

Reconciliation should be a separate process after ingestion.

```text
User selects period/customer/source batch
Server loads stored invoice records
Server loads stored bank transactions
Server loads stored payment proofs
Server runs matching logic
Server stores reconciliation run
Server stores reconciliation results
UI shows matches and review cases
```

Recommended endpoint:

```text
POST /api/reconciliation/runs
```

Possible request:

```json
{
  "fromDate": "2026-05-01",
  "toDate": "2026-05-31",
  "customerName": null
}
```

Possible result classes:

```text
AUTO_MATCHED
LIKELY_MATCHED
NEEDS_REVIEW
UNMATCHED
```

## UI Plan

The UI should have four main areas.

### 1. Invoices

Purpose:

```text
Upload/import invoices and store extracted invoice records.
```

Controls:

- file picker
- batch upload support
- extract button for invoice files only
- stored invoice table
- extraction status per file

Button text:

```text
Extract invoices
```

### 2. Bank Statements

Purpose:

```text
Upload/import bank statements and store extracted bank transactions.
```

Controls:

- file picker
- batch upload support
- extract button for bank statement files only
- stored bank transaction table
- extraction status per file

Button text:

```text
Extract bank statements
```

### 3. Payment Proofs

Purpose:

```text
Upload/import customer payment proofs and store extracted proof records.
```

Controls:

- file picker
- one-by-one upload support
- batch upload support
- extract button for payment proof files only
- stored proof table
- extraction status per file

Button text:

```text
Extract payment proofs
```

### 4. Reconciliation

Purpose:

```text
Run matching against stored data.
```

Controls:

- date range selector
- optional customer filter
- run reconciliation button
- results table
- review actions

Button text:

```text
Run reconciliation
```

## API Plan

### Separate Extraction APIs

Add:

```text
POST /api/invoices/extractions
POST /api/bank-statements/extractions
POST /api/payment-proofs/extractions
```

Each endpoint accepts one or many files for only that role.

Each endpoint returns:

```json
{
  "ingestionId": "ing_abc123",
  "role": "invoice",
  "uploadedAt": "2026-05-25T00:00:00.000Z",
  "documents": [],
  "extractions": [],
  "normalizedRecords": [],
  "storage": {
    "extractedPath": "runtime/extracted/invoices/ing_abc123"
  }
}
```

### Keep Combined Endpoint Temporarily

The current endpoint can remain temporarily:

```text
POST /api/reconciliation/extractions
```

But it should be considered legacy MVP compatibility.

The UI should move to separate endpoints.

## Local Storage Write Plan

For each ingestion request:

```text
Generate ingestionId
Create runtime/extracted/{role}/{ingestionId}/
Write documents.json
Write extractions.json
Write normalized.json
Write jobs.json
Write summary.json
```

Example:

```text
runtime/extracted/payment_proof/ing_20260525_abc123/
  documents.json
  raw_text/
    doc_001.txt
    doc_002.txt
  extractions.json
  normalized.json
  jobs.json
  summary.json
```

## Rate Limit Plan

Rate limits are expected with shared provider keys.

The system should handle this with:

1. One job per file.
2. Small concurrency limit.
3. Retry with backoff on 429.
4. Store failed job state.
5. Allow rerun failed jobs later.

Recommended MVP concurrency:

```text
1 or 2 LLM calls at a time
```

Recommended retry:

```text
attempt 1: immediate
attempt 2: wait 10 seconds
attempt 3: wait 30 seconds
then mark rate_limited/manual_review
```

For hackathon demo, it is better to be reliable than too parallel.

## Speed Plan

The fastest way to improve speed is not adding more agents. It is reducing unnecessary LLM calls.

Use this order:

```text
1. Read file locally
2. Try deterministic parser
3. If parser confidence is high, store parsed result and skip LLM
4. If parser confidence is low, call extraction agent
5. Store result
```

For CSV/XLSX:

```text
Prefer code parser
```

For image/scanned PDF:

```text
OCR + LLM
```

For payment proof:

```text
LLM likely needed
```

## Agent Model

The architecture should still be agentic, but not every step needs an LLM.

Recommended agents/modules:

```text
Intake Router
Extraction Agent
Code Tools Parser
Normalizer
Reconciliation Orchestrator
Artifact Generator
Human Review
```

### Intake Router

Decides:

- file type
- document role
- extraction path
- whether deterministic parser is enough
- whether LLM is needed

### Extraction Agent

Handles unstructured content.

One file goes to one extraction call.

### Code Tools Parser

Handles:

- CSV parsing
- XLSX parsing
- date normalization
- currency normalization
- amount normalization
- reference normalization

### Reconciliation Orchestrator

Reads stored records and matches:

- invoice
- payment proof
- bank transaction

It should use deterministic scoring first.

LLM can explain uncertain cases, but should not do money math.

## Important Product Rules

### Rule 1: Do Not Invent Missing Values

If a bank statement only shows MYR credit, source foreign amount should be null.

```json
{
  "sourceAmount": null,
  "exchangeRateApplied": null
}
```

### Rule 2: Payment Proof Fees and Bank Statement Fees Are Different

Payment proof upstream fee:

```text
Usually USD or transfer currency.
```

Bank statement local fee:

```text
Usually MYR for Malaysian receiving bank.
```

### Rule 3: Reconciliation Uses Stored Data

Do not force users to re-upload all source documents just to run matching again.

### Rule 4: Extraction Is Not Reconciliation

Extraction only extracts fields.

Reconciliation matches records later.

### Rule 5: Code Decides Money Math

LLM can extract and explain, but code should calculate:

- FX conversion
- fees
- tolerances
- score
- match classification

## Implementation Phases

### Phase 1: Local Extracted Storage

Add local storage writer.

Store:

- documents
- raw text
- extraction JSON
- normalized records
- jobs
- summary

No database yet.

### Phase 2: Separate APIs

Add:

```text
POST /api/invoices/extractions
POST /api/bank-statements/extractions
POST /api/payment-proofs/extractions
```

Each uses the same shared extraction service but passes one role.

### Phase 3: Separate UI Sections

Change UI from:

```text
Extract all files
```

to:

```text
Extract invoices
Extract bank statements
Extract payment proofs
```

Each section can be used independently.

### Phase 4: Stored Data Listing

Add local listing endpoints:

```text
GET /api/invoices/extractions
GET /api/bank-statements/extractions
GET /api/payment-proofs/extractions
```

The UI can show what has already been extracted.

### Phase 5: Reconciliation From Stored Records

Add:

```text
POST /api/reconciliation/runs
```

This reads stored local JSON and runs matching.

### Phase 6: Queue and Retry

Add:

- per-file jobs
- concurrency limit
- 429 retry/backoff
- failed job state
- rerun failed job

## MVP Acceptance Criteria

The implementation is correct when:

1. User can upload only invoices and extract/store them.
2. User can upload only bank statements and extract/store them.
3. User can upload only payment proofs and extract/store them.
4. User can upload one file or many files in each category.
5. Each file creates its own extraction job.
6. Each file that needs LLM extraction makes its own LLM call.
7. Extracted JSON is written to `runtime/extracted`.
8. Normalized records are written to `runtime/extracted`.
9. Re-running the UI does not require re-uploading already extracted documents.
10. Markdown is not listed or accepted as a supported upload type.
11. A provider failure for one file does not erase stored successful extractions for other files.
12. Reconciliation can be designed to read stored records instead of the original upload request.

## Future Database Migration

Local folder storage is an MVP substitute for a database.

Later, these folders map naturally to database tables:

```text
documents
extraction_jobs
invoice_records
bank_transactions
payment_proofs
reconciliation_runs
reconciliation_results
artifacts
```

When moving to a DB, keep the same conceptual flow:

```text
separate ingestion
stored records
reconciliation from stored records
```

Only the storage backend changes.

