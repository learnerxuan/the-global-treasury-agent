import type {
  ExpectedPaymentRecord,
  BankStatementTransaction,
  NormalizedPaymentProofRecord,
  TimelineEvent,
  CurrencyCode,
  MoneyAmount,
} from "@/src/lib/recon/types";

// Re-export real domain types
export type {
  ExpectedPaymentRecord,
  BankStatementTransaction,
  NormalizedPaymentProofRecord,
  TimelineEvent,
  CurrencyCode,
  MoneyAmount,
};

// UI-only types — reconciliation matching engine not yet built

export type ReconciliationStatus =
  | "AUTO_MATCHED"
  | "LIKELY_MATCHED"
  | "NEEDS_REVIEW"
  | "UNMATCHED";

export interface FXScenario {
  scenario_name: string;
  fx_date: string;
  fx_rate: number;
  expected_local_amount: number;
  variance: number;
  variance_percentage: number;
  is_best_match: boolean;
}

export interface MatchScore {
  reference_match: number;
  amount_fx_match: number;
  date_proximity: number;
  name_similarity: number;
  extraction_confidence: number;
  total: number;
}

export interface ReconciliationCase {
  id: string;
  expected_payment: ExpectedPaymentRecord;
  payment_proof: NormalizedPaymentProofRecord | null;
  bank_transaction: BankStatementTransaction | null;
  status: ReconciliationStatus;
  score: MatchScore;
  fx_scenarios: FXScenario[];
  best_fx_scenario: FXScenario | null;
  fee_hypothesis: {
    possible_fee: number;
    explanation: string;
  } | null;
  human_action_required: boolean;
  reason: string;
  created_at: string;
}

export interface ArtifactEmail {
  to: string;
  subject: string;
  body: string;
  generated_at: string;
}

export interface ReconciliationReport {
  report_id: string;
  generated_at: string;
  total_cases: number;
  auto_matched: number;
  likely_matched: number;
  needs_review: number;
  unmatched: number;
  cases: ReconciliationCase[];
}
