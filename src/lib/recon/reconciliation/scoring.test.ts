import { describe, expect, it } from "vitest";
import type { NormalizedPaymentProofRecord } from "../types";
import { cleanNormalizedBatch } from "../fixtures/normalized/clean";
import { calculateFxScenarios } from "./calculate-fx-scenarios";
import { evaluateAmountResidual, evaluateFeeHypothesis } from "./evaluate-residual";
import { generateBankAnchoredCandidates } from "./generate-candidates";
import { DEFAULT_POLICY } from "./policy";
import { detectCompetingCandidates, scoreCandidate } from "./scoring";
import type {
  AmountResidualResult,
  FeeHypothesisResult,
  FxScenarioResult,
  MatchCandidate,
  ScoredCandidate
} from "./types";

// Run the full upstream pipeline to get a realistic ScoredCandidate.
function scoreFromBatch(): ScoredCandidate {
  const candidates = generateBankAnchoredCandidates({ batch: cleanNormalizedBatch, policy: DEFAULT_POLICY });
  if (!candidates.ok) throw new Error("candidate generation failed");
  const candidate = candidates.data.candidatesByBankTx["txn_bank_001_row002"]![0]!;
  const fx = calculateFxScenarios({ candidate, policy: DEFAULT_POLICY });
  if (!fx.ok) throw new Error("fx failed");
  const residual = evaluateAmountResidual({ fxScenarios: fx.data, policy: DEFAULT_POLICY });
  if (!residual.ok) throw new Error("residual failed");
  const fee = evaluateFeeHypothesis({ residual: residual.data, policy: DEFAULT_POLICY });
  if (!fee.ok) throw new Error("fee failed");
  const scored = scoreCandidate({
    candidate,
    fxScenarios: fx.data,
    residual: residual.data,
    feeHypothesis: fee.data,
    policy: DEFAULT_POLICY
  });
  if (!scored.ok) throw new Error("score failed");
  return scored.data;
}

const NO_SCENARIO_RESIDUAL: AmountResidualResult = {
  bestScenario: null,
  residualAmount: null,
  residualPercent: null,
  band: "NO_SCENARIO",
  exceedsHardReviewThreshold: true,
  residualClassification: "unexplained",
  absoluteCap: null,
  exceedsAbsoluteCap: true
};

const NONE_FEE: FeeHypothesisResult = { direction: "NONE", hypotheses: [], amount: null };

function makeCandidate(proofOverrides: Partial<NormalizedPaymentProofRecord["financialPayload"]>, aiOverrides: Partial<NormalizedPaymentProofRecord["aiMetadata"]> = {}): MatchCandidate {
  const baseProof = cleanNormalizedBatch.paymentProofs[0]!;
  const proof: NormalizedPaymentProofRecord = {
    ...baseProof,
    financialPayload: { ...baseProof.financialPayload, ...proofOverrides },
    aiMetadata: { ...baseProof.aiMetadata, ...aiOverrides }
  };
  return {
    candidateId: "CAND-X",
    candidateKind: "single_invoice",
    bankTransactionId: cleanNormalizedBatch.bankTransactions[0]!.internalTxId,
    proofId: proof.proofId,
    expectedPaymentId: cleanNormalizedBatch.expectedPayments[0]!.expectedPaymentId,
    expectedPaymentIds: [cleanNormalizedBatch.expectedPayments[0]!.expectedPaymentId],
    signals: [{ code: "EXACT_REFERENCE_MATCH", strength: "STRONG", detail: "ref" }],
    bankTransaction: cleanNormalizedBatch.bankTransactions[0]!,
    proof,
    expectedPayment: cleanNormalizedBatch.expectedPayments[0]!,
    expectedPayments: [cleanNormalizedBatch.expectedPayments[0]!]
  };
}

const cleanFx: FxScenarioResult[] = [
  {
    scenarioId: "s",
    label: "payment",
    basis: "payment_date",
    foreignAmount: { value: "250.00", currency: "USD" },
    rate: "1",
    rateDate: "2026-05-20",
    rateSource: "same_currency",
    fxSourceKind: "market_cached",
    spreadMargin: 0,
    isFallback: false,
    expectedLocalAmount: { value: "250.00", currency: "USD" },
    residualAmount: "0.00",
    residualPercent: 0
  }
];

const cleanResidual: AmountResidualResult = {
  bestScenario: cleanFx[0]!,
  residualAmount: "0.00",
  residualPercent: 0,
  band: "WITHIN_TOLERANCE",
  exceedsHardReviewThreshold: false,
  residualClassification: "none",
  absoluteCap: "50.00",
  exceedsAbsoluteCap: false
};

const EVIDENCE_TRUST = {
  level: "supported_ai" as const,
  extractionRoute: "parse_pdf_text",
  hasEvidenceSpans: false,
  criticalFieldsChecked: [],
  issues: []
};

describe("scoreCandidate", () => {
  it("scores a clean exact-reference case at auto-match level with no hard flags", () => {
    const scored = scoreFromBatch();
    expect(scored.score).toBeGreaterThanOrEqual(95);
    expect(scored.hardReviewFlags).toEqual([]);
    expect(scored.reasonCodes).toContain("EXACT_REFERENCE_MATCH");
    expect(scored.reasonCodes).toContain("AMOUNT_WITHIN_TOLERANCE");
    expect(scored.breakdown.reference).toBe(35);
    expect(scored.breakdown.amountFx).toBe(30);
  });

  it("flags low critical-field confidence", () => {
    const candidate = makeCandidate(
      {},
      { overallConfidence: 0.7, fieldConfidence: { "paidAmount.value": 0.6, "reference.raw": 0.95, paymentDate: 0.9 } }
    );
    const scored = scoreCandidate({ candidate, fxScenarios: cleanFx, residual: cleanResidual, feeHypothesis: NONE_FEE, policy: DEFAULT_POLICY });
    if (!scored.ok) return;
    expect(scored.data.hardReviewFlags).toContain("LOW_CONFIDENCE_CRITICAL_FIELD");
  });

  it("flags low critical-field confidence using workflow field paths", () => {
    const candidate = makeCandidate(
      {},
      {
        overallConfidence: 0.95,
        fieldConfidence: {
          "financialPayload.paidAmount.value": 0.95,
          "financialPayload.reference.raw": 0.95,
          "financialPayload.paymentDate": 0.6
        }
      }
    );
    const scored = scoreCandidate({ candidate, fxScenarios: cleanFx, residual: cleanResidual, feeHypothesis: NONE_FEE, policy: DEFAULT_POLICY });
    if (!scored.ok) return;
    expect(scored.data.hardReviewFlags).toContain("LOW_CONFIDENCE_CRITICAL_FIELD");
  });

  it("does not flag low paidAmount confidence when another proof amount is usable", () => {
    const candidate = makeCandidate(
      { paidAmount: null, netAmount: { value: "250.00", currency: "USD" } },
      {
        overallConfidence: 0.95,
        fieldConfidence: {
          "financialPayload.paidAmount.value": 0.6,
          "financialPayload.reference.raw": 0.95,
          "financialPayload.paymentDate": 0.9
        }
      }
    );
    const scored = scoreCandidate({ candidate, fxScenarios: cleanFx, residual: cleanResidual, feeHypothesis: NONE_FEE, policy: DEFAULT_POLICY });
    if (!scored.ok) return;
    expect(scored.data.hardReviewFlags).not.toContain("LOW_CONFIDENCE_CRITICAL_FIELD");
  });

  it("does not flag a pending proof status (settlement is proven by the matched bank credit)", () => {
    const candidate = makeCandidate({ paymentStatus: "PNDG" });
    const scored = scoreCandidate({ candidate, fxScenarios: cleanFx, residual: cleanResidual, feeHypothesis: NONE_FEE, policy: DEFAULT_POLICY });
    if (!scored.ok) return;
    expect(scored.data.hardReviewFlags).not.toContain("PROOF_NOT_SETTLED");
  });

  it("credits a similar name fully when an exact reference anchors identity, half otherwise", () => {
    const base = makeCandidate({});
    const withExact: MatchCandidate = {
      ...base,
      signals: [
        { code: "EXACT_REFERENCE_MATCH", strength: "STRONG", detail: "ref" },
        { code: "NAME_SIMILAR", strength: "MEDIUM", detail: "similar payer" }
      ]
    };
    const withoutExact: MatchCandidate = {
      ...base,
      signals: [
        { code: "PARTIAL_REFERENCE_MATCH", strength: "MEDIUM", detail: "ref" },
        { code: "NAME_SIMILAR", strength: "MEDIUM", detail: "similar payer" }
      ]
    };
    const a = scoreCandidate({ candidate: withExact, fxScenarios: cleanFx, residual: cleanResidual, feeHypothesis: NONE_FEE, policy: DEFAULT_POLICY });
    const b = scoreCandidate({ candidate: withoutExact, fxScenarios: cleanFx, residual: cleanResidual, feeHypothesis: NONE_FEE, policy: DEFAULT_POLICY });
    if (!a.ok || !b.ok) return;
    // Exact reference + similar name => full name credit (counterparty is anchored).
    expect(a.data.breakdown.name).toBe(DEFAULT_POLICY.score.nameMax);
    // Partial reference + similar name => only half (identity not firmly anchored).
    expect(b.data.breakdown.name).toBe(Math.round(DEFAULT_POLICY.score.nameMax / 2));
  });

  it("flags a residual above the hard threshold", () => {
    const candidate = makeCandidate({});
    const significant: AmountResidualResult = {
      bestScenario: cleanFx[0]!,
      residualAmount: "-1487.50",
      residualPercent: 0.035,
      band: "SIGNIFICANT_VARIANCE",
      exceedsHardReviewThreshold: true,
      residualClassification: "shortPayment",
      absoluteCap: "50.00",
      exceedsAbsoluteCap: true
    };
    const fee: FeeHypothesisResult = { direction: "SHORT", amount: "1487.50", hypotheses: ["Possible fee"] };
    const scored = scoreCandidate({ candidate, fxScenarios: cleanFx, residual: significant, feeHypothesis: fee, policy: DEFAULT_POLICY });
    if (!scored.ok) return;
    expect(scored.data.hardReviewFlags).toContain("RESIDUAL_ABOVE_THRESHOLD");
    expect(scored.data.reasonCodes).toContain("AMOUNT_SIGNIFICANT_VARIANCE");
    expect(scored.data.reasonCodes).toContain("POSSIBLE_SHORT_PAYMENT");
  });

  it("flags a missing FX scenario", () => {
    const candidate = makeCandidate({});
    const scored = scoreCandidate({ candidate, fxScenarios: [], residual: NO_SCENARIO_RESIDUAL, feeHypothesis: NONE_FEE, policy: DEFAULT_POLICY });
    if (!scored.ok) return;
    expect(scored.data.hardReviewFlags).toContain("NO_FX_SCENARIO");
    expect(scored.data.reasonCodes).toContain("NO_USABLE_FX_SCENARIO");
  });
});

function scoredWith(score: number, candidateId: string, expectedPaymentId = `inv_${candidateId}`): ScoredCandidate {
  return {
    candidate: { ...makeCandidate({}), candidateId, expectedPaymentId, expectedPaymentIds: [expectedPaymentId] },
    score,
    breakdown: { reference: 0, amountFx: 0, date: 0, name: 0, confidence: 0, competitionPenalty: 0 },
    fxScenarios: cleanFx,
    residual: cleanResidual,
    feeHypothesis: NONE_FEE,
    evidenceTrust: EVIDENCE_TRUST,
    reasonCodes: [],
    hardReviewFlags: []
  };
}

describe("detectCompetingCandidates", () => {
  it("detects competition when two different-invoice candidates are within the gap", () => {
    const result = detectCompetingCandidates({ scoredCandidates: [scoredWith(90, "A", "inv_A"), scoredWith(85, "B", "inv_B")], policy: DEFAULT_POLICY });
    if (!result.ok) return;
    expect(result.data.hasCompetition).toBe(true);
    expect(result.data.gap).toBe(5);
  });

  it("reports no competition when there is a clear winner", () => {
    const result = detectCompetingCandidates({ scoredCandidates: [scoredWith(95, "A", "inv_A"), scoredWith(70, "B", "inv_B")], policy: DEFAULT_POLICY });
    if (!result.ok) return;
    expect(result.data.hasCompetition).toBe(false);
    expect(result.data.gap).toBe(25);
  });

  it("does not flag competition between two candidates for the SAME invoice (e.g. duplicate proofs)", () => {
    // Two close scores, but both settle the same invoice — no ambiguity, must not block.
    const result = detectCompetingCandidates({ scoredCandidates: [scoredWith(100, "A", "inv_X"), scoredWith(98, "B", "inv_X")], policy: DEFAULT_POLICY });
    if (!result.ok) return;
    expect(result.data.hasCompetition).toBe(false);
    expect(result.data.runnerUpScore).toBeNull();
  });

  it("reports no competition for a single candidate", () => {
    const result = detectCompetingCandidates({ scoredCandidates: [scoredWith(95, "A")], policy: DEFAULT_POLICY });
    if (!result.ok) return;
    expect(result.data.hasCompetition).toBe(false);
    expect(result.data.runnerUpScore).toBeNull();
  });
});
