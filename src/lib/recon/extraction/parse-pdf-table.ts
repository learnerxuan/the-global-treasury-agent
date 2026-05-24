import { readProofSource } from "./read-proof-source";
import { buildToolResult } from "./build-tool-result";
import { extractPdfText } from "./pdf-text";
import type { PaymentProofInputDescriptor } from "../types";

export async function parsePdfTable(descriptor: PaymentProofInputDescriptor) {
  const source = await readProofSource(descriptor);
  const text = source.bytes && descriptor.mimeType === "application/pdf" ? await extractPdfText(source.bytes) : source.text ?? "";

  return buildToolResult({
    descriptor,
    route: "parse_pdf_table",
    text,
    evidenceSource: source.mode === "unreadable" ? "manual" : "pdf_table",
    sourceMode: source.mode,
    sourceWarnings: source.warnings
  });
}
