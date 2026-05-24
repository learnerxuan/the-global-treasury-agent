"use client";

import { useMemo, useState } from "react";
import type { NormalizedInputBatch } from "../../lib/recon/types";
import type { OrchestratorOutput, ReconciliationResult } from "../../lib/recon/reconciliation/types";
import { BatchSummaryCards } from "./BatchSummaryCards";
import { CaseDetailModal } from "./CaseDetailModal";
import {
  buildRecordIndex,
  formatPercent,
  statusClass,
  statusLabel,
  type CaseReviewState,
  type RecordIndex,
  type ReviewActionInput,
  type ReviewOutcome
} from "./helpers";

function outcomeFor(action: ReviewActionInput): ReviewOutcome {
  switch (action.kind) {
    case "APPROVE_MATCH":
    case "RESOLVE_REVIEW":
    case "SELECT_CANDIDATE":
      return "approved";
    case "REJECT_MATCH":
      return "rejected";
    case "REQUEST_MORE_INFO":
      return "info_requested";
    case "MARK_INVESTIGATED":
      return "investigated";
    case "MARK_EMAIL_COPIED":
      return "email_copied";
  }
}

function residualLabel(result: ReconciliationResult): string {
  if (!result.residual || result.residual.band === "NO_SCENARIO") return "No FX scenario";
  return `Residual ${formatPercent(result.residual.residualPercent)}`;
}

function ResultRow({
  result,
  index,
  hasReview,
  onOpen
}: {
  result: ReconciliationResult;
  index: RecordIndex;
  hasReview: boolean;
  onOpen: () => void;
}) {
  const invoice = result.expectedPaymentId ? index.expectedById.get(result.expectedPaymentId)?.invoiceNumber : undefined;
  return (
    <button type="button" className="recon-row" onClick={onOpen}>
      <span className={`recon-badge recon-badge-${statusClass(result.status)}`}>{statusLabel(result.status)}</span>
      <span className="recon-row-main">
        <span className="recon-row-line">
          <span className="recon-row-invoice">{invoice ?? "No invoice"}</span>
          <span className="recon-row-id">{result.bankTransactionId}</span>
          {result.proofId ? <span className="recon-row-id">{result.proofId}</span> : null}
        </span>
        <span className="recon-row-sub">{residualLabel(result)}</span>
      </span>
      <span className="recon-row-right">
        {hasReview ? <span className="recon-row-flag">Review</span> : null}
        <span className="recon-row-score">
          <b>{result.score}</b>
          <span>score</span>
        </span>
        <svg className="recon-row-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
    </button>
  );
}

export function ReconciliationDashboard({
  output,
  batch
}: {
  output: OrchestratorOutput;
  batch: NormalizedInputBatch;
}) {
  const index = useMemo(() => buildRecordIndex(batch), [batch]);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState<Record<string, CaseReviewState>>({});

  const reviewByCase = useMemo(() => new Set(output.humanReviewRequests.map((r) => r.caseId)), [output]);

  if (output.results.length === 0) {
    return (
      <section className="recon-results">
        <div className="panel">
          <p className="eyebrow">Reconciliation</p>
          <p style={{ margin: 0, color: "var(--ink-muted)" }}>
            No inbound bank credits found. Debits are ignored for inbound payment reconciliation.
          </p>
        </div>
      </section>
    );
  }

  const openResult = output.results.find((r) => r.caseId === openCaseId) ?? null;

  function handleAction(caseId: string, action: ReviewActionInput) {
    setReviewState((current) => ({
      ...current,
      [caseId]: {
        outcome: outcomeFor(action),
        ...(action.kind === "SELECT_CANDIDATE" ? { selectedOptionId: action.optionId } : {})
      }
    }));
  }

  return (
    <section className="recon-results" aria-label="Reconciliation results">
      <div className="recon-results-head">
        <h2>Reconciliation results</h2>
        <p>Auto-match clean cross-border payments, escalate risky discrepancies with evidence. Click a row for full evidence and reasoning.</p>
      </div>

      <BatchSummaryCards output={output} />

      <div className="recon-rows">
        {output.results.map((result) => (
          <ResultRow
            key={result.caseId}
            result={result}
            index={index}
            hasReview={reviewByCase.has(result.caseId)}
            onOpen={() => setOpenCaseId(result.caseId)}
          />
        ))}
      </div>

      {openResult ? (
        <CaseDetailModal
          result={openResult}
          output={output}
          index={index}
          reviewState={reviewState[openResult.caseId]}
          onAction={(action) => handleAction(openResult.caseId, action)}
          onClose={() => setOpenCaseId(null)}
        />
      ) : null}
    </section>
  );
}
