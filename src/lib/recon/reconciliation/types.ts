import type {
  BankStatementTransaction,
  CurrencyCode,
  ExpectedPaymentRecord,
  MoneyAmount,
  NormalizedInputBatch,
  NormalizedPaymentProofRecord
} from "../types";
import type { FxRateSource } from "./fx-table";

// ─── Tool result envelope ───────────────────────────────────────────────────
// Every Reconciliation Tool returns this so the orchestrator can observe
// success/failure uniformly and write a timeline event from it.

export type ToolResult<T> =
  | { ok: true; toolName: string; data: T; summary: string }
  | { ok: false; toolName: string; error: string; summary: string };

// ─── Input validation ─────────────────────────────────────────────────────────

export type InputValidationResult = {
  valid: boolean;
  issues: string[];
  counts: {
    expectedPayments: number;
    bankTransactions: number;
    bankCredits: number;
    paymentProofs: number;
  };
};

// ─── Reason / flag vocabularies ──────────────────────────────────────────────

export type ReasonCode =
  | "EXACT_REFERENCE_MATCH"
  | "PARTIAL_REFERENCE_MATCH"
  | "NO_REFERENCE"
  | "AMOUNT_WITHIN_TOLERANCE"
  | "AMOUNT_SMALL_VARIANCE"
  | "AMOUNT_SIGNIFICANT_VARIANCE"
  | "AMOUNT_UNEXPLAINED"
  | "FX_EXPLAINS_AMOUNT"
  | "NO_USABLE_FX_SCENARIO"
  | "DATE_CLOSE"
  | "DATE_FAR"
  | "NAME_MATCH"
  | "NAME_MISMATCH"
  | "HIGH_EXTRACTION_CONFIDENCE"
  | "LOW_EXTRACTION_CONFIDENCE"
  | "POSSIBLE_FEE_OR_SPREAD"
  | "POSSIBLE_SHORT_PAYMENT"
  | "POSSIBLE_OVERPAYMENT"
  | "COMPETING_CANDIDATES"
  | "NO_CANDIDATE";

export type HardReviewFlag =
  | "LOW_CONFIDENCE_CRITICAL_FIELD"
  | "COMPETING_CANDIDATES_CLOSE"
  | "MISSING_REFERENCE_WEAK_NAME"
  | "PROOF_NOT_SETTLED"
  | "POSSIBLE_PARTIAL_PAYMENT"
  | "POSSIBLE_OVERPAYMENT"
  | "POSSIBLE_BATCH_PAYMENT"
  | "DUPLICATE_PROOF_TX_ID"
  | "RESIDUAL_ABOVE_THRESHOLD"
  | "NO_FX_SCENARIO";

// ─── Candidates ───────────────────────────────────────────────────────────────

export type SignalStrength = "STRONG" | "MEDIUM";

export type CandidateSignal = {
  code: string;
  strength: SignalStrength;
  detail: string;
};

// A candidate carries resolved record snapshots so deterministic tools can run
// without re-reading the batch. The bank transaction is always present (the
// anchor); proof and expected payment are optional.
export type MatchCandidate = {
  candidateId: string;
  bankTransactionId: string;
  proofId?: string;
  expectedPaymentId?: string;
  signals: CandidateSignal[];
  bankTransaction: BankStatementTransaction;
  proof?: NormalizedPaymentProofRecord;
  expectedPayment?: ExpectedPaymentRecord;
};

export type CandidateSet = {
  candidatesByBankTx: Record<string, MatchCandidate[]>;
  unmatchedBankTxIds: string[];
};

// ─── FX / residual / fee ────────────────────────────────────────────────────

export type FxScenarioBasis = "proof_rate" | "bank_statement" | "invoice_date" | "payment_date" | "bank_date" | "fallback";

export type FxScenarioResult = {
  scenarioId: string;
  label: string;
  basis: FxScenarioBasis;
  foreignAmount: MoneyAmount;
  rate: string;
  rateDate: string | null;
  rateSource: FxRateSource | "proof" | "bank";
  isFallback: boolean;
  expectedLocalAmount: MoneyAmount;
  residualAmount: string; // signed decimal string, local currency
  residualPercent: number;
};

export type ResidualBand = "WITHIN_TOLERANCE" | "SMALL_VARIANCE" | "SIGNIFICANT_VARIANCE" | "UNEXPLAINED" | "NO_SCENARIO";

export type AmountResidualResult = {
  bestScenario: FxScenarioResult | null;
  residualAmount: string | null;
  residualPercent: number | null;
  band: ResidualBand;
  exceedsHardReviewThreshold: boolean;
};

export type FeeDirection = "NONE" | "SHORT" | "OVER";

export type FeeHypothesisResult = {
  direction: FeeDirection;
  // "possible", never "confirmed" — we surface hypotheses, not facts.
  hypotheses: string[];
  amount: string | null;
};

// ─── Scoring / competition / classification ───────────────────────────────────

export type ScoreBreakdown = {
  reference: number;
  amountFx: number;
  date: number;
  name: number;
  confidence: number;
  competitionPenalty: number;
};

export type ScoredCandidate = {
  candidate: MatchCandidate;
  score: number;
  breakdown: ScoreBreakdown;
  fxScenarios: FxScenarioResult[];
  residual: AmountResidualResult;
  feeHypothesis: FeeHypothesisResult;
  reasonCodes: ReasonCode[];
  hardReviewFlags: HardReviewFlag[];
};

export type CompetitionResult = {
  hasCompetition: boolean;
  topScore: number;
  runnerUpScore: number | null;
  gap: number | null;
};

export type ReconciliationStatus = "AUTO_MATCHED" | "LIKELY_MATCHED" | "NEEDS_REVIEW" | "UNMATCHED";

export type ClassificationResult = {
  status: ReconciliationStatus;
  selectedCandidate: ScoredCandidate | null;
  reasonCodes: ReasonCode[];
  hardReviewFlags: HardReviewFlag[];
};

// ─── Artifacts / human review ─────────────────────────────────────────────────

export type ArtifactType = "RECONCILIATION_REPORT" | "RECONCILIATION_REPORT_DRAFT" | "DISCREPANCY_SUMMARY" | "MOCK_EMAIL_DRAFT";

export type EvidenceRef = {
  kind: "bank_transaction" | "payment_proof" | "expected_payment";
  id: string;
};

export type ArtifactRequest = {
  artifactId: string;
  caseId: string;
  type: ArtifactType;
  status: ReconciliationStatus;
  evidenceRefs: EvidenceRef[];
  summary: string;
};

export type ReviewSeverity = "LOW" | "MEDIUM" | "HIGH";

export type HumanReviewOption = {
  optionId: string;
  label: string;
  consequence: string;
};

export type HumanReviewRequest = {
  reviewId: string;
  caseId: string;
  severity: ReviewSeverity;
  blocking: boolean;
  question: string;
  options?: HumanReviewOption[];
  evidenceRefs: EvidenceRef[];
  reasonCodes: ReasonCode[];
};

// ─── Timeline ─────────────────────────────────────────────────────────────────

export type AgentTimelineActor = "Agent 2" | "Reconciliation Tool" | "Human Review" | "Artifact Module";

export type AgentTimelineEventType =
  | "ACTION_SELECTED"
  | "TOOL_CALLED"
  | "TOOL_RESULT"
  | "STATE_CHANGED"
  | "CLASSIFICATION_COMPLETED"
  | "ARTIFACT_REQUESTED"
  | "HUMAN_REVIEW_REQUESTED"
  | "ERROR";

export type AgentTimelineRelatedIds = {
  caseId?: string;
  candidateId?: string;
  bankTransactionId?: string;
  proofId?: string;
  expectedPaymentId?: string;
};

export type AgentTimelineEvent = {
  step: number;
  timestamp: string;
  actor: AgentTimelineActor;
  eventType: AgentTimelineEventType;
  action: string;
  toolName?: string;
  inputSummary?: string;
  resultSummary?: string;
  reasoning: string;
  relatedIds?: AgentTimelineRelatedIds;
};

// ─── Per-case result + orchestrator output ─────────────────────────────────────

export type ReconciliationResult = {
  caseId: string;
  status: ReconciliationStatus;
  selectedCandidateId?: string;
  expectedPaymentId?: string;
  proofId?: string;
  bankTransactionId?: string;
  score: number;
  reasonCodes: ReasonCode[];
  hardReviewFlags: HardReviewFlag[];
  bestFxScenario?: FxScenarioResult;
  residual?: AmountResidualResult;
  explanation: string;
};

export type OrchestratorSummary = {
  autoMatched: number;
  likelyMatched: number;
  needsReview: number;
  unmatched: number;
};

export type OrchestratorOutput = {
  schemaVersion: "1.0.0";
  batchId: string;
  results: ReconciliationResult[];
  timeline: AgentTimelineEvent[];
  artifactRequests: ArtifactRequest[];
  humanReviewRequests: HumanReviewRequest[];
  summary: OrchestratorSummary;
};

export type ReconciliationOrchestratorOptions = {
  now?: () => string;
};

// Re-export commonly used input types for convenience within this module.
export type {
  BankStatementTransaction,
  CurrencyCode,
  ExpectedPaymentRecord,
  MoneyAmount,
  NormalizedInputBatch,
  NormalizedPaymentProofRecord
};
