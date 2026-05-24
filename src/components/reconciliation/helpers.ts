import type {
  BankStatementTransaction,
  ExpectedPaymentRecord,
  MoneyAmount,
  NormalizedInputBatch,
  NormalizedPaymentProofRecord
} from "../../lib/recon/types";
import type {
  ArtifactRequest,
  HumanReviewRequest,
  OrchestratorOutput,
  ReconciliationResult,
  ReconciliationStatus
} from "../../lib/recon/reconciliation/types";

// Local-only human review state (MVP: no real posting/email).
export type ReviewOutcome = "pending" | "approved" | "rejected" | "info_requested" | "investigated" | "email_copied";

export type CaseReviewState = { outcome: ReviewOutcome; selectedOptionId?: string };

export type ReviewActionInput =
  | { kind: "APPROVE_MATCH" }
  | { kind: "REJECT_MATCH" }
  | { kind: "REQUEST_MORE_INFO" }
  | { kind: "RESOLVE_REVIEW" }
  | { kind: "MARK_INVESTIGATED" }
  | { kind: "MARK_EMAIL_COPIED" }
  | { kind: "SELECT_CANDIDATE"; optionId: string };

export function outcomeLabel(outcome: ReviewOutcome): string {
  switch (outcome) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "info_requested":
      return "Info requested";
    case "investigated":
      return "Marked investigated";
    case "email_copied":
      return "Email copied";
  }
}

export type RecordIndex = {
  expectedById: Map<string, ExpectedPaymentRecord>;
  bankById: Map<string, BankStatementTransaction>;
  proofById: Map<string, NormalizedPaymentProofRecord>;
};

export function buildRecordIndex(batch: NormalizedInputBatch): RecordIndex {
  return {
    expectedById: new Map(batch.expectedPayments.map((r) => [r.expectedPaymentId, r])),
    bankById: new Map(batch.bankTransactions.map((r) => [r.internalTxId, r])),
    proofById: new Map(batch.paymentProofs.map((r) => [r.proofId, r]))
  };
}

// Exception-first default: surface the most interesting case for the demo.
export function pickDefaultCaseId(results: ReconciliationResult[]): string | null {
  const needsReview = results.find((r) => r.status === "NEEDS_REVIEW");
  if (needsReview) return needsReview.caseId;
  const unmatched = results.find((r) => r.status === "UNMATCHED");
  if (unmatched) return unmatched.caseId;
  return results[0]?.caseId ?? null;
}

export function statusClass(status: ReconciliationStatus): string {
  switch (status) {
    case "AUTO_MATCHED":
      return "auto";
    case "LIKELY_MATCHED":
      return "likely";
    case "NEEDS_REVIEW":
      return "review";
    case "UNMATCHED":
      return "unmatched";
  }
}

export function statusLabel(status: ReconciliationStatus): string {
  return status.replace(/_/g, " ");
}

export function formatMoney(money: MoneyAmount | null | undefined): string {
  if (!money) return "—";
  const num = Number(money.value);
  const formatted = Number.isFinite(num)
    ? num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : money.value;
  return `${money.currency} ${formatted}`;
}

export function formatPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return "—";
  return `${(percent * 100).toFixed(2)}%`;
}

export function formatReason(code: string): string {
  return code.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function reviewRequestsForCase(output: OrchestratorOutput, caseId: string): HumanReviewRequest[] {
  return output.humanReviewRequests.filter((r) => r.caseId === caseId);
}

export function artifactsForCase(output: OrchestratorOutput, caseId: string): ArtifactRequest[] {
  return output.artifactRequests.filter((a) => a.caseId === caseId);
}
