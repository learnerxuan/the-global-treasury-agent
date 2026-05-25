import { describe, expect, it } from "vitest";
import { cleanNormalizedBatch } from "../fixtures/normalized/clean";
import {
  competingBatch,
  fxVarianceBatch,
  noCandidateBatch,
  pendingProofBatch,
  shortPaymentBatch
} from "./fixtures";
import { runReconciliationOrchestrator } from "./orchestrator";

const FIXED_NOW = () => "2026-05-24T10:00:00.000Z";

describe("runReconciliationOrchestrator", () => {
  it("auto-matches a clean exact-reference case", () => {
    const output = runReconciliationOrchestrator(cleanNormalizedBatch, { now: FIXED_NOW });
    const result = output.results.find((r) => r.bankTransactionId === "txn_bank_001_row002");
    expect(result?.status).toBe("AUTO_MATCHED");
    expect(result?.expectedPaymentId).toBe("exp_file_001_row002");
    expect(result?.proofId).toBe("proof_001");
    expect(output.summary.autoMatched).toBeGreaterThanOrEqual(1);
    // Auto-matched clean cases get a reconciliation report and no human review.
    expect(output.artifactRequests.some((a) => a.type === "RECONCILIATION_REPORT")).toBe(true);
    expect(output.humanReviewRequests).toEqual([]);
  });

  it("picks the lowest-residual FX scenario for an FX-date-variance case", () => {
    const output = runReconciliationOrchestrator(fxVarianceBatch, { now: FIXED_NOW });
    const result = output.results[0]!;
    expect(result.bestFxScenario?.basis).toBe("payment_date");
    expect(result.bestFxScenario?.residualAmount).toBe("0.00");
    expect(result.residual?.band).toBe("WITHIN_TOLERANCE");
  });

  it("routes a short payment over 2% to NEEDS_REVIEW", () => {
    const output = runReconciliationOrchestrator(shortPaymentBatch, { now: FIXED_NOW });
    const result = output.results[0]!;
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.hardReviewFlags).toContain("RESIDUAL_ABOVE_THRESHOLD");
    expect(output.humanReviewRequests.length).toBeGreaterThanOrEqual(1);
    expect(output.artifactRequests.some((a) => a.type === "DISCREPANCY_SUMMARY")).toBe(true);
  });

  it("returns UNMATCHED with a discrepancy summary and mock email when nothing matches", () => {
    const output = runReconciliationOrchestrator(noCandidateBatch, { now: FIXED_NOW });
    const result = output.results[0]!;
    expect(result.status).toBe("UNMATCHED");
    expect(result.reasonCodes).toContain("NO_CANDIDATE");
    expect(output.artifactRequests.some((a) => a.type === "DISCREPANCY_SUMMARY")).toBe(true);
    expect(output.artifactRequests.some((a) => a.type === "MOCK_EMAIL_DRAFT")).toBe(true);
    expect(output.summary.unmatched).toBe(1);
  });

  it("creates a human review request when candidates compete closely", () => {
    const output = runReconciliationOrchestrator(competingBatch, { now: FIXED_NOW });
    const result = output.results[0]!;
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.reasonCodes).toContain("COMPETING_CANDIDATES");
    const review = output.humanReviewRequests.find((r) => r.reasonCodes.includes("COMPETING_CANDIDATES"));
    expect(review).toBeDefined();
    expect(review?.options?.length).toBeGreaterThanOrEqual(2);
  });

  it("routes pending proof status to human review even when money math matches", () => {
    const output = runReconciliationOrchestrator(pendingProofBatch, { now: FIXED_NOW });
    const result = output.results[0]!;
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.hardReviewFlags).toContain("PROOF_NOT_SETTLED");
  });

  it("emits a timeline with tool calls and observed results", () => {
    const output = runReconciliationOrchestrator(cleanNormalizedBatch, { now: FIXED_NOW });
    expect(output.timeline.length).toBeGreaterThan(0);
    expect(output.timeline.some((e) => e.eventType === "TOOL_CALLED")).toBe(true);
    expect(output.timeline.some((e) => e.eventType === "TOOL_RESULT")).toBe(true);
    expect(output.timeline.some((e) => e.eventType === "CLASSIFICATION_COMPLETED")).toBe(true);
    expect(output.timeline.some((e) => e.toolName === "calculateFxScenarios")).toBe(true);
    expect(output.timeline.some((e) => e.toolName === "evaluateFeeHypothesis")).toBe(true);
    // Steps are sequential starting at 1.
    expect(output.timeline[0]!.step).toBe(1);
  });

  it("returns a schema-stable output envelope", () => {
    const output = runReconciliationOrchestrator(cleanNormalizedBatch, { now: FIXED_NOW });
    expect(output.schemaVersion).toBe("1.0.0");
    expect(output.batchId).toBe(cleanNormalizedBatch.batchId);
    const totals = output.summary.autoMatched + output.summary.likelyMatched + output.summary.needsReview + output.summary.unmatched;
    expect(totals).toBe(output.results.length);
  });
});
