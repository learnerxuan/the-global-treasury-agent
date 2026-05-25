import { readProofSource } from "./read-proof-source";
import { buildToolResult } from "./build-tool-result";
import { extractImageText } from "./image-ocr";
import type { OcrResult } from "./image-ocr";
import { makeWarning } from "./evidence";
import type { PaymentProofInputDescriptor } from "../types";

export async function parseImageOcr(descriptor: PaymentProofInputDescriptor) {
  const source = await readProofSource(descriptor);
  const warnings = [...source.warnings];
  let text = "";
  let ocrConfidence: number | undefined;

  if (source.localPath && descriptor.mimeType.startsWith("image/")) {
    try {
      const ocrResult: OcrResult = await extractImageText(source.localPath);
      text = ocrResult.text;
      ocrConfidence = ocrResult.confidence;
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
    sourceWarnings: warnings,
    ...(ocrConfidence !== undefined ? { ocrConfidence } : {})
  });
}
