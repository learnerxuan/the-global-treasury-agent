import { describe, expect, it } from "vitest";
import { paymentProofExtractionOutputSchema } from "../schemas.js";
import { proofToolFixtures } from "./fixtures.js";
import { calculateOverallConfidence, runExtractionAgent, selectInitialRoute } from "./extraction-agent.js";

describe("Extraction Agent", () => {
  it("selects different routes for different proof descriptors", () => {
    const routes = proofToolFixtures.map((fixture) => selectInitialRoute(fixture.descriptor));
    expect(new Set(routes).size).toBe(4);
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
    const fixture = proofToolFixtures.find((item) => item.expectedRoute === "parse_pdf_text")!;
    const result = await runExtractionAgent(fixture.descriptor);

    expect(paymentProofExtractionOutputSchema.safeParse(result.extraction).success).toBe(true);
    expect(result.extraction.aiMetadata.extractionRoute).toBe("parse_pdf_text");
    expect(result.extraction.financialPayload.reference).toEqual({ raw: "INV-1001" });
    expect(JSON.stringify(result.extraction)).not.toContain("normalizedName");
    expect(result.timeline.map((event) => event.action)).toContain("Selected extraction route");
    expect(result.timeline.map((event) => event.action)).toContain("Assembled extraction output");
  });

  it("keeps low-quality proof truthful and manual-reviewable", async () => {
    const fixture = proofToolFixtures.find((item) => item.expectedRoute === "manual_correction")!;
    const result = await runExtractionAgent(fixture.descriptor);

    expect(result.extraction.aiMetadata.extractionRoute).toBe("manual_correction");
    expect(result.extraction.aiMetadata.requiresManualReview).toBe(true);
    expect(result.extraction.financialPayload.paidAmount).toBeNull();
    expect(result.extraction.aiMetadata.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["MISSING_PAID_AMOUNT", "MISSING_PAYMENT_DATE", "MISSING_PAYMENT_REFERENCE", "LOW_QUALITY_PROOF"])
    );
  });
});
