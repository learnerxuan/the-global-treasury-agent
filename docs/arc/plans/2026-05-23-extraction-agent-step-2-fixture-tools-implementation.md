# ReconPilot Extraction Agent Step 2 Implementation Plan

> **For Arc:** Use /arc:implement to execute this plan. Subagents should report DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED.

**Design:** `FINAL_RECONPILOT_BLUEPRINT.md`, `INPUT_PLAN.md`, `EXTRACTION_AGENT_PLAN.md`  
**Goal:** Implement Agent 1 fixture-backed extraction tools that turn demo proof descriptors into raw, evidence-backed candidate payment fields without matching or normalization.  
**Stack:** Declared Next.js App Router + TypeScript + Zod + Vitest. No package manager, test config, or app scaffold is currently detected in this repository; commands below assume the planned npm/TypeScript/Vitest app bootstrap exists before execution.  
**Scope:** Agent 1 Step 2 only: `parse_pdf_text`, `parse_pdf_table`, `parse_image_ocr`, and `manual_correction`.

---

## File Structure Lock

Create:

- `src/lib/recon/extraction/fixtures.ts` - demo descriptors and expected route metadata for the four Step 2 tools.
- `src/lib/recon/extraction/fixtures.test.ts` - fixture coverage for all required routes.
- `src/lib/recon/extraction/extract-payment-fields.ts` - deterministic fixture parsing helpers for money, dates, invoice IDs, status, parties, and FX.
- `src/lib/recon/extraction/extract-payment-fields.test.ts` - helper unit tests.
- `src/lib/recon/extraction/evidence.ts` - evidence span and warning builders used by all tools.
- `src/lib/recon/extraction/evidence.test.ts` - builder unit tests.
- `src/lib/recon/extraction/parse-pdf-text.ts` - fixture-backed text-layer PDF extraction tool.
- `src/lib/recon/extraction/parse-pdf-text.test.ts` - text PDF tool tests.
- `src/lib/recon/extraction/parse-pdf-table.ts` - fixture-backed table PDF extraction tool.
- `src/lib/recon/extraction/parse-pdf-table.test.ts` - table PDF tool tests.
- `src/lib/recon/extraction/parse-image-ocr.ts` - fixture-backed image/OCR extraction tool.
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

If those prerequisite files do not exist when this plan is executed, stop with `NEEDS_CONTEXT` and implement `INPUT_PLAN.md` plus Agent 1 Step 1 first.

## Boundaries

- Tools return `ExtractionToolResult`, not final `PaymentProofExtractionOutput`.
- Tools extract raw fields only. They must not normalize references, normalize party names, score candidates, fetch FX rates, classify matches, or write reconciliation artifacts.
- All demo extraction is fixture-backed and deterministic. No live OCR, no network, no LLM call, and no hidden dependency on uploaded binary parsing.
- Money values remain decimal strings.
- Missing fields are represented as `null` and warnings, never invented values.
- `exchangeRateInformation` is populated only when explicit FX appears in the proof or when source and target amounts allow a clearly labelled `IMPLIED` rate.

## Tasks

```xml
<task id="1" depends="" type="auto">
  <name>Create fixture descriptors for all extraction routes</name>
  <files>
    <create>src/lib/recon/extraction/fixtures.ts</create>
    <test>src/lib/recon/extraction/fixtures.test.ts</test>
  </files>
  <read_first>
    INPUT_PLAN.md
    EXTRACTION_AGENT_PLAN.md
  </read_first>
  <action>
    Create route fixtures for the Step 2 tools. Export `proofToolFixtures` with exactly four records:

    1. `textPdfProof`: `expectedRoute` is `parse_pdf_text`; descriptor file name `wise-transfer-inv-1001.pdf`; MIME type `application/pdf`; `textLayer: true`; `tableLikely: false`; `imageQuality: "high"`; `demoFixture.rawText` contains `Wise transfer receipt. Paid USD 10.00 to ReconPilot Sdn Bhd. Reference INV-1001. Exchange rate: 1 USD = 4.2500 MYR. Date 2026-05-20. Status: Paid. Payer: Acme Pte Ltd. Transaction ID: WISE-TRX-88291.`
    2. `tablePdfProof`: `expectedRoute` is `parse_pdf_table`; descriptor file name `bank-advice-inv-1002.pdf`; MIME type `application/pdf`; `textLayer: true`; `tableLikely: true`; `imageQuality: "high"`; `demoFixture.rawTable` contains key-value rows for payer `Beta Exports Ltd`, beneficiary `ReconPilot Sdn Bhd`, amount `SGD 250.00`, target amount `MYR 875.00`, reference `INV-1002`, payment date `2026-05-21`, status `Completed`, bank `DBS`.
    3. `imageOcrProof`: `expectedRoute` is `parse_image_ocr`; descriptor file name `scanned-slip-inv-1003.png`; MIME type `image/png`; `textLayer: false`; `tableLikely: false`; `imageQuality: "medium"`; `demoFixture.rawOcr` contains `TRANSFER RECEIPT PAID USD 200.00 REF INV-1003 DATE 2026-05-22 SENDER Gamma Trading BENEFICIARY ReconPilot`.
    4. `manualCorrectionProof`: `expectedRoute` is `manual_correction`; descriptor file name `blurred-proof-unknown.jpg`; MIME type `image/jpeg`; `textLayer: false`; `tableLikely: false`; `imageQuality: "low"`; `demoFixture.rawOcr` is `null`.

    Each descriptor must use `inputKind: "payment_proof"`, `schemaVersion: "1.0.0"`, `parseStatus: "PENDING"`, `uploadedAt: "2026-05-23T18:31:00+08:00"`, `sizeBytes` as a non-null positive number, and `warnings: []`.
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

      it("keeps fixture content under demoFixture", () => {
        for (const fixture of proofToolFixtures) {
          expect(fixture.descriptor.inputKind).toBe("payment_proof");
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
  <done>Fixture descriptors exist for parse_pdf_text, parse_pdf_table, parse_image_ocr, and manual_correction with all raw demo content nested under demoFixture.</done>
  <commit>feat(extraction): add proof tool fixtures</commit>
</task>

<task id="2" depends="1" type="auto">
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
    Create pure helper functions used by fixture-backed tools:

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

<task id="3" depends="1" type="auto">
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
    - `missingFieldWarning(field, message)` returns a warning with a schema warning code appropriate for the field: `MISSING_PAYMENT_REFERENCE`, `MISSING_DEBTOR`, `MISSING_CREDITOR`, or `MISSING_REQUIRED_COLUMN`.
    - `lowConfidenceWarning(field, confidence)` returns `LOW_CONFIDENCE_EXTRACTION`.

    Supported evidence sources for Step 2 must be `pdf_text`, `pdf_table`, `image_ocr`, and `manual`.
  </action>
  <test_code>
    import { describe, expect, it } from "vitest";
    import {
      createEvidenceSpan,
      createWarning,
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
        expect(lowConfidenceWarning("financialPayload.paidAmount.value", 0.72).code).toBe("LOW_CONFIDENCE_EXTRACTION");
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

<task id="4" depends="1,2,3" type="auto">
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
    Implement `parsePdfText(descriptor)` for descriptors with `demoFixture.rawText`.

    Return an `ExtractionToolResult` with:

    - `route: "parse_pdf_text"`.
    - `rawText` from the descriptor fixture.
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

    If `demoFixture.rawText` is missing, return `route: "parse_pdf_text"`, `rawText: null`, empty candidate fields, `MISSING_REQUIRED_COLUMN`, and no invented values.
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

<task id="5" depends="1,2,3" type="auto">
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
    Implement `parsePdfTable(descriptor)` for descriptors with `demoFixture.rawTable`.

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

<task id="6" depends="1,2,3" type="auto">
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
    Implement `parseImageOcr(descriptor)` for image descriptors with `demoFixture.rawOcr`.

    Return:

    - `route: "parse_image_ocr"`.
    - `rawText` from `demoFixture.rawOcr`.
    - `candidateFinancialPayload.documentType: "remittance_advice"`.
    - `paymentStatus: "ACSC"` when the OCR text contains `PAID`.
    - raw debtor from text after `SENDER`.
    - raw creditor from text after `BENEFICIARY`.
    - `paidAmount`, `paymentDate`, `reference.raw`, and `invoiceIds` from helper extraction.
    - `exchangeRateInformation: null` unless explicit or implied FX is present in the OCR text.
    - field confidence values around `0.86` for amount/reference/date and `0.82` for party names.
    - `LOW_CONFIDENCE_EXTRACTION` warnings for fields at or below `0.85`.
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

<task id="7" depends="1,3" type="auto">
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
    - warnings for missing paid amount, payment date, reference, debtor, and creditor.
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
            "MISSING_REQUIRED_COLUMN",
            "MISSING_PAYMENT_REFERENCE",
            "MISSING_DEBTOR",
            "MISSING_CREDITOR",
          ]),
        );
        expect(result.evidenceSpans).toHaveLength(1);
        expect(result.evidenceSpans[0].source).toBe("manual");
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

<task id="8" depends="4,5,6,7" type="auto">
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

<task id="9" depends="8" type="auto">
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
    - The text, table, and image fixtures choose three different route values when executed through the registry.

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
  <done>Cross-tool contract tests prove the fixture-backed tools emit evidence-backed raw extraction results and do not cross into normalization, matching, classification, or artifacts.</done>
  <commit>test(extraction): assert tool boundary contract</commit>
</task>
```

## Execution Notes

- Execute this after `INPUT_PLAN.md` schemas/types and Agent 1 Step 1 tool interfaces exist.
- If the repository is still docs-only, first scaffold the declared Next.js/TypeScript/Vitest project and implement the schema contract.
- Keep fixture parsing intentionally boring and deterministic for the demo. The agentic behavior is route choice and observed tool output, not live OCR magic.
- Step 4 will assemble full `PaymentProofExtractionOutput`, validate against Zod, decide manual review, and write the timeline.

## Manual Plan Review

| # | Dimension | Status | Notes |
|---|---|---|---|
| 1 | Task Completeness | PASS | All non-checkpoint tasks include name, files, read_first, action, test_code, verify, done, and commit. |
| 2 | Verify Quality | PASS | Verify steps use concrete Vitest and TypeScript commands. |
| 3 | Dependency Correctness | PASS | Tasks build fixtures/helpers first, then tools, registry, and final contract tests. |
| 4 | Scope Sanity | PASS | 9 tasks total; each task touches at most two files. |
| 5 | Read-First Validity | CONDITIONAL | Prerequisite schema/type/interface files are required from `INPUT_PLAN.md` and Agent 1 Step 1. Execute those first if absent. |
| 6 | Spec Alignment | PASS | Tasks map to `EXTRACTION_AGENT_PLAN.md` Step 2 and preserve architecture boundaries from `FINAL_RECONPILOT_BLUEPRINT.md`. |
| 7 | Test Coverage | PASS | Every implementation task includes a test file and exact test code. |
