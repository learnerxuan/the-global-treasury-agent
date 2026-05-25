import type { OrchestratorOutput } from "../../lib/recon/reconciliation/types";

const CARDS: Array<{ key: keyof OrchestratorOutput["summary"]; label: string; cls: string }> = [
  { key: "autoMatched", label: "Auto matched", cls: "auto" },
  { key: "likelyMatched", label: "Likely matched", cls: "likely" },
  { key: "needsReview", label: "Needs review", cls: "review" },
  { key: "unmatched", label: "Unmatched", cls: "unmatched" }
];

export function BatchSummaryCards({ output }: { output: OrchestratorOutput }) {
  return (
    <div>
      <div className="recon-summary-cards">
        {CARDS.map((card) => (
          <div className={`recon-stat recon-stat-${card.cls}`} key={card.key}>
            <span className="recon-stat-value">{output.summary[card.key]}</span>
            <span className="recon-stat-label">{card.label}</span>
          </div>
        ))}
      </div>
      <p className="recon-meta">
        <span>
          Batch <b>{output.batchId}</b>
        </span>
        <span>
          <b>{output.results.length}</b> bank credits
        </span>
        <span>
          <b>{output.artifactRequests.length}</b> artifacts
        </span>
        <span>
          <b>{output.humanReviewRequests.length}</b> review tasks
        </span>
      </p>
    </div>
  );
}
