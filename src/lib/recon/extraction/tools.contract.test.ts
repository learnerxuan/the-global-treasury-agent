import { describe, expect, it } from "vitest";
import { proofToolFixtures } from "./fixtures.js";
import { getExtractionToolRegistry } from "./tools.js";

describe("extraction tool registry and Agent 1 boundary", () => {
  it("exports one concrete tool for every Block 2 route", async () => {
    const registry = await getExtractionToolRegistry();
    expect(Object.keys(registry).sort()).toEqual(["manual_correction", "parse_image_ocr", "parse_pdf_table", "parse_pdf_text"]);
  });

  it("calls the concrete tool mapped to each fixture route", async () => {
    const registry = await getExtractionToolRegistry();
    for (const fixture of proofToolFixtures) {
      const result = await registry[fixture.expectedRoute](fixture.descriptor);
      expect(result.route).toBe(fixture.expectedRoute);
      expect(result).toHaveProperty("candidateFinancialPayload");
      expect(result).toHaveProperty("fieldConfidence");
      expect(result).toHaveProperty("evidenceSpans");
      expect(result).toHaveProperty("warnings");
    }
  });

  it("does not normalize, match, classify, or generate artifacts", async () => {
    const registry = await getExtractionToolRegistry();
    for (const fixture of proofToolFixtures) {
      const result = await registry[fixture.expectedRoute](fixture.descriptor);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("normalizedName");
      expect(serialized).not.toContain("\"normalized\"");
      expect(serialized).not.toContain("reconciliationStatus");
      expect(serialized).not.toContain("matchScore");
      expect(serialized).not.toContain("classification");
      expect(serialized).not.toContain("bankTransaction");
      expect(serialized).not.toContain("expectedPayment");
      expect(serialized).not.toContain("fxScenario");
      expect(serialized).not.toContain("artifact");
    }
  });
});
