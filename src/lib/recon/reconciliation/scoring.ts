import type { ReconciliationPolicy } from "./policy";
import type {
  AmountResidualResult,
  CompetitionResult,
  FeeHypothesisResult,
  EvidenceTrustIssue,
  EvidenceTrustSummary,
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
//
// NOTE: creditor.name is deliberately NOT critical. On a payment proof the
// creditor is the SME itself (our own company, the payee), which is often
// absent from a payment screenshot and is irrelevant to proving the match —
// the match is anchored by the invoice reference, the actual bank credit, and
// the amount/FX reconciliation. The payer identity that matters is the DEBTOR,
// which remains gated below.
const CRITICAL_PROOF_FIELD_ALIASES = [
  ["financialPayload.paidAmount.value", "paidAmount.value"],
  ["financialPayload.paidAmount.currency", "paidAmount.currency"],
  ["financialPayload.reference.raw", "reference.raw"],
  ["financialPayload.paymentDate", "paymentDate"],
  ["financialPayload.debtor.name", "financialPayload.debtor.rawName", "debtor.name", "debtor.rawName"],
  ["financialPayload.paymentStatus", "paymentStatus", "rawPaymentStatus"]
];

function dayDistanceDays(a: string, b: string): number {
  const msA = new Date(`${a.slice(0, 10)}T00:00:00.000Z`).getTime();
  const msB = new Date(`${b.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.abs(msA - msB) / 86_400_000;
}

function hasSignal(candidate: MatchCandidate, code: string): boolean {
  return candidate.signals.some((s) => s.code === code);
}

function hasPartySignal(candidate: MatchCandidate): boolean {
  return (
    hasSignal(candidate, "NAME_MATCH") ||
    hasSignal(candidate, "COUNTERPARTY_ALIAS_MATCH") ||
    hasSignal(candidate, "COUNTERPARTY_ACCOUNT_MATCH")
  );
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
  if (hasPartySignal(candidate)) return policy.score.nameMax;
  if (hasSignal(candidate, "NAME_SIMILAR")) {
    // An exact invoice-reference match already establishes the counterparty, so a
    // merely-similar payer name (e.g. "ACME SDN BHD" vs "ACME") corroborates the
    // match rather than weakening it — award full name credit. Without an exact
    // reference to anchor identity, a similar name remains partial evidence.
    if (hasSignal(candidate, "EXACT_REFERENCE_MATCH")) return policy.score.nameMax;
    return Math.round(policy.score.nameMax / 2);
  }
  return 0;
}

function scoreConfidence(candidate: MatchCandidate, policy: ReconciliationPolicy): number {
  const overall = candidate.proof?.aiMetadata.overallConfidence ?? 0;
  if (overall >= 0.9) return policy.score.confidenceMax;
  if (overall >= 0.8) return Math.round(policy.score.confidenceMax * 0.6);
  return 0;
}

function buildEvidenceTrust(candidate: MatchCandidate, policy: ReconciliationPolicy): EvidenceTrustSummary {
  const ai = candidate.proof?.aiMetadata;
  if (!ai) {
    return {
      level: "missing_proof",
      extractionRoute: null,
      hasEvidenceSpans: false,
      criticalFieldsChecked: [],
      issues: []
    };
  }
  const proofAmounts = [
    candidate.proof?.financialPayload.paidAmount,
    candidate.proof?.financialPayload.targetAmount,
    candidate.proof?.financialPayload.sourceAmount,
    candidate.proof?.financialPayload.netAmount
  ];
  const hasUsableProofAmount = proofAmounts.some((amount) => amount !== null && amount !== undefined);
  const issues: EvidenceTrustIssue[] = [];
  if (ai.overallConfidence < policy.confidenceFloor) {
    issues.push({
      source: "payment_proof",
      field: "aiMetadata.overallConfidence",
      confidence: ai.overallConfidence,
      threshold: policy.confidenceFloor,
      message: "Overall extraction confidence is below the auto-match floor."
    });
  }

  const checked: string[] = [];
  for (const aliases of CRITICAL_PROOF_FIELD_ALIASES) {
    if (aliases.includes("financialPayload.paidAmount.value") && hasUsableProofAmount) continue;
    checked.push(aliases[0]!);
    const value = aliases.map((field) => ai.fieldConfidence[field]).find((confidence) => confidence !== undefined);
    if (value !== undefined && value < policy.confidenceFloor) {
      issues.push({
        source: "payment_proof",
        field: aliases[0]!,
        confidence: value,
        threshold: policy.confidenceFloor,
        message: `${aliases[0]} confidence is below the auto-match floor.`
      });
    }
  }

  const deterministicRoutes = new Set(["parse_csv_text", "parse_spreadsheet", "manual_correction"]);
  return {
    level: deterministicRoutes.has(ai.extractionRoute)
      ? "deterministic"
      : issues.length > 0
        ? "weak_ai"
        : "supported_ai",
    extractionRoute: ai.extractionRoute,
    hasEvidenceSpans: ai.evidenceSpans.length > 0,
    criticalFieldsChecked: checked,
    issues
  };
}

function lowCriticalConfidence(evidenceTrust: EvidenceTrustSummary): boolean {
  return evidenceTrust.issues.length > 0;
}

function dedupeCodes<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function buildReasonCodes(candidate: MatchCandidate, residual: AmountResidualResult, fee: FeeHypothesisResult, date: number, name: number, confidence: number): ReasonCode[] {
  const codes: ReasonCode[] = [];

  if (hasSignal(candidate, "EXACT_REFERENCE_MATCH")) {
    codes.push("EXACT_REFERENCE_MATCH");
  } else if (hasSignal(candidate, "PARTIAL_REFERENCE_MATCH")) {
    codes.push("PARTIAL_REFERENCE_MATCH");
  } else {
    codes.push("NO_REFERENCE");
  }

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
  if (hasSignal(candidate, "COUNTERPARTY_ACCOUNT_MATCH")) codes.push("COUNTERPARTY_ACCOUNT_MATCH");
  else if (hasSignal(candidate, "COUNTERPARTY_ALIAS_MATCH")) codes.push("COUNTERPARTY_ALIAS_MATCH");
  else if (hasSignal(candidate, "NAME_MATCH")) codes.push("NAME_MATCH");
  else if (hasSignal(candidate, "NAME_SIMILAR")) codes.push("NAME_SIMILAR");
  else codes.push("NAME_MISMATCH");
  codes.push(confidence >= 3 ? "HIGH_EXTRACTION_CONFIDENCE" : "LOW_EXTRACTION_CONFIDENCE");

  if (residual.residualClassification === "fxVariance") codes.push("FX_VARIANCE_EXPLAINS_RESIDUAL");
  if (residual.residualClassification === "flatFee") codes.push("FLAT_FEE_EXPLAINS_RESIDUAL");
  if (residual.exceedsAbsoluteCap) codes.push("RESIDUAL_ABSOLUTE_CAP_EXCEEDED");
  if (fee.direction === "SHORT") codes.push("POSSIBLE_FEE_OR_SPREAD", "POSSIBLE_SHORT_PAYMENT");
  if (fee.direction === "OVER") codes.push("POSSIBLE_OVERPAYMENT");

  return dedupeCodes(codes);
}

function buildHardReviewFlags(candidate: MatchCandidate, residual: AmountResidualResult, fee: FeeHypothesisResult, policy: ReconciliationPolicy, evidenceTrust: EvidenceTrustSummary): HardReviewFlag[] {
  const flags: HardReviewFlag[] = [];

  if (lowCriticalConfidence(evidenceTrust)) flags.push("LOW_CONFIDENCE_CRITICAL_FIELD");

  // Settlement is proven by the matched bank credit (actual cash received) plus
  // explained money math — not by a status word on the customer's proof. A
  // "pending"/"in-progress" status (PNDG/ACSP) on the proof is therefore NOT a
  // hard-review trigger: if the money landed in the bank and the residual is
  // explained, the payment has settled regardless of what the proof document says.

  if (residual.band === "NO_SCENARIO") flags.push("NO_FX_SCENARIO");
  if (residual.exceedsHardReviewThreshold && residual.band !== "NO_SCENARIO" && residual.residualClassification !== "flatFee") {
    flags.push("RESIDUAL_ABOVE_THRESHOLD");
  }
  if (
    residual.exceedsAbsoluteCap &&
    residual.residualClassification !== "flatFee" &&
    residual.residualClassification !== "fxVariance"
  ) {
    flags.push("UNEXPLAINED_RESIDUAL_ABOVE_CAP");
  }

  const onlyFixture = residual.bestScenario?.fxSourceKind === "fixture_fallback";
  if (onlyFixture && !hasSignal(candidate, "EXACT_REFERENCE_MATCH")) flags.push("FIXTURE_FALLBACK_ONLY");

  if (fee.direction === "SHORT" && residual.residualClassification !== "flatFee") flags.push("POSSIBLE_PARTIAL_PAYMENT");
  if (fee.direction === "OVER") flags.push("POSSIBLE_OVERPAYMENT");

  const noReference = !hasSignal(candidate, "EXACT_REFERENCE_MATCH") && !hasSignal(candidate, "PARTIAL_REFERENCE_MATCH");
  if (noReference && !hasPartySignal(candidate)) flags.push("MISSING_REFERENCE_WEAK_NAME");
  if (
    hasSignal(candidate, "PARTIAL_REFERENCE_MATCH") &&
    !hasSignal(candidate, "EXACT_REFERENCE_MATCH") &&
    (!hasSignal(candidate, "AMOUNT_MATCHES_EXPECTED") || !hasPartySignal(candidate))
  ) {
    flags.push("PARTIAL_REFERENCE_WEAK_EVIDENCE");
  }

  return dedupeCodes(flags);
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
  const evidenceTrust = buildEvidenceTrust(candidate, policy);

  const breakdown: ScoreBreakdown = { reference, amountFx, date, name, confidence, competitionPenalty: 0 };
  const score = Math.max(0, Math.min(100, reference + amountFx + date + name + confidence));

  const reasonCodes = buildReasonCodes(candidate, residual, feeHypothesis, date, name, confidence);
  const hardReviewFlags = buildHardReviewFlags(candidate, residual, feeHypothesis, policy, evidenceTrust);

  return {
    ok: true,
    toolName: SCORE_TOOL,
    data: { candidate, score, breakdown, fxScenarios, residual, feeHypothesis, evidenceTrust, reasonCodes, hardReviewFlags },
    summary: `Scored ${candidate.candidateId} at ${score}/100 with ${hardReviewFlags.length} hard review flag(s).`
  };
}

// Identity of the invoice(s) a candidate would settle. Two candidates with the
// same key (e.g. two different proofs for one invoice) are NOT competing — there
// is no ambiguity about which invoice receives the payment.
function competingInvoiceKey(candidate: MatchCandidate): string {
  const ids = candidate.expectedPaymentIds ?? (candidate.expectedPaymentId ? [candidate.expectedPaymentId] : []);
  return [...ids].sort().join("+");
}

export function detectCompetingCandidates(input: {
  scoredCandidates: ScoredCandidate[];
  policy: ReconciliationPolicy;
}): ToolResult<CompetitionResult> {
  const { scoredCandidates, policy } = input;
  const sorted = [...scoredCandidates].sort((a, b) => b.score - a.score);
  const top = sorted[0];

  if (!top) {
    return {
      ok: true,
      toolName: COMPETITION_TOOL,
      data: { hasCompetition: false, topScore: 0, runnerUpScore: null, gap: null },
      summary: "No scored candidates to compare."
    };
  }

  // Competition only exists between candidates that would settle DIFFERENT invoices.
  // The runner-up is the best-scored candidate resolving to a different invoice;
  // same-invoice alternatives (duplicate proofs) never block an otherwise-clean match.
  const topKey = competingInvoiceKey(top.candidate);
  const runnerUp = sorted.slice(1).find((c) => {
    const key = competingInvoiceKey(c.candidate);
    return key !== "" && key !== topKey;
  });

  if (!runnerUp) {
    return {
      ok: true,
      toolName: COMPETITION_TOOL,
      data: { hasCompetition: false, topScore: top.score, runnerUpScore: null, gap: null },
      summary: "No competing invoice; clear assignment."
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
