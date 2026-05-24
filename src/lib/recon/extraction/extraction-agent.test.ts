import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { paymentProofExtractionOutputSchema } from "../schemas";
import type { PaymentProofInputDescriptor } from "../types";
import { calculateOverallConfidence, runExtractionAgent, selectInitialRoute } from "./extraction-agent";

function descriptor(overrides: Partial<PaymentProofInputDescriptor>): PaymentProofInputDescriptor {
  return {
    schemaVersion: "1.0.0",
    fileId: "proof_file_test",
    fileName: "proof.txt",
    mimeType: "text/plain",
    inputKind: "payment_proof",
    sizeBytes: 128,
    storageRef: null,
    uploadedAt: "2026-05-23T18:31:00+08:00",
    parseStatus: "PENDING",
    textLayer: true,
    tableLikely: false,
    imageQuality: "high",
    warnings: [],
    ...overrides
  };
}

async function textProofDescriptor(text: string): Promise<PaymentProofInputDescriptor> {
  const dir = await mkdtemp(join(tmpdir(), "reconpilot-extraction-"));
  const filePath = join(dir, "proof.txt");
  await writeFile(filePath, text, "utf8");

  return descriptor({
    fileName: "proof.txt",
    sizeBytes: Buffer.byteLength(text),
    storageRef: { kind: "local_path", uri: filePath, sha256: null }
  });
}

describe("Extraction Agent", () => {
  it("selects different routes from proof descriptor inspection metadata", () => {
    const routes = [
      descriptor({ mimeType: "application/pdf", textLayer: true, tableLikely: false, imageQuality: "high" }),
      descriptor({ mimeType: "application/pdf", textLayer: true, tableLikely: true, imageQuality: "high" }),
      descriptor({ mimeType: "image/png", textLayer: false, tableLikely: false, imageQuality: "medium" }),
      descriptor({ mimeType: "image/jpeg", textLayer: false, tableLikely: false, imageQuality: "low" })
    ].map((item) => selectInitialRoute(item));

    expect(routes).toEqual(["parse_pdf_text", "parse_pdf_table", "parse_image_ocr", "manual_correction"]);
  });

  it("calculates weighted confidence from critical fields", () => {
    expect(
      calculateOverallConfidence({
        "financialPayload.paidAmount.value": 1,
        "financialPayload.paymentDate": 1,
        "financialPayload.reference.raw": 1,
        "financialPayload.debtor.rawName": 1,
        "financialPayload.creditor.rawName": 1
      })
    ).toBe(1);
  });

  it("returns schema-valid raw extraction output with a visible timeline", async () => {
    const result = await runExtractionAgent(
      await textProofDescriptor(
        "Wise transfer receipt. Paid USD 10.00 to ReconPilot Sdn Bhd. Reference INV-1001. Date 2026-05-20. Status: Paid. Payer: Acme Pte Ltd."
      )
    );

    expect(paymentProofExtractionOutputSchema.safeParse(result.extraction).success).toBe(true);
    expect(result.extraction.aiMetadata.extractionRoute).toBe("parse_pdf_text");
    expect(result.extraction.financialPayload.reference).toEqual({ raw: "INV-1001" });
    expect(JSON.stringify(result.extraction)).not.toContain("normalizedName");
    expect(result.timeline.map((event) => event.action)).toContain("Selected extraction route");
    expect(result.timeline.map((event) => event.action)).toContain("Assembled extraction output");
  });

  it("keeps low-quality proof truthful and manual-reviewable", async () => {
    const result = await runExtractionAgent(
      descriptor({ mimeType: "image/jpeg", textLayer: false, tableLikely: false, imageQuality: "low" })
    );

    expect(result.extraction.aiMetadata.extractionRoute).toBe("manual_correction");
    expect(result.extraction.aiMetadata.requiresManualReview).toBe(true);
    expect(result.extraction.financialPayload.paidAmount).toBeNull();
    expect(result.extraction.aiMetadata.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["MISSING_PAID_AMOUNT", "MISSING_PAYMENT_DATE", "MISSING_PAYMENT_REFERENCE", "LOW_QUALITY_PROOF"])
    );
  });
});
