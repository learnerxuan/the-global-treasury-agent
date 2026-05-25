import { describe, expect, it } from "vitest";
import { cleanNormalizedBatch } from "../fixtures/normalized/clean";
import { classifyMatch } from "./classify";
import { DEFAULT_POLICY } from "./policy";
import type {
  AmountResidualResult,
  CompetitionResult,
  HardReviewFlag,
  ReasonCode,
  ScoredCandidate
} from "./types";

const RESIDUAL: AmountResidualResult = {
  bestScenario: null,
  residualAmount: "0.00",
  residualPercent: 0,
  band: "WITHIN_TOLERANCE",
  exceedsHardReviewThreshold: false
};

function scored(score: number, opts: { flags?: HardReviewFlag[]; reasons?: ReasonCode[]; id?: string } = {}): ScoredCandidate {
  return {
    candidate: {
      candidateId: opts.id ?? "CAND-1",
      bankTransactionId: cleanNormalizedBatch.bankTransactions[0]!.internalTxId,
      proofId: "proof_001",
      expectedPaymentId: "exp_file_001_row002",
      signals: [],
      bankTransaction: cleanNormalizedBatch.bankTransactions[0]!,
      proof: cleanNormalizedBatch.paymentProofs[0]!,
      expectedPayment: cleanNormalizedBatch.expectedPayments[0]!
    },
    score,
    breakdown: { reference: 0, amountFx: 0, date: 0, name: 0, confidence: 0, competitionPenalty: 0 },
    fxScenarios: [],
    residual: RESIDUAL,
    feeHypothesis: { direction: "NONE", hypotheses: [], amount: null },
    reasonCodes: opts.reasons ?? [],
    hardReviewFlags: opts.flags ?? []
  };
}

const NO_COMPETITION: CompetitionResult = { hasCompetition: false, topScore: 0, runnerUpScore: null, gap: null };

describe("classifyMatch", () => {
  it("auto-matches a high score with no hard flags or competition", () => {
    const result = classifyMatch({ scoredCandidates: [scored(100)], competition: NO_COMPETITION, policy: DEFAULT_POLICY });
    if (!result.ok) return;
    expect(result.data.status).toBe("AUTO_MATCHED");
    expect(result.data.selectedCandidate?.candidate.candidateId).toBe("CAND-1");
  });

  it("likely-matches a strong-but-imperfect score", () => {
    const result = classifyMatch({ scoredCandidates: [scored(85)], competition: NO_COMPETITION, policy: DEFAULT_POLICY });
    if (!result.ok) return;
    expect(result.data.status).toBe("LIKELY_MATCHED");
  });

  it("downgrades a high score to NEEDS_REVIEW when a hard flag is present", () => {
    const result = classifyMatch({
      scoredCandidates: [scored(96, { flags: ["RESIDUAL_ABOVE_THRESHOLD"] })],
      competition: NO_COMPETITION,
      policy: DEFAULT_POLICY
    });
    if (!result.ok) return;
    expect(result.data.status).toBe("NEEDS_REVIEW");
    expect(result.data.hardReviewFlags).toContain("RESIDUAL_ABOVE_THRESHOLD");
  });

  it("downgrades to NEEDS_REVIEW when candidates compete closely", () => {
    const competition: CompetitionResult = { hasCompetition: true, topScore: 90, runnerUpScore: 85, gap: 5 };
    const result = classifyMatch({
      scoredCandidates: [scored(90, { id: "A" }), scored(85, { id: "B" })],
      competition,
      policy: DEFAULT_POLICY
    });
    if (!result.ok) return;
    expect(result.data.status).toBe("NEEDS_REVIEW");
    expect(result.data.reasonCodes).toContain("COMPETING_CANDIDATES");
    expect(result.data.hardReviewFlags).toContain("COMPETING_CANDIDATES_CLOSE");
  });

  it("returns UNMATCHED with NO_CANDIDATE when there are no candidates", () => {
    const result = classifyMatch({ scoredCandidates: [], competition: NO_COMPETITION, policy: DEFAULT_POLICY });
    if (!result.ok) return;
    expect(result.data.status).toBe("UNMATCHED");
    expect(result.data.selectedCandidate).toBeNull();
    expect(result.data.reasonCodes).toContain("NO_CANDIDATE");
  });

  it("keeps a low score UNMATCHED rather than upgrading on hard flags", () => {
    const result = classifyMatch({
      scoredCandidates: [scored(40, { flags: ["PROOF_NOT_SETTLED"] })],
      competition: NO_COMPETITION,
      policy: DEFAULT_POLICY
    });
    if (!result.ok) return;
    expect(result.data.status).toBe("UNMATCHED");
  });
});
