import type { FieldEvidence, PaymentProofFinancialPayload, PaymentProofInputDescriptor, Warning } from "../types.js";

export type ExtractionRoute = "parse_pdf_text" | "parse_pdf_table" | "parse_image_ocr" | "manual_correction";

export type ExtractionToolResult = {
  route: ExtractionRoute;
  rawText: string | null;
  candidateFinancialPayload: Partial<PaymentProofFinancialPayload>;
  fieldConfidence: Record<string, number>;
  evidenceSpans: FieldEvidence[];
  warnings: Warning[];
  sourceMode?: "real_file" | "fixture_fallback";
};

export type ExtractionTool = (descriptor: PaymentProofInputDescriptor) => Promise<ExtractionToolResult>;

export async function getExtractionToolRegistry(): Promise<Record<ExtractionRoute, ExtractionTool>> {
  const [{ parsePdfText }, { parsePdfTable }, { parseImageOcr }, { manualCorrection }] = await Promise.all([
    import("./parse-pdf-text.js"),
    import("./parse-pdf-table.js"),
    import("./parse-image-ocr.js"),
    import("./manual-correction.js")
  ]);

  return {
    parse_pdf_text: parsePdfText,
    parse_pdf_table: parsePdfTable,
    parse_image_ocr: parseImageOcr,
    manual_correction: manualCorrection
  };
}
