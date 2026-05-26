import { describe, expect, it } from "vitest";
import { buildAgentRailViewModel } from "./AgentRail";
import type { ReconciliationDisplayRow, ReconciliationRun } from "./types";

function runFixture(overrides: Partial<ReconciliationRun> = {}): ReconciliationRun {
  const run: ReconciliationRun = {
    runId: "run_a",
    trigger: "payment_proof_uploaded",
    createdAt: "2026-05-26T08:00:00.000Z",
    status: "NEEDS_REVIEW",
    proofId: "proof_a",
    proofPath: "waiting/payment_proofs/proof_a.json",
    summary: "Payment needs review.",
    nextAction: "Review the payment evidence.",
    selectedResult: {
      caseId: "case_a",
      status: "NEEDS_REVIEW",
      selectedCandidateId: "candidate_a",
      expectedPaymentId: "invoice_a",
      proofId: "proof_a",
      bankTransactionId: "bank_a",
      candidateKind: "single_invoice",
      score: 71,
      reasonCodes: ["PARTIAL_REFERENCE_MATCH", "FX_EXPLAINS_AMOUNT"],
      hardReviewFlags: ["LOW_CONFIDENCE_CRITICAL_FIELD"],
      bestFxScenario: {
        scenarioId: "fx_a",
        label: "Payment date rate",
        basis: "payment_date",
        foreignAmount: { value: "500.00", currency: "USD" },
        rate: "4.71",
        rateDate: "2026-05-25",
        rateSource: "live_api",
        providerId: "ecb",
        fxSourceKind: "market_cached",
        spreadMargin: 0,
        isFallback: false,
        expectedLocalAmount: { value: "2355.00", currency: "MYR" },
        residualAmount: "0.00",
        residualPercent: 0
      },
      residual: {
        bestScenario: null,
        residualAmount: "25.00",
        residualPercent: 0.02,
        band: "SMALL_VARIANCE",
        exceedsHardReviewThreshold: false,
        residualClassification: "fxVariance",
        absoluteCap: "100.00",
        exceedsAbsoluteCap: false
      },
      evidenceTrust: {
        level: "weak_ai",
        extractionRoute: "ocr",
        hasEvidenceSpans: false,
        criticalFieldsChecked: ["amount"],
        issues: [
          {
            source: "payment_proof",
            field: "amount",
            confidence: 0.51,
            threshold: 0.8,
            message: "Amount was extracted below the confidence threshold."
          }
        ]
      },
      reviewPayload: {
        required: true,
        primaryQuestion: "Does this USD 500 payment match invoice INV-100?",
        blockers: ["LOW_CONFIDENCE_CRITICAL_FIELD"],
        suggestedActions: ["Check proof amount"]
      },
      policyVersion: "policy-2026-05",
      explanation: "The reference partially matched and the amount needs review."
    },
    movedRecords: [],
    batch: {
      schemaVersion: "1.0.0",
      batchId: "batch_a",
      uploadedAt: "2026-05-26T08:00:00.000Z",
      expectedPayments: [],
      bankTransactions: [],
      paymentProofs: [],
      warnings: [],
      timelines: []
    },
    reconciliation: {
      timeline: [
        {
          step: 1,
          timestamp: "2026-05-26T08:00:01.000Z",
          actor: "Agent 2",
          eventType: "ACTION_SELECTED",
          action: "Started matching run",
          resultSummary: "Loaded records",
          reasoning: "Start",
          relatedIds: { caseId: "case_a", proofId: "proof_a" }
        },
        {
          step: 2,
          timestamp: "2026-05-26T08:00:02.000Z",
          actor: "Reconciliation Tool",
          eventType: "TOOL_RESULT",
          action: "Checked FX",
          resultSummary: "Live provider returned a rate",
          reasoning: "FX",
          relatedIds: { bankTransactionId: "bank_a", expectedPaymentId: "invoice_a" }
        },
        {
          step: 3,
          timestamp: "2026-05-26T08:00:03.000Z",
          actor: "Artifact Module",
          eventType: "ARTIFACT_REQUESTED",
          action: "Prepared unrelated report",
          reasoning: "Other case",
          relatedIds: { caseId: "case_other" }
        }
      ],
      results: [],
      artifactRequests: [],
      humanReviewRequests: [],
      summary: { autoMatched: 0, likelyMatched: 0, needsReview: 1, unmatched: 0 }
    },
    outputPaths: {
      reconciliationReportPath: null,
      discrepancySummaryPath: "discrepancies/test.json",
      mockNotificationPath: null,
      runPath: "runs/test.json"
    },
    ...overrides
  };

  return run;
}

function rowFixture(run: ReconciliationRun): ReconciliationDisplayRow {
  return {
    id: run.runId,
    status: run.status,
    bankDateLabel: "2026-05-26",
    bankRefLabel: "MBB-100",
    invoiceLabel: "INV-100",
    customerLabel: "Acme",
    expectedAmountLabel: "USD 500",
    expectedAmountMyr: "approx RM 2,355",
    receivedAmountLabel: "MYR 2,380",
    receivedAmountMyr: null,
    fxBasisLabel: "Payment date · 4.71",
    scoreLabel: "71",
    summary: run.summary,
    run
  };
}

describe("AgentRail view model", () => {
  it("builds the aggregate rail with business-friendly labels and dynamic live FX counts", () => {
    const first = runFixture();
    const second = runFixture({
      runId: "run_b",
      selectedResult: {
        ...runFixture().selectedResult!,
        caseId: "case_b",
        hardReviewFlags: [],
        evidenceTrust: { ...runFixture().selectedResult!.evidenceTrust!, issues: [] },
        bestFxScenario: {
          ...runFixture().selectedResult!.bestFxScenario!,
          providerId: "wise",
          fxSourceKind: "spread_adjusted"
        }
      }
    });

    const view = buildAgentRailViewModel({ runs: [first, second], selectedRow: null, latestRun: first });

    expect(view.mode).toBe("aggregate");
    expect(view.reviewTitle).toBe("Ready for review");
    expect(view.checks).toContain("Policy Validation");
    expect(view.riskIndicators).toContain("1 Critical Warning");
    expect(view.riskIndicators).toContain("1 Document Discrepancy");
    expect(view.riskIndicators).toContain("2 live FX checks");
  });

  it("builds the detail rail from only the selected transaction", () => {
    const selectedRun = runFixture();
    const otherRun = runFixture({ runId: "run_other", nextAction: "Other action" });

    const view = buildAgentRailViewModel({
      runs: [otherRun, selectedRun],
      selectedRow: rowFixture(selectedRun),
      latestRun: otherRun
    });

    expect(view.mode).toBe("detail");
    expect(view.reviewTitle).toBe("Does this USD 500 payment match invoice INV-100?");
    expect(view.timeline).toHaveLength(2);
    expect(view.checks).toContain("Reference match reviewed");
    expect(view.checks).toContain("Live FX verification");
    expect(view.riskIndicators).toContain("Critical Warning: Low-confidence critical field");
    expect(view.riskIndicators).toContain("Document Discrepancy: Amount was extracted below the confidence threshold.");
  });
});
