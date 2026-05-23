import { readProofSource } from "./read-proof-source.js";
import { buildToolResult } from "./build-tool-result.js";
import { extractImageText } from "./image-ocr.js";
import { makeWarning } from "./evidence.js";
import type { PaymentProofInputDescriptor } from "../types.js";

export async function parseImageOcr(descriptor: PaymentProofInputDescriptor) {
  const source = await readProofSource(descriptor);
  const warnings = [...source.warnings];
  let text = "";

  if (source.localPath && descriptor.mimeType.startsWith("image/")) {
    try {
      text = await extractImageText(source.localPath);
    } catch (error) {
      warnings.push(
        makeWarning(
          "LOW_QUALITY_PROOF",
          `OCR failed for real image: ${error instanceof Error ? error.message : "unknown OCR error"}`,
          "storageRef"
        )
      );
    }
  }

  return buildToolResult({
    descriptor,
    route: "parse_image_ocr",
    text,
    evidenceSource: source.mode === "fixture_fallback" ? "manual" : "image_ocr",
    sourceMode: source.mode,
    sourceWarnings: warnings
  });
}
