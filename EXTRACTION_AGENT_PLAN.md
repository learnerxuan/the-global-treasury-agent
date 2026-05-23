# ReconPilot Extraction Agent Plan

Status: ready for implementation after schema contract  
Owner: solo developer  
Stack: Next.js App Router, TypeScript, Zod, Vitest  
Scope: architecture block 2 only  
Date: 2026-05-23

## Purpose

This file defines the implementation plan for **Agent 1: Extraction Agent**.

The schema contract is in:

[INPUTS_EXTRACTION_AGENT_PLAN.md](INPUTS_EXTRACTION_AGENT_PLAN.md)

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
| PDF likely contains tables | `parse_pdf_table` |
| Image or scanned proof | `parse_image_ocr` |
| Low-quality, unknown, or ambiguous proof | `manual_correction` |

Route priority:

1. If low quality or unreadable, use `manual_correction`.
2. If PDF has table signal, use `parse_pdf_table`.
3. If PDF has text layer, use `parse_pdf_text`.
4. If image, use `parse_image_ocr`.
5. Otherwise, use `manual_correction`.

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

### Step 2: Implement Fixture-Backed Tools

Files:

- `parse-pdf-text.ts`
- `parse-pdf-table.ts`
- `parse-image-ocr.ts`
- `manual-correction.ts`

For hackathon speed, these can use fixture strings and simple extraction logic first.

Each tool must return:

- raw text;
- candidate financial payload;
- field confidence;
- evidence spans;
- warnings.

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
- schema assembly;
- schema validation;
- manual review decision;
- timeline writing.

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

- text PDF routes to `parse_pdf_text`;
- table PDF routes to `parse_pdf_table`;
- image proof routes to `parse_image_ocr`;
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
