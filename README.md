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
- FX reasoning using proof rate, bank-recorded/implied rate, invoice date, payment date, and bank date, with a live Bank Negara Malaysia (BNM) rate provider plus a local fixture fallback.
- Home-currency (MYR) preview shown beneath foreign amounts, converted at the rate the engine actually selected.
- Dashboard with reconciliation results, evidence, FX reasoning, agent timeline, trust & audit, artifacts, and a debug console.
- Local JSON output for debugging under `runtime/extracted/`.

---

## System Requirements

### Runtime / tooling

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | **20.9 or newer** (LTS recommended) | Required by Next.js 16. Node 22 also works. |
| **npm** | 10+ (ships with Node) | Or a compatible package manager. |
| **OS** | Windows (PowerShell), macOS (Terminal), or Linux | Developed and tested on Windows 11 / PowerShell. |

### Network access

- **During `npm install`** — the `xlsx` dependency is pinned to the official SheetJS CDN tarball (`https://cdn.sheetjs.com/...`), not the npm registry. Your machine must be able to reach `cdn.sheetjs.com` when installing.
- **At runtime** — AI extraction calls go to your configured LLM provider's API, and live FX lookups go to the Bank Negara Malaysia public API. Both gracefully degrade (extraction falls back to manual correction; FX falls back to a local fixture table) but work best online.

### Key dependencies (installed via npm)

These are pulled in automatically by `npm install`; listed here so you know what powers each feature:

- **next** 16, **react** / **react-dom** 19 — app framework and UI.
- **zod** 3 — schema validation for all extracted records.
- **pdf-parse** — PDF text-layer extraction.
- **tesseract.js** + **@tesseract.js-data/eng** — OCR for images and scanned PDFs (English model is downloaded/cached on first use; no system Tesseract install needed).
- **read-excel-file** and **xlsx** (SheetJS, patched 0.20.3 via CDN) — spreadsheet parsing.
- **papaparse** — CSV parsing.
- **date-fns** — date normalization.
- **vitest** 3, **typescript** 5.8, **tsx** — testing and type tooling.

No database is required — all state is written to local JSON files under `runtime/`.

---

## 1. Install

From the project root:

```powershell
npm install
```

> If this fails on the `xlsx` step, it is almost always a network issue reaching `cdn.sheetjs.com`. Re-run once you have access.

## 2. Configure (LLM provider)

Create a `.env.local` file in the project root. **Do not commit this file** — it is gitignored.

ReconPilot supports three OpenAI-compatible providers. Only **one is active at a time**, selected by `LLM_PROVIDER`. If `LLM_PROVIDER` is unset, the app auto-detects: it prefers **Morpheus** when `MORPHEUS_API_KEY` is present, otherwise falls back to a previously-configured provider.

### Option A — Morpheus (default / recommended)

```env
LLM_PROVIDER=morpheus
MORPHEUS_API_KEY=replace_with_your_morpheus_key
MORPHEUS_BASE_URL=https://api.mor.org/api/v1
MORPHEUS_MODEL=gpt-oss-120b
```

Get a key at <https://app.mor.org/api-keys?create=true>. `gpt-oss-120b` is the recommended model (strong instruction-following, returns clean JSON). Avoid "thinking/reasoning" models — they can return empty content and break extraction.

### Option B — NVIDIA

```env
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=replace_with_your_nvidia_key
NVIDIA_MODEL=meta/llama-3.3-70b-instruct
```

### Option C — Chutes

```env
LLM_PROVIDER=chutes
CHUTES_API_KEY=replace_with_your_chutes_key
CHUTES_MODEL=default:latency
```

### Optional setting

```env
# Total attempts per LLM call, including the first (handles rate limits / transient errors).
LLM_MAX_ATTEMPTS=6
```

> Environment variables are read at **server startup**. Restart the dev server after editing `.env.local`.

## 3. Run locally

```powershell
npm run dev
```

Then open:

```text
http://localhost:3000
```

### Recommended manual flow

1. Upload invoice files in the **Invoices** panel and run extraction.
2. Upload the bank statement in the **Bank Statements** panel and run extraction.
3. Upload payment proofs in the **Payment Proofs** panel and run extraction.
4. Uploading a payment proof triggers reconciliation automatically.
5. Review the **Reconciliation Results** table.
6. Click a result row to inspect Overview, Evidence, FX Reasoning, Agent Timeline, Trust & Audit, and Artifacts.

---

## Test, Type-check, and Build

```powershell
npm run typecheck   # tsc --noEmit
npm test            # vitest run --globals
npm run build       # next build
```

If the npm command shims fail on Windows, run the binaries through Node directly:

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\vitest\vitest.mjs run --globals
node .\node_modules\next\dist\bin\next build
```

## Clear Demo Data

Use the dashboard/debug clear action before rerunning a full demo dataset. Runtime data is stored locally under:

```text
runtime/extracted/
```

## Notes

- `.env.local`, `runtime/`, `.next/`, `node_modules/`, and OCR model files are ignored by Git.
- Human-review buttons currently save local audit action JSON records; they do not yet perform a full accounting-system approval workflow.
- The project is a hackathon MVP, so the parser supports the provided demo formats best. More bank/invoice templates require more parser rules and tests.
