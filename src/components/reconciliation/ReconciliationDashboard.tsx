"use client";

import { useMemo, useState } from "react";
import type { NormalizedInputBatch } from "../../lib/recon/types";
import type { OrchestratorOutput } from "../../lib/recon/reconciliation/types";
import { AgentTimelinePanel } from "./AgentTimelinePanel";
import { ArtifactPreviewPanel } from "./ArtifactPreviewPanel";
import { BatchSummaryCards } from "./BatchSummaryCards";
import { CaseDetailPanel } from "./CaseDetailPanel";
import { HumanReviewPanel } from "./HumanReviewPanel";
import { ReconciliationQueue } from "./ReconciliationQueue";
import {
  artifactsForCase,
  buildRecordIndex,
  pickDefaultCaseId,
  reviewRequestsForCase,
  type CaseReviewState,
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

export function ReconciliationDashboard({
  output,
  batch
}: {
  output: OrchestratorOutput;
  batch: NormalizedInputBatch;
}) {
  const index = useMemo(() => buildRecordIndex(batch), [batch]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(() => pickDefaultCaseId(output.results));
  const [reviewState, setReviewState] = useState<Record<string, CaseReviewState>>({});

  if (output.results.length === 0) {
    return (
      <section className="panel recon-empty-panel" aria-label="Reconciliation dashboard">
        <p className="eyebrow">Reconciliation</p>
        <p>No inbound bank credits found. Debits are ignored for inbound payment reconciliation.</p>
      </section>
    );
  }

  const selectedResult = output.results.find((r) => r.caseId === selectedCaseId) ?? output.results[0]!;
  const caseId = selectedResult.caseId;
  const reviewRequests = reviewRequestsForCase(output, caseId);
  const artifacts = artifactsForCase(output, caseId);

  function handleAction(action: ReviewActionInput) {
    setReviewState((current) => ({
      ...current,
      [caseId]: {
        outcome: outcomeFor(action),
        ...(action.kind === "SELECT_CANDIDATE" ? { selectedOptionId: action.optionId } : {})
      }
    }));
  }

  return (
    <div className="recon-dashboard">
      <header className="recon-dashboard-head">
        <p className="eyebrow">Reconciliation Dashboard</p>
        <h2>Auto-match clean cross-border payments, escalate risky discrepancies with evidence</h2>
      </header>

      <BatchSummaryCards output={output} />

      <div className="recon-layout">
        <ReconciliationQueue output={output} index={index} selectedCaseId={caseId} onSelect={setSelectedCaseId} />
        <CaseDetailPanel result={selectedResult} index={index} />
      </div>

      <div className="recon-layout">
        <ArtifactPreviewPanel
          artifacts={artifacts}
          result={selectedResult}
          index={index}
          reviewState={reviewState[caseId]}
          hasReviewRequest={reviewRequests.length > 0}
          onAction={handleAction}
        />
        <HumanReviewPanel
          reviewRequests={reviewRequests}
          result={selectedResult}
          reviewState={reviewState[caseId]}
          onAction={handleAction}
        />
      </div>

      <AgentTimelinePanel output={output} selectedCaseId={caseId} />

      <details className="recon-debug">
        <summary>Debug JSON — Agent 2 orchestrator output</summary>
        <pre tabIndex={0}>{JSON.stringify(output, null, 2)}</pre>
      </details>
    </div>
  );
}
