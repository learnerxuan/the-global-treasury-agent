// UI-facing types that mirror the JSON returned by the extraction + reconciliation
// API. These intentionally live near the UI so the reconciliation engine output
// shape stays untouched. They are structural mirrors of the server types.

import type {
  AgentTimelineEvent,
  ArtifactRequest,
  HumanReviewRequest,
  ReconciliationResult,
  ReconciliationStatus
} from "../../lib/recon/reconciliation/types";
import type {
  BankStatementTransaction,
  ExpectedPaymentRecord,
  NormalizedInputBatch,
  NormalizedPaymentProofRecord
} from "../../lib/recon/types";

export type DocumentRole = "invoice" | "bank_statement" | "payment_proof";
export type UploadKey = "invoices" | "bankStatements" | "paymentProofs";
export type UploadStatus = "ready" | "pending" | "done" | "error";

export type RunStatus = ReconciliationStatus | "NO_PROOF_RECORD";

export type MovedRecord = {
  role: string;
  recordId: string;
  from: string;
  to: string;
};

export type ReconciliationRun = {
  runId: string;
  trigger: string;
  createdAt: string;
  status: RunStatus;
  proofId: string | null;
  proofPath: string;
  summary: string;
  nextAction: string;
  selectedResult: ReconciliationResult | null;
  movedRecords: MovedRecord[];
  batch: NormalizedInputBatch;
  reconciliation: {
    timeline: AgentTimelineEvent[];
    results: ReconciliationResult[];
    artifactRequests: ArtifactRequest[];
    humanReviewRequests: HumanReviewRequest[];
    summary: {
      autoMatched: number;
      likelyMatched: number;
      needsReview: number;
      unmatched: number;
    };
  };
  outputPaths: {
    reconciliationReportPath: string | null;
    discrepancySummaryPath: string | null;
    mockNotificationPath: string | null;
    runPath: string;
  };
};

export type ExtractionResult = {
  role: DocumentRole;
  selectedTool: string;
  confidence: number;
  summary: string;
  invoices: unknown[];
  bankTransactions: unknown[];
  paymentProofs: unknown[];
  warnings: string[];
};

export type ExtractionOutcome = {
  fileName: string;
  status: "extracted" | "failed";
  records: number;
  error: string | null;
};

export type ExtractionSummary = {
  total: number;
  extracted: number;
  failed: number;
  outcomes: ExtractionOutcome[];
};

export type RoleApiResult = {
  ingestionId: string;
  role: DocumentRole;
  uploadedAt: string;
  documents: Array<{
    fileName: string;
    mimeType: string;
    readableTextLength: number;
    toolObservations: string[];
    warnings: string[];
  }>;
  extractions: ExtractionResult[];
  extractionSummary: ExtractionSummary;
  codeTools: {
    parsedInputBatch: unknown;
    normalizedInputBatch: unknown;
  };
  storage: {
    ingestionDir: string;
    documentsPath: string;
    extractionsPath: string;
    parsedInputBatchPath: string;
    normalizedInputBatchPath: string;
    jobsPath: string;
    summaryPath: string;
    rawTextDir: string;
    waitingRecordPaths: string[];
  };
  reconciliationRuns: ReconciliationRun[];
  debugResponsePath: string;
};

// Display adapter row — flat, label-only view used by the results table.
export type ReconciliationDisplayRow = {
  id: string;
  status: RunStatus;
  invoiceLabel: string;
  customerLabel: string;
  expectedAmountLabel: string;
  receivedAmountLabel: string;
  fxBasisLabel: string;
  scoreLabel: string;
  summary: string;
  run: ReconciliationRun;
};

export type {
  AgentTimelineEvent,
  ArtifactRequest,
  BankStatementTransaction,
  ExpectedPaymentRecord,
  HumanReviewRequest,
  NormalizedPaymentProofRecord,
  ReconciliationResult
};
