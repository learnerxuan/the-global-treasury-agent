import { describe, expect, it } from "vitest";
import { proofToolFixtures } from "./fixtures.js";

describe("proofToolFixtures", () => {
  it("covers every Agent 1 extraction route", () => {
    expect(proofToolFixtures.map((fixture) => fixture.expectedRoute).sort()).toEqual([
      "manual_correction",
      "parse_image_ocr",
      "parse_pdf_table",
      "parse_pdf_text"
    ]);
  });

  it("keeps fallback fixture content under demoFixture and real file location under storageRef", () => {
    for (const fixture of proofToolFixtures) {
      expect(fixture.descriptor.inputKind).toBe("payment_proof");
      expect(fixture.descriptor.storageRef).toBeDefined();
      expect(fixture.descriptor.demoFixture).toBeDefined();
      expect("rawText" in fixture.descriptor).toBe(false);
      expect("rawTable" in fixture.descriptor).toBe(false);
      expect("rawOcr" in fixture.descriptor).toBe(false);
    }
  });
});
