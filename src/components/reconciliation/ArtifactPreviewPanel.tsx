import type { ArtifactRequest, ReconciliationResult } from "../../lib/recon/reconciliation/types";
import {
  formatMoney,
  outcomeLabel,
  type CaseReviewState,
  type RecordIndex,
  type ReviewActionInput
} from "./helpers";

function buildMockEmail(result: ReconciliationResult, index: RecordIndex): string {
  const bank = result.bankTransactionId ? index.bankById.get(result.bankTransactionId) : undefined;
  const amount = bank ? formatMoney(bank.amount) : "the received amount";
  const date = bank?.bookingDate ?? "the booking date";
  const txn = result.bankTransactionId ?? "";
  return [
    `Subject: Payment clarification needed for bank credit ${txn}`,
    "",
    "Hi,",
    "",
    `We received a bank credit of ${amount} on ${date}, but could not match it to an open invoice.`,
    "Could you confirm which invoice this payment is for and provide the payment reference?",
    "",
    "Thanks."
  ].join("\n");
}

function copy(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(text);
  }
}

function ArtifactCard({ artifact, result, index }: { artifact: ArtifactRequest; result: ReconciliationResult; index: RecordIndex }) {
  switch (artifact.type) {
    case "RECONCILIATION_REPORT":
      return (
        <article className="recon-artifact recon-artifact-report">
          <h3>Reconciliation Report</h3>
          <p className="recon-artifact-status">Status: Auto matched</p>
          <p>{artifact.summary}</p>
          <ul className="recon-artifact-evidence">
            {artifact.evidenceRefs.map((ref) => (
              <li key={`${ref.kind}-${ref.id}`}>
                {ref.kind.replace(/_/g, " ")}: <strong>{ref.id}</strong>
              </li>
            ))}
          </ul>
        </article>
      );
    case "RECONCILIATION_REPORT_DRAFT":
      return (
        <article className="recon-artifact recon-artifact-draft">
          <h3>Reconciliation Report Draft</h3>
          <p>This match is likely correct but needs approval before posting.</p>
          <p>{artifact.summary}</p>
        </article>
      );
    case "DISCREPANCY_SUMMARY":
      return (
        <article className="recon-artifact recon-artifact-discrepancy">
          <h3>Discrepancy Summary</h3>
          <p className="recon-artifact-status">Why this needs attention:</p>
          <ul className="recon-codes">
            {result.hardReviewFlags.length > 0 ? (
              result.hardReviewFlags.map((flag) => <li key={flag}>{flag.replace(/_/g, " ").toLowerCase()}</li>)
            ) : (
              <li>{result.reasonCodes.map((c) => c.replace(/_/g, " ").toLowerCase()).join(", ")}</li>
            )}
          </ul>
          <p className="recon-artifact-next">{artifact.summary}</p>
        </article>
      );
    case "MOCK_EMAIL_DRAFT":
      return (
        <article className="recon-artifact recon-artifact-email">
          <h3>Mock Email Draft</h3>
          <p className="recon-artifact-note">This is a draft shown in-product. No email is sent.</p>
          <pre className="recon-email-body">{buildMockEmail(result, index)}</pre>
        </article>
      );
  }
}

export function ArtifactPreviewPanel({
  artifacts,
  result,
  index,
  reviewState,
  hasReviewRequest,
  onAction
}: {
  artifacts: ArtifactRequest[];
  result: ReconciliationResult;
  index: RecordIndex;
  reviewState: CaseReviewState | undefined;
  hasReviewRequest: boolean;
  onAction: (action: ReviewActionInput) => void;
}) {
  return (
    <section aria-label="Artifact preview">
      <div className="panel-header" style={{ marginBottom: 10 }}>
        <p className="modal-section-title eyebrow" style={{ margin: 0 }}>
          Artifacts
        </p>
        {reviewState ? <span className="recon-outcome">{outcomeLabel(reviewState.outcome)}</span> : null}
      </div>

      {artifacts.length === 0 ? (
        <p className="recon-empty">No artifact generated for this case.</p>
      ) : (
        <div className="recon-artifact-list">
          {artifacts.map((artifact) => (
            <ArtifactCard key={artifact.artifactId} artifact={artifact} result={result} index={index} />
          ))}
        </div>
      )}

      {/* Status-driven actions live here only when there is no human-review request. */}
      {!hasReviewRequest ? (
        <div className="recon-actions">
          {result.status === "AUTO_MATCHED" ? (
            <button type="button" className="recon-btn recon-btn-secondary" onClick={() => copy(result.explanation)}>
              Copy summary
            </button>
          ) : null}
          {result.status === "UNMATCHED" ? (
            <>
              <button
                type="button"
                className="recon-btn recon-btn-primary"
                onClick={() => {
                  copy(buildMockEmail(result, index));
                  onAction({ kind: "MARK_EMAIL_COPIED" });
                }}
              >
                Copy email draft
              </button>
              <button type="button" className="recon-btn recon-btn-secondary" onClick={() => onAction({ kind: "MARK_INVESTIGATED" })}>
                Mark as investigated
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
