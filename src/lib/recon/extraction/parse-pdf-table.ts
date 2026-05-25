import { readProofSource } from "./read-proof-source";
import { buildToolResult } from "./build-tool-result";
import { extractPdfText } from "./pdf-text";
import { tableToText } from "./extract-payment-fields";
import type { PaymentProofInputDescriptor } from "../types";

/**
 * Attempts to detect tabular structure in text extracted from a PDF.
 * Returns an array of rows, where each row is an array of cell values.
 * Returns an empty array if no consistent table structure is detected.
 */
function detectTable(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const rows: string[][] = [];

  for (const line of lines) {
    // Priority 1: tab-separated
    if (line.includes("\t")) {
      rows.push(line.split("\t").map((c) => c.trim()));
    }
    // Priority 2: pipe-separated (e.g. markdown tables)
    else if (line.includes("|")) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2) rows.push(cells);
    }
    // Priority 3: multi-space separated (2+ spaces between columns)
    else if (/\s{2,}/.test(line)) {
      rows.push(line.split(/\s{2,}/).map((c) => c.trim()));
    }
    // Skip single-column lines (not tabular)
  }

  // Only return if we found a consistent table structure (2+ rows, same column count)
  if (rows.length < 2) return [];

  // Find the modal (most common) column count
  const colCounts = rows.map((r) => r.length);
  const countFreq = new Map<number, number>();
  for (const count of colCounts) {
    countFreq.set(count, (countFreq.get(count) ?? 0) + 1);
  }
  let modalCount = 0;
  let modalFreq = 0;
  for (const [count, freq] of countFreq) {
    if (freq > modalFreq) {
      modalCount = count;
      modalFreq = freq;
    }
  }

  // Keep only rows with the modal column count (± 1 column tolerance)
  const filtered = rows.filter((r) => Math.abs(r.length - modalCount) <= 1);
  return filtered.length >= 2 ? filtered : [];
}

export async function parsePdfTable(descriptor: PaymentProofInputDescriptor) {
  const source = await readProofSource(descriptor);
  const rawText = source.bytes && descriptor.mimeType === "application/pdf" ? await extractPdfText(source.bytes) : source.text ?? "";

  // Attempt to detect and parse tabular structure
  const table = detectTable(rawText);
  const textForExtraction = table.length > 0 ? tableToText(table) : rawText;

  return buildToolResult({
    descriptor,
    route: "parse_pdf_table",
    text: textForExtraction,
    evidenceSource: source.mode === "unreadable" ? "manual" : "pdf_table",
    sourceMode: source.mode,
    sourceWarnings: source.warnings
  });
}
