# ReconPilot

ReconPilot is an agentic cross-border reconciliation prototype for the AI Marathon 2026 treasury problem statement.

The app lets a user upload invoices, bank statements, and payment proofs. It extracts structured payment data, normalizes records, stores local JSON runtime data, and runs a reconciliation workflow that explains matches, FX reasoning, discrepancies, and human-review actions.

## Current Capabilities

- AI-assisted extraction for PDFs, images, CSV, XLSX, and text files.
- Deterministic parsing and normalization for invoices, bank rows, payment proofs, names, dates, references, currencies, and amounts.
- Reconciliation against incoming credits and outgoing settlement or debit rows.
- FX reasoning using proof rate, bank-recorded or implied rate, invoice date, payment date, and bank date.
- Live Bank Negara Malaysia (BNM) FX lookup with local fixture fallback.
- Home-currency MYR previews for foreign amounts.
- Dashboard views for results, evidence, FX reasoning, agent timeline, trust and audit data, artifacts, and debugging.
- Local JSON output for inspection under `runtime/`.

## System Requirements

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | 20.9 or newer | Required by Next.js 16. Node 22 also works. |
| npm | 10 or newer | Ships with current Node.js releases. |
| Operating system | Windows, macOS, or Linux | Developed on Windows 11 with PowerShell. |
| Network access | Required for install and best runtime results | `xlsx` installs from the SheetJS CDN; AI extraction and live FX lookup call external APIs. |

No database is required. Runtime state is stored in local JSON files under `runtime/`.

## Main Dependencies

Dependencies are installed automatically from `package.json`, but the most important ones are:

- `next`, `react`, and `react-dom` for the application framework and UI.
- `zod` for schema validation.
- `pdf-parse` for PDF text extraction.
- `tesseract.js` and `@tesseract.js-data/eng` for OCR.
- `read-excel-file` and `xlsx` for spreadsheet parsing.
- `papaparse` for CSV parsing.
- `date-fns` for date normalization.
- `vitest`, `typescript`, and `tsx` for testing and developer tooling.

## Local Setup

### 1. Clone or open the project

From this repository, move into the Next.js app directory:

```powershell
cd the-global-treasury-agent
```

If you already opened a terminal inside `the-global-treasury-agent`, you can skip this step.

### 2. Install dependencies

Use `npm ci` when `package-lock.json` is present and you want a reproducible install:

```powershell
npm ci
```

If you are actively changing dependencies, use:

```powershell
npm install
```

Note: the `xlsx` package is pinned to a SheetJS CDN tarball. If install fails while fetching `xlsx`, confirm that your machine can reach `https://cdn.sheetjs.com/`.

### 3. Configure environment variables

Create a `.env.local` file in the project root:

```powershell
New-Item -ItemType File .env.local
```

Do not commit `.env.local`. It is ignored by Git.

ReconPilot supports three OpenAI-compatible LLM providers. Choose one provider and add the matching variables.

#### Option A: Morpheus

```env
LLM_PROVIDER=morpheus
MORPHEUS_API_KEY=replace_with_your_morpheus_key
MORPHEUS_BASE_URL=https://api.mor.org/api/v1
MORPHEUS_MODEL=llama-3.3-70b
```

#### Option B: NVIDIA

```env
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=replace_with_your_nvidia_key
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=meta/llama-3.3-70b-instruct
```

#### Option C: Chutes

```env
LLM_PROVIDER=chutes
CHUTES_API_KEY=replace_with_your_chutes_key
CHUTES_BASE_URL=https://llm.chutes.ai/v1
CHUTES_MODEL=default:latency
```

Optional retry setting:

```env
LLM_MAX_ATTEMPTS=6
```

If `LLM_PROVIDER` is not set, the app auto-detects a provider from available keys. It checks Morpheus first, then Chutes when no NVIDIA key is present, and otherwise falls back to NVIDIA.

Restart the dev server after editing `.env.local`; environment variables are read at server startup.

### 4. Run the application locally

Start the Next.js development server:

```powershell
npm run dev
```

Open the app in your browser:

```text
http://localhost:3000
```

### 5. Use the reconciliation workflow

1. Upload invoice files in the **Invoices** panel and run extraction.
2. Upload the bank statement in the **Bank Statements** panel and run extraction.
3. Upload payment proofs in the **Payment Proofs** panel and run extraction.
4. Uploading a payment proof triggers reconciliation automatically.
5. Review the **Reconciliation Results** table.
6. Click a result row to inspect Overview, Evidence, FX Reasoning, Agent Timeline, Trust & Audit, and Artifacts.
7. Use `/debug` to inspect generated runtime JSON paths and clear local demo data.

## Available Scripts

```powershell
npm run dev        # Start the local Next.js dev server
npm run typecheck  # Run TypeScript checks
npm test           # Run Vitest tests
npm run build      # Create a production build
npm start          # Start the production server after a successful build
```

If npm command shims fail on Windows, run the binaries through Node directly:

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\vitest\vitest.mjs run --globals
node .\node_modules\next\dist\bin\next build
```

## Runtime Data

The app writes local runtime artifacts under:
(Use the dashboard/debug clear action before rerunning a full demo dataset.)

```text
runtime/
```

This directory may contain extracted records, reconciliation outputs, audit action records, and generated artifacts. It is ignored by Git and can be cleared between demo runs.

## Troubleshooting

- Missing API key: confirm `.env.local` contains the key for the selected `LLM_PROVIDER`.
- Provider changes not taking effect: stop and restart `npm run dev`.
- Install fails on `xlsx`: confirm network access to the SheetJS CDN.
- OCR is slow on first run: the English OCR model may need to download or warm its local cache.
- Live FX lookup fails: the app can use local fallback FX fixtures, but online access gives better results.

## Notes

- `.env.local`, `.env`, `runtime/`, `.next/`, `node_modules/`, TypeScript build info, and OCR model files are ignored by Git.
- Human-review actions currently save local audit JSON records. They do not yet perform a full accounting-system approval workflow.
- This is a hackathon MVP, so the parser works best with the provided demo formats. Additional bank or invoice templates should be added with matching parser rules and tests.
