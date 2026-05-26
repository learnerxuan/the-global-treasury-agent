import { describe, expect, it } from "vitest";
import { fxVarianceBatch, noCandidateBatch } from "../../lib/recon/reconciliation/fixtures";
import { runReconciliationOrchestrator } from "../../lib/recon/reconciliation/orchestrator";
import type { NormalizedInputBatch } from "../../lib/recon/types";
import {
  allocationReasonLabel,
  buildDisplayRow,
  candidateKindLabel,
  evidenceTrustMeta,
  formatMoney,
  fxBasisLabel,
  fxProviderLabel,
  fxSourceKindLabel,
  statusMeta
} from "./adapter";
import type { ReconciliationRun, RunStatus } from "./types";

// Build a UI-shaped ReconciliationRun directly from real engine output so the
// adapter is exercised against genuine Agent 2 results — not hand-written JSON.
function runFromBatch(batch: NormalizedInputBatch, proofIndex = 0): ReconciliationRun {
  const output = runReconciliationOrchestrator(batch);
  const proofId = batch.paymentProofs[proofIndex]?.proofId ?? null;
  const selectedResult = output.results.find((result) => result.proofId === proofId) ?? output.results[0] ?? null;
  const status = (selectedResult?.status ?? "NO_PROOF_RECORD") as RunStatus;

  return {
    runId: `recon_test_${batch.batchId}`,
    trigger: "payment_proof_uploaded",
    createdAt: new Date().toISOString(),
    status,
    proofId,
    proofPath: "waiting/payment_proofs/test.json",
    summary: selectedResult?.explanation ?? "No result",
    nextAction: "Test next action",
    selectedResult,
    movedRecords: [],
    batch,
    reconciliation: {
      timeline: output.timeline,
      results: output.results,
      artifactRequests: output.artifactRequests,
      humanReviewRequests: output.humanReviewRequests,
      summary: output.summary
    },
    outputPaths: {
      reconciliationReportPath: status === "AUTO_MATCHED" ? "completed/reconciliation_reports/test.json" : null,
      discrepancySummaryPath: status === "AUTO_MATCHED" ? null : "discrepancies/discrepancy_summaries/test.json",
      mockNotificationPath: status === "AUTO_MATCHED" ? null : "discrepancies/mock_notifications/test.json",
      runPath: "reconciliation_runs/test.json"
    }
  };
}

describe("dashboard adapter", () => {
  it("formats money with currency and grouping", () => {
    expect(formatMoney({ value: "42500.00", currency: "MYR" })).toBe("MYR 42,500");
    expect(formatMoney({ value: "9.75", currency: "USD" })).toBe("USD 9.75");
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney({ value: null, currency: "USD" })).toBe("—");
  });

  it("maps statuses to chip tone and action label", () => {
    expect(statusMeta("AUTO_MATCHED")).toMatchObject({ tone: "success", actionLabel: "View" });
    expect(statusMeta("NEEDS_REVIEW")).toMatchObject({ tone: "review", actionLabel: "Review" });
    expect(statusMeta("UNMATCHED")).toMatchObject({ tone: "error", actionLabel: "Inspect" });
  });

  it("labels FX bases in plain English", () => {
    expect(fxBasisLabel("payment_date")).toBe("Payment date");
    expect(fxBasisLabel("invoice_date")).toBe("Invoice date");
  });

  it("labels enterprise FX source kinds and the BNM provider", () => {
    expect(fxSourceKindLabel("bank_actual")).toBe("Bank actual rate");
    expect(fxSourceKindLabel("market_cached")).toBe("Live market rate (cached)");
    expect(fxSourceKindLabel("spread_adjusted")).toBe("Spread-adjusted market rate");
    expect(fxSourceKindLabel(undefined)).toBe("—");
    expect(fxProviderLabel("bnm")).toBe("Bank Negara Malaysia (BNM)");
    expect(fxProviderLabel(undefined)).toBeNull();
  });

  it("labels candidate kinds and allocation reasons", () => {
    expect(candidateKindLabel("batch_invoices")).toBe("Batch · multiple invoices");
    expect(candidateKindLabel("single_invoice")).toBe("Single invoice");
    expect(allocationReasonLabel("subset_sum")).toBe("Matched by amount sum");
    expect(allocationReasonLabel("partial_payment")).toBe("Partial payment");
  });

  it("maps evidence trust levels to tone-coded chips", () => {
    expect(evidenceTrustMeta("deterministic")).toMatchObject({ tone: "success" });
    expect(evidenceTrustMeta("weak_ai")).toMatchObject({ tone: "review" });
    expect(evidenceTrustMeta("missing_proof")).toMatchObject({ tone: "error" });
  });

  it("builds a populated display row from a real auto-matchable run", () => {
    const run = runFromBatch(fxVarianceBatch);
    const row = buildDisplayRow(run);

    expect(row.id).toBe(run.runId);
    expect(row.status).toBe(run.status);
    // Invoice + customer + amounts must resolve from the batch, not be placeholders.
    expect(row.invoiceLabel).not.toBe("—");
    expect(row.customerLabel).not.toBe("—");
    expect(row.expectedAmountLabel).toMatch(/USD/);
    expect(row.receivedAmountLabel).toMatch(/MYR/);
    expect(row.scoreLabel).toMatch(/^\d+$/);
    // The engine emits an Agent 2 timeline that the modal renders.
    expect(run.reconciliation.timeline.length).toBeGreaterThan(0);
  });

  it("handles an unmatched run without throwing and degrades labels gracefully", () => {
    const run = runFromBatch(noCandidateBatch);
    const row = buildDisplayRow(run);
    expect(row.id).toBe(run.runId);
    expect(["UNMATCHED", "NEEDS_REVIEW", "NO_PROOF_RECORD"]).toContain(row.status);
    // Score is always a string label: either digits or an em dash, never undefined.
    expect(row.scoreLabel === "—" || /^\d+$/.test(row.scoreLabel)).toBe(true);
    // FX basis degrades to an em dash when no scenario was usable.
    expect(typeof row.fxBasisLabel).toBe("string");
  });
});
