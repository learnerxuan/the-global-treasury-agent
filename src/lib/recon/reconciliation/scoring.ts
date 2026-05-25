import type { ReconciliationPolicy } from "./policy";
import type {
  AmountResidualResult,
  CompetitionResult,
  FeeHypothesisResult,
  FxScenarioResult,
  HardReviewFlag,
  MatchCandidate,
  ReasonCode,
  ScoreBreakdown,
  ScoredCandidate,
  ToolResult
} from "./types";

const SCORE_TOOL = "scoreCandidate";
const COMPETITION_TOOL = "detectCompetingCandidates";

// Proof fields whose low confidence must block an auto-match.
const CRITICAL_PROOF_FIELD_ALIASES = [
  ["financialPayload.paidAmount.value", "paidAmount.value"],
  ["financialPayload.reference.raw", "reference.raw"],
  ["financialPayload.paymentDate", "paymentDate"]
];

function dayDistanceDays(a: string, b: string): number {
  const msA = new Date(`${a.slice(0, 10)}T00:00:00.000Z`).getTime();
  const msB = new Date(`${b.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.abs(msA - msB) / 86_400_000;
}

function hasSignal(candidate: MatchCandidate, code: string): boolean {
  return candidate.signals.some((s) => s.code === code);
}

function scoreReference(candidate: MatchCandidate, policy: ReconciliationPolicy): number {
  if (hasSignal(candidate, "EXACT_REFERENCE_MATCH")) return policy.score.referenceExact;
  if (hasSignal(candidate, "PARTIAL_REFERENCE_MATCH")) return policy.score.referencePartial;
  return 0;
}

function scoreAmountFx(residual: AmountResidualResult, policy: ReconciliationPolicy): number {
  switch (residual.band) {
    case "WITHIN_TOLERANCE":
      return policy.score.amountFxMax;
    case "SMALL_VARIANCE":
      return Math.round(policy.score.amountFxMax * (2 / 3));
    case "SIGNIFICANT_VARIANCE":
      return Math.round(policy.score.amountFxMax * (1 / 3));
    default:
      return 0;
  }
}

function scoreDate(candidate: MatchCandidate, policy: ReconciliationPolicy): number {
  const proofDate = candidate.proof?.financialPayload.paymentDate;
  const bankDate = candidate.bankTransaction.bookingDate;
  if (!proofDate) return 0;
  const days = dayDistanceDays(proofDate, bankDate);
  if (days <= policy.dateProximity.close) return policy.score.dateMax;
  if (days <= policy.dateProximity.near) return Math.round(policy.score.dateMax * (2 / 3));
  if (days <= policy.dateProximity.plausible) return Math.round(policy.score.dateMax * (1 / 3));
  return 0;
}

function scoreName(candidate: MatchCandidate, policy: ReconciliationPolicy): number {
  return hasSignal(candidate, "NAME_MATCH") ? policy.score.nameMax : 0;
}

function scoreConfidence(candidate: MatchCandidate, policy: ReconciliationPolicy): number {
  const overall = candidate.proof?.aiMetadata.overallConfidence ?? 0;
  if (overall >= 0.9) return policy.score.confidenceMax;
  if (overall >= 0.8) return Math.round(policy.score.confidenceMax * 0.6);
  return 0;
}

function lowCriticalConfidence(candidate: MatchCandidate, policy: ReconciliationPolicy): boolean {
  const ai = candidate.proof?.aiMetadata;
  if (!ai) return false;
  if (ai.overallConfidence < policy.confidenceFloor) return true;
  const proofAmounts = [
    candidate.proof?.financialPayload.paidAmount,
    candidate.proof?.financialPayload.targetAmount,
    candidate.proof?.financialPayload.sourceAmount,
    candidate.proof?.financialPayload.netAmount
  ];
  const hasUsableProofAmount = proofAmounts.some((amount) => amount !== null && amount !== undefined);
  return CRITICAL_PROOF_FIELD_ALIASES.some((aliases) => {
    if (aliases.includes("financialPayload.paidAmount.value") && hasUsableProofAmount) return false;
    const value = aliases.map((field) => ai.fieldConfidence[field]).find((confidence) => confidence !== undefined);
    return value !== undefined && value < policy.confidenceFloor;
  });
}

function buildReasonCodes(candidate: MatchCandidate, residual: AmountResidualResult, fee: FeeHypothesisResult, date: number, name: number, confidence: number): ReasonCode[] {
  const codes: ReasonCode[] = [];

  codes.push(hasSignal(candidate, "EXACT_REFERENCE_MATCH") ? "EXACT_REFERENCE_MATCH" : "NO_REFERENCE");

  switch (residual.band) {
    case "WITHIN_TOLERANCE":
      codes.push("AMOUNT_WITHIN_TOLERANCE", "FX_EXPLAINS_AMOUNT");
      break;
    case "SMALL_VARIANCE":
      codes.push("AMOUNT_SMALL_VARIANCE", "FX_EXPLAINS_AMOUNT");
      break;
    case "SIGNIFICANT_VARIANCE":
      codes.push("AMOUNT_SIGNIFICANT_VARIANCE");
      break;
    case "UNEXPLAINED":
      codes.push("AMOUNT_UNEXPLAINED");
      break;
    case "NO_SCENARIO":
      codes.push("NO_USABLE_FX_SCENARIO");
      break;
  }

  codes.push(date > 0 ? "DATE_CLOSE" : "DATE_FAR");
  codes.push(name > 0 ? "NAME_MATCH" : "NAME_MISMATCH");
  codes.push(confidence >= 3 ? "HIGH_EXTRACTION_CONFIDENCE" : "LOW_EXTRACTION_CONFIDENCE");

  if (fee.direction === "SHORT") codes.push("POSSIBLE_FEE_OR_SPREAD", "POSSIBLE_SHORT_PAYMENT");
  if (fee.direction === "OVER") codes.push("POSSIBLE_OVERPAYMENT");

  return codes;
}

function buildHardReviewFlags(candidate: MatchCandidate, residual: AmountResidualResult, fee: FeeHypothesisResult, policy: ReconciliationPolicy): HardReviewFlag[] {
  const flags: HardReviewFlag[] = [];

  if (lowCriticalConfidence(candidate, policy)) flags.push("LOW_CONFIDENCE_CRITICAL_FIELD");

  // Settlement is proven by the matched bank credit (actual cash received) plus
  // explained money math — not by a status word on the customer's proof. So we
  const status = candidate.proof?.financialPayload.paymentStatus;
  if (status === "PNDG" || status === "ACSP") flags.push("PROOF_NOT_SETTLED");

  if (residual.band === "NO_SCENARIO") flags.push("NO_FX_SCENARIO");
  if (residual.exceedsHardReviewThreshold && residual.band !== "NO_SCENARIO") flags.push("RESIDUAL_ABOVE_THRESHOLD");

  if (fee.direction === "SHORT") flags.push("POSSIBLE_PARTIAL_PAYMENT");
  if (fee.direction === "OVER") flags.push("POSSIBLE_OVERPAYMENT");

  const noReference = !hasSignal(candidate, "EXACT_REFERENCE_MATCH") && !hasSignal(candidate, "PARTIAL_REFERENCE_MATCH");
  if (noReference && !hasSignal(candidate, "NAME_MATCH")) flags.push("MISSING_REFERENCE_WEAK_NAME");

  return flags;
}

export function scoreCandidate(input: {
  candidate: MatchCandidate;
  fxScenarios: FxScenarioResult[];
  residual: AmountResidualResult;
  feeHypothesis: FeeHypothesisResult;
  policy: ReconciliationPolicy;
}): ToolResult<ScoredCandidate> {
  const { candidate, fxScenarios, residual, feeHypothesis, policy } = input;

  const reference = scoreReference(candidate, policy);
  const amountFx = scoreAmountFx(residual, policy);
  const date = scoreDate(candidate, policy);
  const name = scoreName(candidate, policy);
  const confidence = scoreConfidence(candidate, policy);

  const breakdown: ScoreBreakdown = { reference, amountFx, date, name, confidence, competitionPenalty: 0 };
  const score = Math.max(0, Math.min(100, reference + amountFx + date + name + confidence));

  const reasonCodes = buildReasonCodes(candidate, residual, feeHypothesis, date, name, confidence);
  const hardReviewFlags = buildHardReviewFlags(candidate, residual, feeHypothesis, policy);

  return {
    ok: true,
    toolName: SCORE_TOOL,
    data: { candidate, score, breakdown, fxScenarios, residual, feeHypothesis, reasonCodes, hardReviewFlags },
    summary: `Scored ${candidate.candidateId} at ${score}/100 with ${hardReviewFlags.length} hard review flag(s).`
  };
}

export function detectCompetingCandidates(input: {
  scoredCandidates: ScoredCandidate[];
  policy: ReconciliationPolicy;
}): ToolResult<CompetitionResult> {
  const { scoredCandidates, policy } = input;
  const sorted = [...scoredCandidates].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const runnerUp = sorted[1];

  if (!top) {
    return {
      ok: true,
      toolName: COMPETITION_TOOL,
      data: { hasCompetition: false, topScore: 0, runnerUpScore: null, gap: null },
      summary: "No scored candidates to compare."
    };
  }

  if (!runnerUp) {
    return {
      ok: true,
      toolName: COMPETITION_TOOL,
      data: { hasCompetition: false, topScore: top.score, runnerUpScore: null, gap: null },
      summary: "Single candidate; no competition."
    };
  }

  const gap = top.score - runnerUp.score;
  const hasCompetition = gap < policy.competitionGap;
  return {
    ok: true,
    toolName: COMPETITION_TOOL,
    data: { hasCompetition, topScore: top.score, runnerUpScore: runnerUp.score, gap },
    summary: hasCompetition
      ? `Top two candidates within ${gap} points; competition flagged.`
      : `Clear winner by ${gap} points.`
  };
}
