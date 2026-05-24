import { readProofSource } from "./read-proof-source";
import { buildToolResult } from "./build-tool-result";
import { extractImageText } from "./image-ocr";
import { makeWarning } from "./evidence";
import type { PaymentProofInputDescriptor } from "../types";

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
    evidenceSource: source.mode === "unreadable" ? "manual" : "image_ocr",
    sourceMode: source.mode,
    sourceWarnings: warnings
  });
}
