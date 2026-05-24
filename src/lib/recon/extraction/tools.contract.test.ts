import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { PaymentProofInputDescriptor } from "../types";
import { getExtractionToolRegistry, type ExtractionRoute } from "./tools";

function descriptor(route: ExtractionRoute, storageRef: PaymentProofInputDescriptor["storageRef"]): PaymentProofInputDescriptor {
  return {
    schemaVersion: "1.0.0",
    fileId: `proof_file_${route}`,
    fileName: route === "parse_image_ocr" ? "proof.png" : "proof.txt",
    mimeType: route === "parse_image_ocr" ? "image/png" : "text/plain",
    inputKind: "payment_proof",
    sizeBytes: 128,
    storageRef,
    uploadedAt: "2026-05-23T18:31:00+08:00",
    parseStatus: "PENDING",
    textLayer: route !== "parse_image_ocr",
    tableLikely: route === "parse_pdf_table",
    imageQuality: route === "manual_correction" ? "low" : "high",
    warnings: []
  };
}

async function textStorageRef(): Promise<PaymentProofInputDescriptor["storageRef"]> {
  const dir = await mkdtemp(join(tmpdir(), "reconpilot-tools-"));
  const filePath = join(dir, "proof.txt");
  await writeFile(
    filePath,
    "Bank: Wise. Payer: Acme Pte Ltd. Beneficiary: ReconPilot Sdn Bhd. Amount: USD 10.00. Reference: INV-1001. Payment Date: 2026-05-20. Status: Paid.",
    "utf8"
  );

  return { kind: "local_path", uri: filePath, sha256: null };
}

describe("extraction tool registry and Agent 1 boundary", () => {
  it("exports one concrete tool for every extraction route", async () => {
    const registry = await getExtractionToolRegistry();
    expect(Object.keys(registry).sort()).toEqual(["manual_correction", "parse_image_ocr", "parse_pdf_table", "parse_pdf_text"]);
  });

  it("calls the concrete tool mapped to each route", async () => {
    const registry = await getExtractionToolRegistry();
    const storageRef = await textStorageRef();
    const routes: ExtractionRoute[] = ["parse_pdf_text", "parse_pdf_table", "parse_image_ocr", "manual_correction"];

    for (const route of routes) {
      const result = await registry[route](descriptor(route, route === "parse_image_ocr" ? null : storageRef));
      expect(result.route).toBe(route);
      expect(result).toHaveProperty("candidateFinancialPayload");
      expect(result).toHaveProperty("fieldConfidence");
      expect(result).toHaveProperty("evidenceSpans");
      expect(result).toHaveProperty("warnings");
    }
  });

  it("does not normalize, match, classify, or generate artifacts", async () => {
    const registry = await getExtractionToolRegistry();
    const result = await registry.parse_pdf_text(descriptor("parse_pdf_text", await textStorageRef()));
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("normalizedName");
    expect(serialized).not.toContain("reconciliationStatus");
    expect(serialized).not.toContain("matchScore");
    expect(serialized).not.toContain("classification");
    expect(serialized).not.toContain("bankTransaction");
    expect(serialized).not.toContain("expectedPayment");
    expect(serialized).not.toContain("fxScenario");
    expect(serialized).not.toContain("artifact");
  });
});
