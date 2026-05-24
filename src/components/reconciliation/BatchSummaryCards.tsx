import type { OrchestratorOutput } from "../../lib/recon/reconciliation/types";

const CARDS: Array<{ key: keyof OrchestratorOutput["summary"]; label: string; cls: string }> = [
  { key: "autoMatched", label: "Auto matched", cls: "auto" },
  { key: "likelyMatched", label: "Likely matched", cls: "likely" },
  { key: "needsReview", label: "Needs review", cls: "review" },
  { key: "unmatched", label: "Unmatched", cls: "unmatched" }
];

export function BatchSummaryCards({ output }: { output: OrchestratorOutput }) {
  return (
    <section className="recon-summary" aria-label="Reconciliation batch summary">
      <div className="recon-summary-cards">
        {CARDS.map((card) => (
          <div className={`recon-stat recon-stat-${card.cls}`} key={card.key}>
            <span className="recon-stat-value">{output.summary[card.key]}</span>
            <span className="recon-stat-label">{card.label}</span>
          </div>
        ))}
      </div>
      <dl className="recon-meta">
        <div>
          <dt>Batch ID</dt>
          <dd>{output.batchId}</dd>
        </div>
        <div>
          <dt>Bank credits processed</dt>
          <dd>{output.results.length}</dd>
        </div>
        <div>
          <dt>Artifact requests</dt>
          <dd>{output.artifactRequests.length}</dd>
        </div>
        <div>
          <dt>Human review requests</dt>
          <dd>{output.humanReviewRequests.length}</dd>
        </div>
      </dl>
    </section>
  );
}
