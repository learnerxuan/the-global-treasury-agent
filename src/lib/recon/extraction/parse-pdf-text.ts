import { readProofSource } from "./read-proof-source.js";
import { buildToolResult } from "./build-tool-result.js";
import { extractPdfText } from "./pdf-text.js";
import type { PaymentProofInputDescriptor } from "../types.js";

export async function parsePdfText(descriptor: PaymentProofInputDescriptor) {
  const source = await readProofSource(descriptor);
  const text = source.bytes && descriptor.mimeType === "application/pdf" ? await extractPdfText(source.bytes) : source.text ?? "";

  return buildToolResult({
    descriptor,
    route: "parse_pdf_text",
    text,
    evidenceSource: source.mode === "fixture_fallback" ? "manual" : "pdf_text",
    sourceMode: source.mode,
    sourceWarnings: source.warnings
  });
}
