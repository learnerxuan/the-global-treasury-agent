# ReconPilot Extraction Agent Plan

Status: ready for implementation after schema contract  
Owner: solo developer  
Stack: Next.js App Router, TypeScript, Zod, Vitest  
Scope: architecture block 2 only  
Date: 2026-05-23

## Purpose

This file defines the implementation plan for **Agent 1: Extraction Agent**.

The schema contract is in:

[INPUT_PLAN.md](INPUT_PLAN.md)

The Agent 1 to Code Tools teammate handoff guide is in:

[AGENT_1_TO_CODE_TOOLS_HANDOFF_GUIDE.md](AGENT_1_TO_CODE_TOOLS_HANDOFF_GUIDE.md)

Agent 1 should not perform reconciliation. Its only job is:

> Turn messy payment proof files into ISO 20022-aligned structured JSON, with confidence, evidence, and review warnings.

## Agent Boundary

Agent 1 can:

- inspect proof file metadata;
- decide which extraction tool to call;
- call one extraction tool;
- assemble `PaymentProofExtractionOutput`;
- attach evidence spans;
- flag manual review;
- write timeline events.

Agent 1 cannot:

- match proof to invoice;
- match proof to bank transaction;
- fetch FX rates;
- decide whether a payment is reconciled;
- generate accounting entries;
- generate final reconciliation reports.

## Agent Loop

```text
goal
-> observe payment proof descriptor
-> choose extraction tool
-> call tool
-> observe extracted fields
-> assemble structured JSON
-> validate schema
-> decide whether manual review is required
-> return output + timeline
```

## Extraction Routes

| Situation | Tool |
| --- | --- |
| PDF has text layer | `parse_pdf_text` |
| Plain text proof with file text content | `parse_pdf_text` |
| PDF likely contains tables | `parse_pdf_table` |
| Image or scanned proof | `parse_image_ocr` |
| Low-quality, unknown, or ambiguous proof | `manual_correction` |

Route priority:

1. If low quality or unreadable, use `manual_correction`.
2. If PDF has table signal, use `parse_pdf_table`.
3. If PDF has text layer, use `parse_pdf_text`.
4. If `mimeType` is `text/plain`, use `parse_pdf_text`.
5. If image, use `parse_image_ocr`.
6. Otherwise, use `manual_correction`.

For hackathon speed, keep the `parse_pdf_text` route name. It handles text-layer PDFs and plain text proof files.

## Recommended File Structure

```text
src/lib/recon/extraction/tools.ts
src/lib/recon/extraction/parse-pdf-text.ts
src/lib/recon/extraction/parse-pdf-table.ts
src/lib/recon/extraction/parse-image-ocr.ts
src/lib/recon/extraction/manual-correction.ts
src/lib/recon/extraction/extraction-agent.ts
src/lib/recon/timeline.ts
src/scripts/run-extraction-demo.ts
```

## Tool Result Shape

```ts
type ExtractionToolResult = {
  route: "parse_pdf_text" | "parse_pdf_table" | "parse_image_ocr" | "manual_correction";
  rawText: string | null;
  candidateFinancialPayload: Partial<PaymentProofExtractionOutput["financialPayload"]>;
  fieldConfidence: Record<string, number>;
  evidenceSpans: FieldEvidence[];
  warnings: Warning[];
};
```

## Agent Output Shape

Agent 1 returns:

```ts
type ExtractionAgentResult = {
  extraction: PaymentProofExtractionOutput;
  timeline: TimelineEvent[];
};
```

## Timeline Event Shape

```ts
type TimelineEvent = {
  id: string;
  timestamp: string;
  agent: "Extraction Agent" | "Code Tools";
  action: string;
  toolName?: "parse_pdf_text" | "parse_pdf_table" | "parse_image_ocr" | "manual_correction";
  inputSummary: string;
  resultSummary: string;
  reasoning: string;
  observedConfidence?: number;
  warnings: Warning[];
};
```

Example:

```json
{
  "id": "timeline_001",
  "timestamp": "2026-05-23T08:30:00.000Z",
  "agent": "Extraction Agent",
  "action": "Selected extraction route",
  "toolName": "parse_pdf_text",
  "inputSummary": "wise-transfer-inv-1001.pdf has a PDF text layer and no table signal",
  "resultSummary": "Using embedded text extraction before OCR",
  "reasoning": "Text-layer PDFs provide cleaner field evidence than OCR for this proof type.",
  "observedConfidence": 0.96,
  "warnings": []
}
```

## Manual Review Rules

Set `aiMetadata.requiresManualReview` to `true` when:

- overall confidence is below `0.85`;
- paid amount is missing;
- payment date is missing;
- both reference and invoice IDs are missing;
- debtor is missing;
- creditor is missing;
- payment status is rejected, cancelled, pending, or unknown;
- extraction route is `manual_correction`;
- explicit FX data is contradictory;
- source and target amounts exist but imply an unreasonable rate.

## Build Order

### Step 1: Implement Tool Interfaces

Files:

- `src/lib/recon/extraction/tools.ts`

Define:

- `ExtractionToolResult`
- `ExtractionRoute`
- shared helper types

### Step 2: Implement Real File Extraction Tools With Fixture Fallbacks

#### Step 2 File Structure Lock

Create:

- `src/lib/recon/extraction/fixtures.ts` - deterministic fallback descriptors and expected route metadata for tests and emergency demo fallback only.
- `src/lib/recon/extraction/fixtures.test.ts` - fallback fixture coverage for all required routes.
- `src/lib/recon/extraction/extract-payment-fields.ts` - deterministic fixture parsing helpers for money, dates, invoice IDs, status, parties, and FX.
- `src/lib/recon/extraction/extract-payment-fields.test.ts` - helper unit tests.
- `src/lib/recon/extraction/evidence.ts` - evidence span and warning builders used by all tools.
- `src/lib/recon/extraction/evidence.test.ts` - builder unit tests.
- `src/lib/recon/extraction/read-proof-source.ts` - shared file reader that loads actual uploaded proof content before falling back to `demoFixture`.
- `src/lib/recon/extraction/read-proof-source.test.ts` - file reader tests for real files and fallback mode.
- `src/lib/recon/extraction/parse-pdf-text.ts` - real text-layer PDF/plain text extraction tool with fixture fallback.
- `src/lib/recon/extraction/parse-pdf-text.test.ts` - text PDF tool tests.
- `src/lib/recon/extraction/parse-pdf-table.ts` - real PDF table extraction tool with fixture fallback.
- `src/lib/recon/extraction/parse-pdf-table.test.ts` - table PDF tool tests.
- `src/lib/recon/extraction/parse-image-ocr.ts` - real image OCR/vision extraction tool with fixture fallback.
- `src/lib/recon/extraction/parse-image-ocr.test.ts` - image OCR tool tests.
- `src/lib/recon/extraction/manual-correction.ts` - manual correction fallback tool.
- `src/lib/recon/extraction/manual-correction.test.ts` - manual correction tool tests.
- `src/lib/recon/extraction/tools.contract.test.ts` - cross-tool contract and boundary tests.

Modify:

- `src/lib/recon/extraction/tools.ts` - export the concrete tool registry without moving Agent 1 routing logic into the tools.

Prerequisite files from the schema contract and Agent 1 Step 1:

- `src/lib/recon/schemas.ts`
- `src/lib/recon/types.ts`
- `src/lib/recon/extraction/tools.ts`

Do not start Step 2 until `INPUT_PLAN.md` schemas/types and Agent 1 Step 1 tool interfaces compile successfully. If `src/lib/recon/schemas.ts`, `src/lib/recon/types.ts`, or `src/lib/recon/extraction/tools.ts` do not exist or do not compile, stop with `NEEDS_CONTEXT` and implement `INPUT_PLAN.md` plus Agent 1 Step 1 first. Do not duplicate schema or tool interface types inside Step 2 files.

#### Step 2 Boundaries

- This plan assumes `PaymentProofInputDescriptor` extends the general `InputFileDescriptor` from `INPUT_PLAN.md`. Required inherited fields: `parseStatus`, `uploadedAt`, and `warnings`. Required real-file locator: `storageRef`. Optional fallback field: `demoFixture`.
- The primary demo path must read actual uploaded proof files from `descriptor.storageRef`. Do not make the main demo depend on pre-filled `demoFixture` content.
- `demoFixture` is allowed only for tests, offline development, and emergency fallback when the real file cannot be read. Do not put `rawText`, `rawTable`, or `rawOcr` directly on the descriptor.
- Tools return `ExtractionToolResult`, not final `PaymentProofExtractionOutput`.
- Tools extract raw fields only. They must not normalize references, normalize party names, score candidates, fetch FX rates, classify matches, or write reconciliation artifacts.
- Demo extraction must be real-file-backed: PDF tools read actual PDF/plain text file bytes, and image tools run OCR/vision over the actual proof image or rendered PDF page. Fallback fixture extraction must be visible in warnings and timeline events when used.
- Money values remain decimal strings.
- Missing fields are represented as `null` and warnings, never invented values.
- For `FieldEvidence`, `normalizedValue` must stay `null` for debtor, creditor, reference, and invoice ID fields because deterministic code normalizes those later. `normalizedValue` may be set for low-level parsing only, such as money formatting (`"USD 10.00"` -> `"10.00"`) or date formatting, because that is extraction cleanup rather than reconciliation normalization.
- `exchangeRateInformation` is populated only when explicit FX appears in the proof or when source and target amounts allow a clearly labelled `IMPLIED` rate.

#### Step 2 Detailed Tasks

```xml
<task id="1" depends="" type="auto">
  <name>Create proof descriptors and fallback fixtures for all extraction routes</name>
  <files>
    <create>src/lib/recon/extraction/fixtures.ts</create>
    <test>src/lib/recon/extraction/fixtures.test.ts</test>
  </files>
  <read_first>
    INPUT_PLAN.md
    EXTRACTION_AGENT_PLAN.md
  </read_first>
  <action>
    Create route fixtures for the Step 2 tools. Export `proofToolFixtures` with exactly four records. Each fixture must include a `storageRef` pointing to a real proof file path under `src/lib/recon/fixtures/proofs/` and a matching `demoFixture` fallback for tests.

    1. `textPdfProof`: `expectedRoute` is `parse_pdf_text`; descriptor file name `wise-transfer-inv-1001.pdf`; MIME type `application/pdf`; `textLayer: true`; `tableLikely: false`; `imageQuality: "high"`; `demoFixture.rawText` contains `Wise transfer receipt. Paid USD 10.00 to ReconPilot Sdn Bhd. Reference INV-1001. Exchange rate: 1 USD = 4.2500 MYR. Date 2026-05-20. Status: Paid. Payer: Acme Pte Ltd. Transaction ID: WISE-TRX-88291.`
    2. `tablePdfProof`: `expectedRoute` is `parse_pdf_table`; descriptor file name `bank-advice-inv-1002.pdf`; MIME type `application/pdf`; `textLayer: true`; `tableLikely: true`; `imageQuality: "high"`; `demoFixture.rawTable` contains key-value rows for payer `Beta Exports Ltd`, beneficiary `ReconPilot Sdn Bhd`, amount `SGD 250.00`, target amount `MYR 875.00`, reference `INV-1002`, payment date `2026-05-21`, status `Completed`, bank `DBS`.
    3. `imageOcrProof`: `expectedRoute` is `parse_image_ocr`; descriptor file name `scanned-slip-inv-1003.png`; MIME type `image/png`; `textLayer: false`; `tableLikely: false`; `imageQuality: "medium"`; `demoFixture.rawOcr` contains `TRANSFER RECEIPT PAID USD 200.00 REF INV-1003 DATE 2026-05-22 SENDER Gamma Trading BENEFICIARY ReconPilot`.
    4. `manualCorrectionProof`: `expectedRoute` is `manual_correction`; descriptor file name `blurred-proof-unknown.jpg`; MIME type `image/jpeg`; `textLayer: false`; `tableLikely: false`; `imageQuality: "low"`; `demoFixture.rawOcr` is `null`.

    Each descriptor must use `inputKind: "payment_proof"`, `schemaVersion: "1.0.0"`, `parseStatus: "PENDING"`, `uploadedAt: "2026-05-23T18:31:00+08:00"`, `sizeBytes` as a non-null positive number, `storageRef` as the real proof file locator, and `warnings: []`.
  </action>
  <test_code>
    import { describe, expect, it } from "vitest";
    import { proofToolFixtures } from "./fixtures";

    describe("proofToolFixtures", () => {
      it("covers every Agent 1 Step 2 extraction route", () => {
        const routes = proofToolFixtures.map((fixture) => fixture.expectedRoute).sort();
        expect(routes).toEqual([
          "manual_correction",
          "parse_image_ocr",
          "parse_pdf_table",
          "parse_pdf_text",
        ]);
      });

      it("keeps fallback fixture content under demoFixture and real file location under storageRef", () => {
        for (const fixture of proofToolFixtures) {
          expect(fixture.descriptor.inputKind).toBe("payment_proof");
          expect(fixture.descriptor.storageRef).toBeDefined();
          expect(fixture.descriptor.demoFixture).toBeDefined();
          expect("rawText" in fixture.descriptor).toBe(false);
          expect("rawTable" in fixture.descriptor).toBe(false);
          expect("rawOcr" in fixture.descriptor).toBe(false);
        }
      });

      it("marks the manual correction fixture as low quality", () => {
        const fixture = proofToolFixtures.find((item) => item.expectedRoute === "manual_correction");
        expect(fixture?.descriptor.fileName).toBe("blurred-proof-unknown.jpg");
        expect(fixture?.descriptor.imageQuality).toBe("low");
      });
    });
  </test_code>
  <verify>
    npm exec vitest run src/lib/recon/extraction/fixtures.test.ts
    npm exec tsc -- --noEmit
  </verify>
  <done>Proof descriptors exist for parse_pdf_text, parse_pdf_table, parse_image_ocr, and manual_correction with real file storageRef values and fallback content nested under demoFixture.</done>
  <commit>feat(extraction): add proof tool fixtures</commit>
</task>

<task id="2" depends="1" type="auto">
  <name>Create real proof source reader with fixture fallback</name>
  <files>
    <create>src/lib/recon/extraction/read-proof-source.ts</create>
    <test>src/lib/recon/extraction/read-proof-source.test.ts</test>
  </files>
  <read_first>
    INPUT_PLAN.md
    src/lib/recon/extraction/fixtures.ts
    src/lib/recon/types.ts
  </read_first>
  <action>
    Create `readProofSource(descriptor)` as the only place Step 2 tools read proof content.

    It must:

    - read actual uploaded proof files from `descriptor.storageRef`;
    - support local file paths for demo fixtures;
    - return source metadata: `{ mode: "real_file" | "fixture_fallback"; fileName; mimeType; bytes?; text?; fallbackReason? }`;
    - use `descriptor.demoFixture` only when the real file is missing, unreadable, or intentionally unavailable in unit tests;
    - emit a `LOW_QUALITY_PROOF` or read-warning object when fallback mode is used;
    - never silently prefer `demoFixture` when `storageRef` points to a readable file.

    Do not parse financial fields in this reader. It only loads source content for route-specific tools.
  </action>
  <test_code>
    import { describe, expect, it } from "vitest";
    import { proofToolFixtures } from "./fixtures";
    import { readProofSource } from "./read-proof-source";

    describe("readProofSource", () => {
      it("prefers real files over demoFixture fallback when storageRef is readable", async () => {
        const fixture = proofToolFixtures.find((item) => item.expectedRoute === "parse_pdf_text");
        const result = await readProofSource(fixture!.descriptor);
        expect(result.mode).toBe("real_file");
        expect(result.fileName).toBe(fixture!.descriptor.fileName);
      });

      it("uses demoFixture only as explicit fallback when real file cannot be read", async () => {
        const fixture = proofToolFixtures.find((item) => item.expectedRoute === "parse_pdf_text")!;
        const result = await readProofSource({
          ...fixture.descriptor,
          storageRef: {
            kind: "local_path",
            uri: "missing/proof.pdf",
            sha256: null,
          },
        });
        expect(result.mode).toBe("fixture_fallback");
        expect(result.fallbackReason).toContain("missing/proof.pdf");
      });
    });
  </test_code>
  <verify>
    npm exec vitest run src/lib/recon/extraction/read-proof-source.test.ts
    npm exec tsc -- --noEmit
  </verify>
  <done>readProofSource reads actual proof files first and uses demoFixture only as explicit fallback with observable metadata.</done>
  <commit>feat(extraction): add real proof source reader</commit>
</task>

<task id="3" depends="1,2" type="auto">
  <name>Create deterministic field extraction helpers</name>
  <files>
    <create>src/lib/recon/extraction/extract-payment-fields.ts</create>
    <test>src/lib/recon/extraction/extract-payment-fields.test.ts</test>
  </files>
  <read_first>
    src/lib/recon/extraction/fixtures.ts
    src/lib/recon/types.ts
  </read_first>
  <action>
    Create pure helper functions used by real extraction tools after they obtain text/table/OCR output:

    - `extractMoney(text, preferredCurrency?)` returns `{ value, currency, original } | null` and accepts only `MYR`, `USD`, `SGD`, and `EUR`.
    - `extractDate(text)` returns a `YYYY-MM-DD` string or `null`.
    - `extractInvoiceIds(text)` returns invoice IDs matching `INV-` followed by digits, deduplicated.
    - `extractReference(text)` returns `{ raw }` using the first invoice ID when present, otherwise `null`.
    - `extractPaymentStatus(text)` maps `Paid`, `Completed`, and `Settled` to `ACSC`; `Pending` to `PNDG`; `Rejected` to `RJCT`; otherwise `UNKNOWN`.
    - `extractProviderOrBankName(text)` recognizes `Wise`, `DBS`, and `Maybank`; otherwise `null`.
    - `extractFxRate(text)` recognizes `1 USD = 4.2500 MYR` style explicit rates and returns an `ExchangeRateInformation` object with `rateType: "AGREED"` and `source: "payment_proof"`.
    - `computeImpliedFx(sourceAmount, targetAmount)` returns `ExchangeRateInformation` with `rateType: "IMPLIED"` and `source: "computed_implied"` only when both amounts exist and the source value is greater than zero.
    - `tableToText(rawTable)` flattens string table rows into a newline-separated string while preserving row values.

    Keep these helpers deterministic. Do not normalize references or party names; only extract raw values.
  </action>
  <test_code>
    import { describe, expect, it } from "vitest";
    import {
      computeImpliedFx,
      extractDate,
      extractFxRate,
      extractInvoiceIds,
      extractMoney,
      extractPaymentStatus,
      tableToText,
    } from "./extract-payment-fields";

    describe("extract-payment-fields", () => {
      it("extracts decimal-string money without using floats in the returned value", () => {
        expect(extractMoney("Paid USD 10.00 to beneficiary")).toEqual({
          value: "10.00",
          currency: "USD",
          original: "USD 10.00",
        });
      });

      it("extracts dates and invoice ids", () => {
        expect(extractDate("Date 2026-05-20 Reference INV-1001")).toBe("2026-05-20");
        expect(extractInvoiceIds("INV-1001 and INV-1001 plus INV-1002")).toEqual([
          "INV-1001",
          "INV-1002",
        ]);
      });

      it("maps settled proof status to ACSC", () => {
        expect(extractPaymentStatus("Status: Completed")).toBe("ACSC");
        expect(extractPaymentStatus("Status: Pending")).toBe("PNDG");
        expect(extractPaymentStatus("No status visible")).toBe("UNKNOWN");
      });

      it("extracts explicit FX information when present", () => {
        expect(extractFxRate("Exchange rate: 1 USD = 4.2500 MYR")).toMatchObject({
          unitCurrency: "USD",
          quotedCurrency: "MYR",
          exchangeRate: "4.2500",
          rateType: "AGREED",
          source: "payment_proof",
        });
      });

      it("computes implied FX only when both amounts exist", () => {
        const implied = computeImpliedFx(
          { value: "250.00", currency: "SGD" },
          { value: "875.00", currency: "MYR" },
        );
        expect(implied).toMatchObject({
          unitCurrency: "SGD",
          quotedCurrency: "MYR",
          exchangeRate: "3.5000",
          rateType: "IMPLIED",
          source: "computed_implied",
        });
      });

      it("flattens raw table rows into searchable text", () => {
        expect(tableToText([["Reference", "INV-1002"], ["Amount", "SGD 250.00"]])).toContain("INV-1002");
      });
    });
  </test_code>
  <verify>
    npm exec vitest run src/lib/recon/extraction/extract-payment-fields.test.ts
    npm exec tsc -- --noEmit
  </verify>
  <done>Deterministic helper functions extract raw payment fields, explicit FX, and implied FX from fixture text and tables.</done>
  <commit>feat(extraction): add deterministic payment field helpers</commit>
</task>

<task id="4" depends="1" type="auto">
  <name>Create evidence span and warning builders</name>
  <files>
    <create>src/lib/recon/extraction/evidence.ts</create>
    <test>src/lib/recon/extraction/evidence.test.ts</test>
  </files>
  <read_first>
    INPUT_PLAN.md
    src/lib/recon/types.ts
  </read_first>
  <action>
    Create helper builders:

    - `createWarning(code, message, field)` returns a `Warning`.
    - `createEvidenceSpan(input)` returns a `FieldEvidence` with defaults `page: null`, `bbox: null`, and `warnings: []`.
    - `missingFieldWarning(field, message)` returns a warning with a schema warning code appropriate for the missing field: `MISSING_PAID_AMOUNT`, `MISSING_PAYMENT_DATE`, `MISSING_PAYMENT_REFERENCE`, `MISSING_DEBTOR`, or `MISSING_CREDITOR`.
    - `lowQualityProofWarning(message)` returns `LOW_QUALITY_PROOF` with `field: null`.
    - `lowConfidenceWarning(field, confidence)` returns `LOW_CONFIDENCE_EXTRACTION`.

    Supported evidence sources for Step 2 must be `pdf_text`, `pdf_table`, `image_ocr`, and `manual`.
  </action>
  <test_code>
    import { describe, expect, it } from "vitest";
    import {
      createEvidenceSpan,
      createWarning,
      lowQualityProofWarning,
      lowConfidenceWarning,
      missingFieldWarning,
    } from "./evidence";

    describe("evidence builders", () => {
      it("creates a schema-shaped warning", () => {
        expect(createWarning("MISSING_PAYMENT_REFERENCE", "Reference is missing", "reference.raw")).toEqual({
          code: "MISSING_PAYMENT_REFERENCE",
          message: "Reference is missing",
          field: "reference.raw",
        });
      });

      it("creates evidence spans with original and normalized values", () => {
        const span = createEvidenceSpan({
          field: "financialPayload.paidAmount.value",
          value: "10.00",
          originalValue: "USD 10.00",
          normalizedValue: "10.00",
          confidence: 0.99,
          source: "pdf_text",
          evidenceText: "Paid USD 10.00",
        });
        expect(span).toMatchObject({
          page: null,
          bbox: null,
          warnings: [],
          originalValue: "USD 10.00",
          normalizedValue: "10.00",
        });
      });

      it("maps missing and low confidence warnings", () => {
        expect(missingFieldWarning("financialPayload.reference.raw", "No reference found").code).toBe("MISSING_PAYMENT_REFERENCE");
        expect(missingFieldWarning("financialPayload.paidAmount", "No amount found").code).toBe("MISSING_PAID_AMOUNT");
        expect(missingFieldWarning("financialPayload.paymentDate", "No date found").code).toBe("MISSING_PAYMENT_DATE");
        expect(lowConfidenceWarning("financialPayload.paidAmount.value", 0.72).code).toBe("LOW_CONFIDENCE_EXTRACTION");
      });

      it("keeps low-quality proof warnings separate from missing field warnings", () => {
        expect(lowQualityProofWarning("Proof is too blurred to extract").code).toBe("LOW_QUALITY_PROOF");
        expect(lowQualityProofWarning("Proof is too blurred to extract").field).toBeNull();
      });
    });
  </test_code>
  <verify>
    npm exec vitest run src/lib/recon/extraction/evidence.test.ts
    npm exec tsc -- --noEmit
  </verify>
  <done>Evidence and warning builders create INPUT_PLAN-compatible warning and FieldEvidence objects for extraction tool outputs.</done>
  <commit>feat(extraction): add evidence and warning builders</commit>
</task>

<task id="5" depends="1,2,3,4" type="auto">
  <name>Implement text-layer PDF extraction tool</name>
  <files>
    <create>src/lib/recon/extraction/parse-pdf-text.ts</create>
    <test>src/lib/recon/extraction/parse-pdf-text.test.ts</test>
  </files>
  <read_first>
    src/lib/recon/extraction/fixtures.ts
    src/lib/recon/extraction/extract-payment-fields.ts
    src/lib/recon/extraction/evidence.ts
    src/lib/recon/extraction/tools.ts
  </read_first>
  <action>
    Implement `parsePdfText(descriptor)` for real text-layer PDFs and plain text proof files.

    It must call `readProofSource(descriptor)` first. If source mode is `real_file`, parse the actual file content:

    - for `text/plain`, read text directly;
    - for `application/pdf`, extract embedded text from PDF bytes using the project-approved PDF text parser;
    - if real file parsing fails, fall back to `demoFixture.rawText` only through `readProofSource()` and include fallback warning/timeline metadata.

    Return an `ExtractionToolResult` with:

    - `route: "parse_pdf_text"`.
    - `rawText` from the actual file parser or explicit fallback source.
    - `candidateFinancialPayload.documentType: "provider_receipt"`.
    - `paymentStatus: "ACSC"` for Paid, Completed, or Settled text.
    - raw debtor from text after `Payer:`.
    - raw creditor from text containing `ReconPilot Sdn Bhd`.
    - `paidAmount` from the first source money amount.
    - `targetAmount` when a second MYR amount is present.
    - `paymentDate` from the first ISO date.
    - `reference.raw` from the first invoice reference.
    - `providerTransactionId` from `Transaction ID:` when present.
    - `providerOrBankName` from helper detection.
    - `invoiceIds` from all invoice references.
    - `exchangeRateInformation` from explicit FX when present, otherwise `null`.
    - field confidence values at or above `0.94` for text-derived amount, date, reference, payer, creditor, and FX.
    - evidence spans for amount, date, reference, debtor, creditor, and FX when present.

    If no real text and no fallback text exists, return `route: "parse_pdf_text"`, `rawText: null`, empty candidate fields, `LOW_QUALITY_PROOF`, and no invented values.
  </action>
  <test_code>
    import { describe, expect, it } from "vitest";
    import { proofToolFixtures } from "./fixtures";
    import { parsePdfText } from "./parse-pdf-text";

    describe("parsePdfText", () => {
      it("extracts a Wise text-layer receipt into raw candidate fields", async () => {
        const fixture = proofToolFixtures.find((item) => item.expectedRoute === "parse_pdf_text");
        const result = await parsePdfText(fixture!.descriptor);

        expect(result.route).toBe("parse_pdf_text");
        expect(result.rawText).toContain("Wise transfer receipt");
        expect(result.candidateFinancialPayload).toMatchObject({
          documentType: "provider_receipt",
          paymentStatus: "ACSC",
          debtor: { rawName: "Acme Pte Ltd" },
          creditor: { rawName: "ReconPilot Sdn Bhd" },
          paidAmount: { value: "10.00", currency: "USD" },
          paymentDate: "2026-05-20",
          reference: { raw: "INV-1001" },
          providerTransactionId: "WISE-TRX-88291",
          providerOrBankName: "Wise",
          invoiceIds: ["INV-1001"],
        });
        expect(result.candidateFinancialPayload.exchangeRateInformation).toMatchObject({
          exchangeRate: "4.2500",
          rateType: "AGREED",
          source: "payment_proof",
        });
      });

      it("creates field confidence and evidence spans for critical fields", async () => {
        const fixture = proofToolFixtures.find((item) => item.expectedRoute === "parse_pdf_text");
        const result = await parsePdfText(fixture!.descriptor);

        expect(result.fieldConfidence["financialPayload.paidAmount.value"]).toBeGreaterThanOrEqual(0.94);
        expect(result.fieldConfidence["financialPayload.reference.raw"]).toBeGreaterThanOrEqual(0.94);
        expect(result.evidenceSpans.map((span) => span.field)).toEqual(
          expect.arrayContaining([
            "financialPayload.paidAmount.value",
            "financialPayload.paymentDate",
            "financialPayload.reference.raw",
            "financialPayload.exchangeRateInformation.exchangeRate",
          ]),
        );
        expect(result.warnings).toEqual([]);
      });
    });
  </test_code>
  <verify>
    npm exec vitest run src/lib/recon/extraction/parse-pdf-text.test.ts
    npm exec tsc -- --noEmit
  </verify>
  <done>parsePdfText extracts raw payment fields, explicit FX, confidence, and evidence from text-layer demo proofs without normalization or matching.</done>
  <commit>feat(extraction): add text pdf extraction tool</commit>
</task>

<task id="6" depends="1,2,3,4" type="auto">
  <name>Implement table PDF extraction tool</name>
  <files>
    <create>src/lib/recon/extraction/parse-pdf-table.ts</create>
    <test>src/lib/recon/extraction/parse-pdf-table.test.ts</test>
  </files>
  <read_first>
    src/lib/recon/extraction/fixtures.ts
    src/lib/recon/extraction/extract-payment-fields.ts
    src/lib/recon/extraction/evidence.ts
    src/lib/recon/extraction/tools.ts
  </read_first>
  <action>
    Implement `parsePdfTable(descriptor)` for real PDFs with table-like payment data.

    It must call `readProofSource(descriptor)` first. If source mode is `real_file`, parse table candidates from the actual PDF bytes using the project-approved PDF table/text extraction approach. If real table parsing fails, fall back to `demoFixture.rawTable` only through `readProofSource()` and include fallback warning/timeline metadata.

    Convert the raw table to searchable text with `tableToText`, then extract:

    - `route: "parse_pdf_table"`.
    - `rawText` as flattened table text.
    - `candidateFinancialPayload.documentType: "bank_advice"`.
    - `paymentStatus` from table status.
    - raw debtor from the `Payer` row.
    - raw creditor from the `Beneficiary` row.
    - `paidAmount` from the `Amount` row.
    - `targetAmount` from the `Target Amount` row.
    - `paymentDate` from the `Payment Date` row.
    - `reference.raw` and `invoiceIds` from the `Reference` row.
    - `providerOrBankName` from the `Bank` row.
    - `exchangeRateInformation` as `IMPLIED` when both source and target amount exist and no explicit FX row exists.

    Set table confidence values at or above `0.90`. Evidence source must be `pdf_table`.
  </action>
  <test_code>
    import { describe, expect, it } from "vitest";
    import { proofToolFixtures } from "./fixtures";
    import { parsePdfTable } from "./parse-pdf-table";

    describe("parsePdfTable", () => {
      it("extracts key-value payment data from a table fixture", async () => {
        const fixture = proofToolFixtures.find((item) => item.expectedRoute === "parse_pdf_table");
        const result = await parsePdfTable(fixture!.descriptor);

        expect(result.route).toBe("parse_pdf_table");
        expect(result.rawText).toContain("INV-1002");
        expect(result.candidateFinancialPayload).toMatchObject({
          documentType: "bank_advice",
          paymentStatus: "ACSC",
          debtor: { rawName: "Beta Exports Ltd" },
          creditor: { rawName: "ReconPilot Sdn Bhd" },
          paidAmount: { value: "250.00", currency: "SGD" },
          targetAmount: { value: "875.00", currency: "MYR" },
          paymentDate: "2026-05-21",
          reference: { raw: "INV-1002" },
          providerOrBankName: "DBS",
          invoiceIds: ["INV-1002"],
        });
      });

      it("labels source-target FX as implied when no explicit rate row exists", async () => {
        const fixture = proofToolFixtures.find((item) => item.expectedRoute === "parse_pdf_table");
        const result = await parsePdfTable(fixture!.descriptor);

        expect(result.candidateFinancialPayload.exchangeRateInformation).toMatchObject({
          unitCurrency: "SGD",
          quotedCurrency: "MYR",
          exchangeRate: "3.5000",
          rateType: "IMPLIED",
          source: "computed_implied",
        });
        expect(result.evidenceSpans.every((span) => span.source === "pdf_table")).toBe(true);
      });
    });
  </test_code>
  <verify>
    npm exec vitest run src/lib/recon/extraction/parse-pdf-table.test.ts
    npm exec tsc -- --noEmit
  </verify>
  <done>parsePdfTable extracts raw candidate fields from table fixtures and labels source-target FX as IMPLIED when appropriate.</done>
  <commit>feat(extraction): add table pdf extraction tool</commit>
</task>

<task id="7" depends="1,2,3,4" type="auto">
  <name>Implement image OCR extraction tool</name>
  <files>
    <create>src/lib/recon/extraction/parse-image-ocr.ts</create>
    <test>src/lib/recon/extraction/parse-image-ocr.test.ts</test>
  </files>
  <read_first>
    src/lib/recon/extraction/fixtures.ts
    src/lib/recon/extraction/extract-payment-fields.ts
    src/lib/recon/extraction/evidence.ts
    src/lib/recon/extraction/tools.ts
  </read_first>
  <action>
    Implement `parseImageOcr(descriptor)` for real image proof files.

    It must call `readProofSource(descriptor)` first. If source mode is `real_file`, run OCR/vision on the actual proof image bytes. For PDFs without usable text, the later agent routing may render a page image and pass that rendered image into this route. If OCR/vision fails, fall back to `demoFixture.rawOcr` only through `readProofSource()` and include fallback warning/timeline metadata.

    Return:

    - `route: "parse_image_ocr"`.
    - `rawText` from real OCR/vision output or explicit fallback source.
    - `candidateFinancialPayload.documentType: "remittance_advice"`.
    - `paymentStatus: "ACSC"` when the OCR text contains `PAID`.
    - raw debtor from text after `SENDER`.
    - raw creditor from text after `BENEFICIARY`.
    - `paidAmount`, `paymentDate`, `reference.raw`, and `invoiceIds` from helper extraction.
    - `exchangeRateInformation: null` unless explicit or implied FX is present in the OCR text.
    - field confidence values around `0.86` for amount/reference/date and `0.82` for party names.
    - `LOW_CONFIDENCE_EXTRACTION` warnings for fields at or below `0.85`.
    - Step 2 tools emit warnings and confidence only. They do not calculate final `aiMetadata.requiresManualReview`; the Extraction Agent makes that final decision in Step 4.
    - evidence source `image_ocr`.

    Do not repair OCR text beyond simple deterministic extraction. If a field cannot be read, return `null` plus a warning.
  </action>
  <test_code>
    import { describe, expect, it } from "vitest";
    import { proofToolFixtures } from "./fixtures";
    import { parseImageOcr } from "./parse-image-ocr";

    describe("parseImageOcr", () => {
      it("extracts visible OCR fields from a scanned proof fixture", async () => {
        const fixture = proofToolFixtures.find((item) => item.expectedRoute === "parse_image_ocr");
        const result = await parseImageOcr(fixture!.descriptor);

        expect(result.route).toBe("parse_image_ocr");
        expect(result.rawText).toContain("TRANSFER RECEIPT");
        expect(result.candidateFinancialPayload).toMatchObject({
          documentType: "remittance_advice",
          paymentStatus: "ACSC",
          debtor: { rawName: "Gamma Trading" },
          creditor: { rawName: "ReconPilot" },
          paidAmount: { value: "200.00", currency: "USD" },
          paymentDate: "2026-05-22",
          reference: { raw: "INV-1003" },
          invoiceIds: ["INV-1003"],
          exchangeRateInformation: null,
        });
      });

      it("flags lower-confidence OCR party fields for later manual review", async () => {
        const fixture = proofToolFixtures.find((item) => item.expectedRoute === "parse_image_ocr");
        const result = await parseImageOcr(fixture!.descriptor);

        expect(result.fieldConfidence["financialPayload.debtor.rawName"]).toBe(0.82);
        expect(result.evidenceSpans.every((span) => span.source === "image_ocr")).toBe(true);
        expect(result.warnings.map((warning) => warning.code)).toContain("LOW_CONFIDENCE_EXTRACTION");
      });
    });
  </test_code>
  <verify>
    npm exec vitest run src/lib/recon/extraction/parse-image-ocr.test.ts
    npm exec tsc -- --noEmit
  </verify>
  <done>parseImageOcr extracts raw OCR candidate fields and low-confidence warnings without pretending OCR fields are certain.</done>
  <commit>feat(extraction): add image ocr extraction tool</commit>
</task>

<task id="8" depends="1,4" type="auto">
  <name>Implement manual correction fallback tool</name>
  <files>
    <create>src/lib/recon/extraction/manual-correction.ts</create>
    <test>src/lib/recon/extraction/manual-correction.test.ts</test>
  </files>
  <read_first>
    src/lib/recon/extraction/fixtures.ts
    src/lib/recon/extraction/evidence.ts
    src/lib/recon/extraction/tools.ts
  </read_first>
  <action>
    Implement `manualCorrection(descriptor)` as a deterministic fallback result for low-quality, unknown, or ambiguous proofs.

    Return:

    - `route: "manual_correction"`.
    - `rawText` from any available fixture text or `null`.
    - `candidateFinancialPayload.documentType: "other"`.
    - `paymentStatus: "UNKNOWN"`.
    - raw debtor and creditor as `{ rawName: null }`.
    - `paidAmount: null`, `paymentDate: null`, `reference: { raw: null }`, `invoiceIds: []`, `exchangeRateInformation: null`.
    - field confidence values of `0` for critical fields.
    - warnings for `MISSING_PAID_AMOUNT`, `MISSING_PAYMENT_DATE`, `MISSING_PAYMENT_REFERENCE`, `MISSING_DEBTOR`, `MISSING_CREDITOR`, and `LOW_QUALITY_PROOF`. Do not use `MISSING_REQUIRED_COLUMN` for blurred proof/manual correction cases; reserve it for structured CSV/XLSX parsers.
    - one manual evidence span with source `manual` and evidence text `Manual correction required before reconciliation`.

    This tool must not ask the user directly. It only creates the structured fallback result that Agent 1 Step 4 will use to request correction.
  </action>
  <test_code>
    import { describe, expect, it } from "vitest";
    import { proofToolFixtures } from "./fixtures";
    import { manualCorrection } from "./manual-correction";

    describe("manualCorrection", () => {
      it("returns a truthful fallback payload with null critical fields", async () => {
        const fixture = proofToolFixtures.find((item) => item.expectedRoute === "manual_correction");
        const result = await manualCorrection(fixture!.descriptor);

        expect(result.route).toBe("manual_correction");
        expect(result.rawText).toBeNull();
        expect(result.candidateFinancialPayload).toMatchObject({
          documentType: "other",
          paymentStatus: "UNKNOWN",
          debtor: { rawName: null },
          creditor: { rawName: null },
          paidAmount: null,
          paymentDate: null,
          reference: { raw: null },
          invoiceIds: [],
          exchangeRateInformation: null,
        });
      });

      it("emits warnings for all missing critical fields", async () => {
        const fixture = proofToolFixtures.find((item) => item.expectedRoute === "manual_correction");
        const result = await manualCorrection(fixture!.descriptor);

        expect(result.warnings.map((warning) => warning.code)).toEqual(
          expect.arrayContaining([
            "MISSING_PAID_AMOUNT",
            "MISSING_PAYMENT_DATE",
            "MISSING_PAYMENT_REFERENCE",
            "MISSING_DEBTOR",
            "MISSING_CREDITOR",
            "LOW_QUALITY_PROOF",
          ]),
        );
        expect(result.evidenceSpans).toHaveLength(1);
        expect(result.evidenceSpans[0].source).toBe("manual");
      });

      it("does not invent placeholder values for unreadable proof fields", async () => {
        const fixture = proofToolFixtures.find((item) => item.expectedRoute === "manual_correction");
        const result = await manualCorrection(fixture!.descriptor);
        const serialized = JSON.stringify(result);

        expect(result.candidateFinancialPayload.paidAmount).toBeNull();
        expect(result.candidateFinancialPayload.paymentDate).toBeNull();
        expect(result.candidateFinancialPayload.reference).toEqual({ raw: null });
        expect(result.candidateFinancialPayload.debtor).toEqual({ rawName: null });
        expect(result.candidateFinancialPayload.creditor).toEqual({ rawName: null });
        expect(serialized).not.toContain("UNKNOWN CUSTOMER");
        expect(serialized).not.toContain("INV-UNKNOWN");
      });
    });
  </test_code>
  <verify>
    npm exec vitest run src/lib/recon/extraction/manual-correction.test.ts
    npm exec tsc -- --noEmit
  </verify>
  <done>manualCorrection returns null critical fields, missing-field warnings, and manual evidence without asking the user directly.</done>
  <commit>feat(extraction): add manual correction fallback tool</commit>
</task>

<task id="9" depends="5,6,7,8" type="auto">
  <name>Export the concrete extraction tool registry</name>
  <files>
    <modify>src/lib/recon/extraction/tools.ts</modify>
    <test>src/lib/recon/extraction/tools.contract.test.ts</test>
  </files>
  <read_first>
    src/lib/recon/extraction/tools.ts
    src/lib/recon/extraction/parse-pdf-text.ts
    src/lib/recon/extraction/parse-pdf-table.ts
    src/lib/recon/extraction/parse-image-ocr.ts
    src/lib/recon/extraction/manual-correction.ts
  </read_first>
  <action>
    Update `tools.ts` to export concrete tool wiring while preserving the existing Step 1 interfaces:

    - `ExtractionRoute` includes `parse_pdf_text`, `parse_pdf_table`, `parse_image_ocr`, and `manual_correction`.
    - `ExtractionTool` is a function that accepts `PaymentProofInputDescriptor` and resolves an `ExtractionToolResult`.
    - `extractionToolRegistry` maps each route to the matching implementation:
      - `parse_pdf_text` to `parsePdfText`
      - `parse_pdf_table` to `parsePdfTable`
      - `parse_image_ocr` to `parseImageOcr`
      - `manual_correction` to `manualCorrection`

    Do not add route selection to the registry. Route selection belongs to Agent 1 Step 4 in `extraction-agent.ts`.
  </action>
  <test_code>
    import { describe, expect, it } from "vitest";
    import { proofToolFixtures } from "./fixtures";
    import { extractionToolRegistry } from "./tools";

    describe("extractionToolRegistry", () => {
      it("exports one concrete tool for every Step 2 route", () => {
        expect(Object.keys(extractionToolRegistry).sort()).toEqual([
          "manual_correction",
          "parse_image_ocr",
          "parse_pdf_table",
          "parse_pdf_text",
        ]);
      });

      it("calls the concrete tool mapped to each fixture route", async () => {
        for (const fixture of proofToolFixtures) {
          const tool = extractionToolRegistry[fixture.expectedRoute];
          const result = await tool(fixture.descriptor);
          expect(result.route).toBe(fixture.expectedRoute);
        }
      });
    });
  </test_code>
  <verify>
    npm exec vitest run src/lib/recon/extraction/tools.contract.test.ts
    npm exec tsc -- --noEmit
  </verify>
  <done>tools.ts exports a concrete extractionToolRegistry for all four Step 2 routes and keeps route selection outside the registry.</done>
  <commit>feat(extraction): wire extraction tool registry</commit>
</task>

<task id="10" depends="9" type="auto">
  <name>Assert cross-tool Agent 1 boundary contract</name>
  <files>
    <modify>src/lib/recon/extraction/tools.contract.test.ts</modify>
  </files>
  <read_first>
    FINAL_RECONPILOT_BLUEPRINT.md
    INPUT_PLAN.md
    EXTRACTION_AGENT_PLAN.md
    src/lib/recon/extraction/tools.contract.test.ts
    src/lib/recon/extraction/tools.ts
    src/lib/recon/extraction/fixtures.ts
  </read_first>
  <action>
    Extend `tools.contract.test.ts` with boundary tests across all registered tools:

    - Every tool result contains `route`, `rawText`, `candidateFinancialPayload`, `fieldConfidence`, `evidenceSpans`, and `warnings`.
    - Every result uses only raw extracted debtor, creditor, and reference fields. It must not include `normalizedName`, `normalized`, `normalized_reference`, or `reconciliationStatus`.
    - Every non-manual route emits at least one evidence span.
    - No tool result contains reconciliation concepts such as `matchScore`, `classification`, `bankTransaction`, `expectedPayment`, `fxScenario`, or `artifact`.
    - The text, table, and image real proof files choose three different route values when executed through the registry.
    - Fallback mode is explicit: serialized results or timeline metadata must contain `fixture_fallback` when `demoFixture` is used.

    These tests protect the architecture rule: Agent 1 extracts, code later normalizes, Agent 2 matches.
  </action>
  <test_code>
    import { describe, expect, it } from "vitest";
    import { proofToolFixtures } from "./fixtures";
    import { extractionToolRegistry } from "./tools";

    describe("extraction tools Agent 1 boundary", () => {
      it("returns the Step 2 tool result shape for every registered route", async () => {
        for (const fixture of proofToolFixtures) {
          const result = await extractionToolRegistry[fixture.expectedRoute](fixture.descriptor);
          expect(result).toHaveProperty("route");
          expect(result).toHaveProperty("rawText");
          expect(result).toHaveProperty("candidateFinancialPayload");
          expect(result).toHaveProperty("fieldConfidence");
          expect(result).toHaveProperty("evidenceSpans");
          expect(result).toHaveProperty("warnings");
        }
      });

      it("does not normalize, match, classify, or generate artifacts", async () => {
        for (const fixture of proofToolFixtures) {
          const result = await extractionToolRegistry[fixture.expectedRoute](fixture.descriptor);
          const serialized = JSON.stringify(result);
          expect(serialized).not.toContain("normalizedName");
          expect(serialized).not.toContain("normalized_reference");
          expect(serialized).not.toContain("reconciliationStatus");
          expect(serialized).not.toContain("matchScore");
          expect(serialized).not.toContain("classification");
          expect(serialized).not.toContain("bankTransaction");
          expect(serialized).not.toContain("expectedPayment");
          expect(serialized).not.toContain("fxScenario");
          expect(serialized).not.toContain("artifact");
        }
      });

      it("demonstrates visible route variety for the demo batch", async () => {
        const demoRoutes = [];
        for (const fixture of proofToolFixtures.filter((item) => item.expectedRoute !== "manual_correction")) {
          const result = await extractionToolRegistry[fixture.expectedRoute](fixture.descriptor);
          demoRoutes.push(result.route);
          expect(result.evidenceSpans.length).toBeGreaterThan(0);
        }
        expect(new Set(demoRoutes).size).toBe(3);
      });
    });
  </test_code>
  <verify>
    npm exec vitest run src/lib/recon/extraction/tools.contract.test.ts
    npm exec vitest run src/lib/recon/extraction
    npm exec tsc -- --noEmit
  </verify>
  <done>Cross-tool contract tests prove the real-file-backed tools emit evidence-backed raw extraction results, expose fallback mode when used, and do not cross into normalization, matching, classification, or artifacts.</done>
  <commit>test(extraction): assert tool boundary contract</commit>
</task>
```

#### Step 2 Execution Notes

- Execute this after `INPUT_PLAN.md` schemas/types and Agent 1 Step 1 tool interfaces exist and compile successfully.
- If the repository is still docs-only, first scaffold the declared Next.js/TypeScript/Vitest project and implement the schema contract.
- Keep fixture parsing intentionally boring and deterministic for the demo. The agentic behavior is route choice and observed tool output, not live OCR magic.
- Step 4 will assemble full `PaymentProofExtractionOutput`, validate against Zod, decide manual review, and write the timeline.

### Step 3: Implement Timeline

Files:

- `src/lib/recon/timeline.ts`

Implement:

- `createTimeline()`
- `addEvent()`
- `listEvents()`

The timeline is the demo proof that the agent is making choices.

### Step 4: Implement Extraction Agent

Files:

- `src/lib/recon/extraction/extraction-agent.ts`

Implement:

- route selection;
- tool call;
- `createDefaultFinancialPayload()` to provide every required `PaymentProofExtractionOutput.financialPayload` key with safe defaults:
  - `documentType: "other"`;
  - `paymentStatus: "UNKNOWN"`;
  - `paymentStatusLabel: null`;
  - `rawPaymentStatus: null`;
  - `debtor: { rawName: null }`;
  - `creditor: { rawName: null }`;
  - `debtorAccount: null`;
  - `creditorAccount: null`;
  - `paidAmount: null`;
  - `paymentDate: null`;
  - `valueDate: null`;
  - `bookingDate: null`;
  - `reference: { raw: null }`;
  - `providerTransactionId: null`;
  - `providerOrBankName: null`;
  - `invoiceIds: []`;
  - `endToEndId: null`;
  - `uetr: null`;
  - `feeAmount: null`;
  - `netAmount: null`;
  - `sourceAmount: null`;
  - `targetAmount: null`;
  - `exchangeRateInformation: null`;
  - `remittanceInformation: { raw: null, structured: null }`;
  - `rawText: null`.
- `mergeToolPayloadWithDefaults(toolResult)` to merge `candidateFinancialPayload` over `createDefaultFinancialPayload()` before schema validation. Arrays and nested objects must be replaced intentionally, not deep-merged in a way that preserves stale defaults.
- `calculateOverallConfidence(fieldConfidence)` using a weighted average of critical fields:
  - paid amount: `0.30`;
  - payment date: `0.20`;
  - reference or invoice IDs: `0.20`;
  - debtor: `0.15`;
  - creditor: `0.15`.
  Missing fields count as `0`. Use the higher available confidence between `financialPayload.reference.raw` and invoice ID evidence for the reference bucket.
- schema assembly;
- schema validation;
- manual review decision;
- timeline writing.

Manual review decision must set `aiMetadata.requiresManualReview` to `true` when `overallConfidence < 0.85`, the route is `manual_correction`, any critical field is missing, payment status is not `ACSC`, or warnings include `LOW_QUALITY_PROOF`, `LOW_CONFIDENCE_EXTRACTION`, or missing critical field codes.

### Step 5: Demo Runner

Files:

- `src/scripts/run-extraction-demo.ts`

The script should print:

- file name;
- detected file type;
- selected extraction route;
- extracted financial payload;
- confidence;
- manual review flag;
- timeline events.

## Tests

Minimum tests:

- real text PDF/plain text files route to `parse_pdf_text`;
- real table PDF files route to `parse_pdf_table`;
- real image proof files route to `parse_image_ocr`;
- low-quality proof routes to `manual_correction`;
- extraction output validates against schema;
- missing reference creates warning;
- missing creditor/debtor creates warning;
- proof with explicit FX extracts `exchangeRateInformation`;
- proof without FX sets `exchangeRateInformation` to `null`;
- proof with source and target amount may produce `IMPLIED` FX if implemented.

## Definition Of Done

Agent 1 is complete when:

- it chooses different tools for different proof types;
- every output validates as `PaymentProofExtractionOutput`;
- every important field has evidence and confidence;
- messy documents can produce truthful `null` fields with warnings;
- timeline events clearly show observe, decide, act, observe, output;
- no matching or reconciliation decision is made.
