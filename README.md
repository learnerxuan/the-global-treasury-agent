# ReconPilot

ReconPilot is an agentic cross-border reconciliation prototype for the AI Marathon 2026 treasury problem statement.

It lets a user upload:

- invoices / expected payment records
- local bank statements
- payment proofs / transfer receipts

The system extracts structured fields, normalizes records, stores waiting JSON records, then triggers Agent 2 when payment proofs arrive. Agent 2 matches payment proofs against invoices and bank statement rows, explains FX reasoning, generates reconciliation/discrepancy artifacts, and exposes human-review actions.

## Current Capabilities

- AI-assisted extraction for PDFs, images, CSV, XLSX, and text files.
- Deterministic parsing and normalization for invoices, bank rows, payment proofs, names, dates, references, currencies, and amounts.
- Reconciliation against both incoming credits and outgoing settlement/debit rows.
- FX reasoning using proof rate, bank-recorded/implied rate, invoice date, payment date, and bank date.
- Dashboard with reconciliation results, evidence, FX reasoning, agent timeline, artifacts, and debug console.
- Local JSON output for debugging under `runtime/extracted/`.

## System Requirements

- Node.js 20 or newer.
- npm.
- Windows PowerShell, macOS Terminal, or a Linux shell.
- Internet access for AI extraction calls.
- An API key for one supported LLM provider:
  - NVIDIA API key for the current default setup, or
  - Chutes API key when the sponsor account is available.

## Install

```powershell
npm install
```

## Configure

Create a `.env.local` file in the project root. Do not commit this file.

For NVIDIA:

```env
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=replace_with_your_nvidia_key
NVIDIA_MODEL=meta/llama-3.3-70b-instruct
```

For Chutes:

```env
LLM_PROVIDER=chutes
CHUTES_API_KEY=replace_with_your_chutes_key
CHUTES_MODEL=default:latency
```

Optional retry setting:

```env
LLM_MAX_ATTEMPTS=4
```

Restart the dev server after changing `.env.local`; environment variables are loaded at server startup.

## Run Locally

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

Recommended manual flow:

1. Upload invoice files in the Invoices panel and run extraction.
2. Upload the bank statement in the Bank Statements panel and run extraction.
3. Upload payment proofs in the Payment Proofs panel and run extraction.
4. Payment proof upload triggers reconciliation automatically.
5. Review the Reconciliation Results table.
6. Click a result row to inspect overview, evidence, FX reasoning, agent timeline, and artifacts.
7. Use `/debug` or the Debug link to inspect generated JSON paths.

## Clear Demo Data

Use the dashboard/debug clear action before rerunning a full demo dataset. Runtime data is stored locally under:

```text
runtime/extracted/
```

Do not commit runtime output.

## Test And Build

```powershell
npm run typecheck
npm test
npm run build
```

If npm command shims fail on Windows, run the binaries through Node directly:

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\vitest\vitest.mjs run --globals
node .\node_modules\next\dist\bin\next build
```

## Test Data

Sample datasets are included:

- `test_sample_1/`
- `test_sample_cross_border/`

The `test_sample_cross_border/` set includes 3 invoices, 3 payment proofs, and a Maybank XLSX statement with 8 rows.

## Notes

- `.env.local`, `runtime/`, `.next/`, `node_modules/`, and OCR model files are ignored by Git.
- Human-review buttons currently save local audit action JSON records; they do not yet perform a full accounting-system approval workflow.
- The project is a hackathon MVP, so the parser supports the provided demo formats best. More bank/invoice templates require more parser rules and tests.
