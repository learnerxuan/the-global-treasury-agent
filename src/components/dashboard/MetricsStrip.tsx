export type DashboardMetrics = {
  openInvoices: number;
  bankTransactions: number;
  autoMatched: number;
  needsReview: number;
};

const TILES: Array<{ key: keyof DashboardMetrics; label: string; tone?: "success" | "review" }> = [
  { key: "openInvoices", label: "Open invoices" },
  { key: "bankTransactions", label: "Bank transactions" },
  { key: "autoMatched", label: "Auto matched", tone: "success" },
  { key: "needsReview", label: "Needs review", tone: "review" }
];

export function MetricsStrip({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <section className="metrics-strip" aria-label="Session metrics">
      {TILES.map((tile) => (
        <div className={`metric-tile ${tile.tone ?? ""}`} key={tile.key}>
          <div className="metric-value num">{metrics[tile.key]}</div>
          <div className="metric-label">{tile.label}</div>
        </div>
      ))}
    </section>
  );
}
