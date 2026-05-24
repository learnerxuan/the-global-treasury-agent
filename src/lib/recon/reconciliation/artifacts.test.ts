import { describe, expect, it } from "vitest";
import { createArtifactRequest, createHumanReviewRequest, primaryArtifactType } from "./artifacts";

describe("primaryArtifactType", () => {
  it("routes each status to its primary artifact", () => {
    expect(primaryArtifactType("AUTO_MATCHED")).toBe("RECONCILIATION_REPORT");
    expect(primaryArtifactType("LIKELY_MATCHED")).toBe("RECONCILIATION_REPORT_DRAFT");
    expect(primaryArtifactType("NEEDS_REVIEW")).toBe("DISCREPANCY_SUMMARY");
    expect(primaryArtifactType("UNMATCHED")).toBe("DISCREPANCY_SUMMARY");
  });
});

describe("createArtifactRequest", () => {
  it("builds an artifact request with a deterministic id and evidence", () => {
    const result = createArtifactRequest({
      caseId: "CASE-1",
      status: "AUTO_MATCHED",
      type: "RECONCILIATION_REPORT",
      evidenceRefs: [
        { kind: "bank_transaction", id: "txn_1" },
        { kind: "payment_proof", id: "proof_1" }
      ],
      summary: "Clean match."
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.artifactId).toBe("CASE-1-RECONCILIATION_REPORT");
    expect(result.data.type).toBe("RECONCILIATION_REPORT");
    expect(result.data.evidenceRefs).toHaveLength(2);
  });
});

describe("createHumanReviewRequest", () => {
  it("builds a review request with question and reason codes", () => {
    const result = createHumanReviewRequest({
      caseId: "CASE-2",
      severity: "HIGH",
      blocking: false,
      question: "This bank credit is MYR 1487.50 below the best FX explanation. Was a fee deducted?",
      evidenceRefs: [{ kind: "bank_transaction", id: "txn_2" }],
      reasonCodes: ["POSSIBLE_SHORT_PAYMENT"]
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reviewId).toBe("CASE-2-REVIEW");
    expect(result.data.severity).toBe("HIGH");
    expect(result.data.question).toContain("fee");
    expect(result.data.options).toBeUndefined();
  });

  it("preserves options when provided", () => {
    const result = createHumanReviewRequest({
      caseId: "CASE-3",
      severity: "MEDIUM",
      blocking: false,
      question: "Which invoice should receive this payment?",
      options: [
        { optionId: "INV-1001", label: "INV-1001", consequence: "Closes INV-1001" },
        { optionId: "INV-1002", label: "INV-1002", consequence: "Closes INV-1002" }
      ],
      evidenceRefs: [],
      reasonCodes: ["COMPETING_CANDIDATES"]
    });
    if (!result.ok) return;
    expect(result.data.options).toHaveLength(2);
  });
});
