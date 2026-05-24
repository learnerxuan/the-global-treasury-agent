import type { OrchestratorOutput, ReconciliationResult } from "../../lib/recon/reconciliation/types";
import { formatPercent, formatReason, statusClass, statusLabel, type RecordIndex } from "./helpers";

function invoiceNumberFor(result: ReconciliationResult, index: RecordIndex): string {
  if (!result.expectedPaymentId) return "—";
  return index.expectedById.get(result.expectedPaymentId)?.invoiceNumber ?? "—";
}

function residualLabel(result: ReconciliationResult): string {
  if (!result.residual || result.residual.band === "NO_SCENARIO") return "No FX scenario";
  return `Residual ${formatPercent(result.residual.residualPercent)}`;
}

export function ReconciliationQueue({
  output,
  index,
  selectedCaseId,
  onSelect
}: {
  output: OrchestratorOutput;
  index: RecordIndex;
  selectedCaseId: string | null;
  onSelect: (caseId: string) => void;
}) {
  const reviewByCase = new Set(output.humanReviewRequests.map((r) => r.caseId));
  const artifactByCase = new Map(output.artifactRequests.map((a) => [a.caseId, a.type] as const));

  return (
    <section className="panel recon-queue" aria-label="Reconciliation work queue">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Reconciliation Work Queue</p>
          <h2>{output.results.length} bank credit{output.results.length === 1 ? "" : "s"}</h2>
        </div>
      </div>
      <div className="recon-queue-rows" role="list">
        {output.results.map((result) => {
          const selected = result.caseId === selectedCaseId;
          return (
            <button
              type="button"
              role="listitem"
              key={result.caseId}
              className={`recon-row ${selected ? "is-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => onSelect(result.caseId)}
            >
              <span className={`recon-badge recon-badge-${statusClass(result.status)}`}>{statusLabel(result.status)}</span>
              <span className="recon-row-main">
                <span className="recon-row-line">
                  <strong>{invoiceNumberFor(result, index)}</strong>
                  <span className="recon-row-txn">{result.bankTransactionId}</span>
                  {result.proofId ? <span className="recon-row-proof">{result.proofId}</span> : null}
                </span>
                <span className="recon-row-line recon-row-sub">
                  <span>Score {result.score}</span>
                  <span>·</span>
                  <span>{residualLabel(result)}</span>
                </span>
                <span className="recon-reasons">
                  {result.reasonCodes.slice(0, 3).map((code) => (
                    <span className="recon-chip" key={code}>{formatReason(code)}</span>
                  ))}
                </span>
              </span>
              <span className="recon-row-meta">
                {reviewByCase.has(result.caseId) ? <span className="recon-flag-review">Review</span> : null}
                <span className="recon-artifact-type">{(artifactByCase.get(result.caseId) ?? "").replace(/_/g, " ")}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
