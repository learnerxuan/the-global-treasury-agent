"use client";

import { useEffect } from "react";
import type { OrchestratorOutput, ReconciliationResult } from "../../lib/recon/reconciliation/types";
import { AgentTimelinePanel } from "./AgentTimelinePanel";
import { ArtifactPreviewPanel } from "./ArtifactPreviewPanel";
import { CaseDetailPanel } from "./CaseDetailPanel";
import { HumanReviewPanel } from "./HumanReviewPanel";
import {
  artifactsForCase,
  reviewRequestsForCase,
  statusClass,
  statusLabel,
  type CaseReviewState,
  type RecordIndex,
  type ReviewActionInput
} from "./helpers";

export function CaseDetailModal({
  result,
  output,
  index,
  reviewState,
  onAction,
  onClose
}: {
  result: ReconciliationResult;
  output: OrchestratorOutput;
  index: RecordIndex;
  reviewState: CaseReviewState | undefined;
  onAction: (action: ReviewActionInput) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reviewRequests = reviewRequestsForCase(output, result.caseId);
  const artifacts = artifactsForCase(output, result.caseId);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Case detail" onClick={onClose}>
      <div className="modal-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>
              {result.caseId}
            </p>
            <h2>
              <span className={`recon-badge recon-badge-${statusClass(result.status)}`}>{statusLabel(result.status)}</span>
              <span className="recon-detail-score">Score {result.score}</span>
            </h2>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <CaseDetailPanel result={result} index={index} />
          <ArtifactPreviewPanel
            artifacts={artifacts}
            result={result}
            index={index}
            reviewState={reviewState}
            hasReviewRequest={reviewRequests.length > 0}
            onAction={onAction}
          />
          <HumanReviewPanel reviewRequests={reviewRequests} result={result} reviewState={reviewState} onAction={onAction} />
          <AgentTimelinePanel output={output} selectedCaseId={result.caseId} />
        </div>
      </div>
    </div>
  );
}
