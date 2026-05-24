import type { HumanReviewRequest, ReconciliationResult } from "../../lib/recon/reconciliation/types";
import { formatReason, outcomeLabel, type CaseReviewState, type ReviewActionInput } from "./helpers";

function severityClass(severity: HumanReviewRequest["severity"]): string {
  return severity === "HIGH" ? "review" : severity === "MEDIUM" ? "likely" : "auto";
}

export function HumanReviewPanel({
  reviewRequests,
  result,
  reviewState,
  onAction
}: {
  reviewRequests: HumanReviewRequest[];
  result: ReconciliationResult;
  reviewState: CaseReviewState | undefined;
  onAction: (action: ReviewActionInput) => void;
}) {
  if (reviewRequests.length === 0) {
    return (
      <section className="panel recon-review" aria-label="Human review">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Human Review</p>
            <h2>No review required</h2>
          </div>
        </div>
        <p className="recon-empty">
          {result.status === "AUTO_MATCHED"
            ? "This case auto-matched with no hard review flags."
            : "No human review task for this case."}
        </p>
      </section>
    );
  }

  const isLikely = result.status === "LIKELY_MATCHED";

  return (
    <section className="panel recon-review" aria-label="Human review">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Human Review</p>
          <h2>{reviewRequests.length} review task{reviewRequests.length === 1 ? "" : "s"}</h2>
        </div>
        {reviewState ? <span className="recon-outcome">{outcomeLabel(reviewState.outcome)}</span> : null}
      </div>

      {reviewRequests.map((review) => (
        <div className="recon-review-task" key={review.reviewId}>
          <div className="recon-review-meta">
            <span className={`recon-badge recon-badge-${severityClass(review.severity)}`}>{review.severity} review</span>
            <span className="recon-review-blocking">{review.blocking ? "Blocking" : "Non-blocking"}</span>
          </div>
          <p className="recon-review-question">{review.question}</p>

          {review.options && review.options.length > 0 ? (
            <div className="recon-options">
              {review.options.map((option) => (
                <button
                  type="button"
                  key={option.optionId}
                  className={`recon-btn recon-btn-option ${reviewState?.selectedOptionId === option.optionId ? "is-chosen" : ""}`}
                  onClick={() => onAction({ kind: "SELECT_CANDIDATE", optionId: option.optionId })}
                >
                  <strong>{option.label}</strong>
                  <span>{option.consequence}</span>
                </button>
              ))}
              <button type="button" className="recon-btn recon-btn-secondary" onClick={() => onAction({ kind: "REQUEST_MORE_INFO" })}>
                None of these
              </button>
            </div>
          ) : null}

          {review.reasonCodes.length > 0 ? (
            <ul className="recon-codes">
              {review.reasonCodes.map((code) => (
                <li key={code}>{formatReason(code)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}

      {/* Decision actions (button-rules table, UI plan §10). */}
      <div className="recon-actions">
        {isLikely ? (
          <>
            <button type="button" className="recon-btn recon-btn-primary" onClick={() => onAction({ kind: "APPROVE_MATCH" })}>
              Approve match
            </button>
            <button type="button" className="recon-btn recon-btn-secondary" onClick={() => onAction({ kind: "REJECT_MATCH" })}>
              Reject
            </button>
            <button type="button" className="recon-btn recon-btn-secondary" onClick={() => onAction({ kind: "REQUEST_MORE_INFO" })}>
              Request more info
            </button>
          </>
        ) : (
          <>
            <button type="button" className="recon-btn recon-btn-primary" onClick={() => onAction({ kind: "RESOLVE_REVIEW" })}>
              Resolve review
            </button>
            <button type="button" className="recon-btn recon-btn-secondary" onClick={() => onAction({ kind: "REJECT_MATCH" })}>
              Reject
            </button>
            <button type="button" className="recon-btn recon-btn-secondary" onClick={() => onAction({ kind: "REQUEST_MORE_INFO" })}>
              Request more proof
            </button>
          </>
        )}
      </div>
    </section>
  );
}
