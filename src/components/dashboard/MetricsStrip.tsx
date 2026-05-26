export type DashboardMetrics = {
  openInvoices: number;
  bankTransactions: number;
  autoMatched: number;
  needsReview: number;
};

const TILES: Array<{ key: keyof DashboardMetrics; label: string; caption: string; tone?: "success" | "review" }> = [
  { key: "openInvoices", label: "Open invoices", caption: "Available for matching" },
  { key: "bankTransactions", label: "Bank credits", caption: "Inbound settlement rows" },
  { key: "autoMatched", label: "Auto matched", caption: "Passed policy gates", tone: "success" },
  { key: "needsReview", label: "Review queue", caption: "Needs human decision", tone: "review" }
];

export function MetricsStrip({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <section className="metrics-strip" aria-label="Session metrics">
      {TILES.map((tile) => (
        <div className={`metric-tile ${tile.tone ?? ""}`} key={tile.key}>
          <div className="metric-value num">{metrics[tile.key]}</div>
          <div className="metric-label">{tile.label}</div>
          <div className="metric-caption">{tile.caption}</div>
        </div>
      ))}
    </section>
  );
}
