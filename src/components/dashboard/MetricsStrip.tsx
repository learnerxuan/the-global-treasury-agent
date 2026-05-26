import type { ReactElement } from "react";

export type DashboardMetrics = {
  openInvoices: number;
  bankTransactions: number;
  autoMatched: number;
  needsReview: number;
};

const InvoiceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const BankIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <path d="M3 10l9-6 9 6" />
    <line x1="8" y1="12" x2="8" y2="17" />
    <line x1="12" y1="12" x2="12" y2="17" />
    <line x1="16" y1="12" x2="16" y2="17" />
  </svg>
);

const MatchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

const ReviewIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const TILES: Array<{ key: keyof DashboardMetrics; label: string; caption: string; tone?: "success" | "review"; Icon: () => ReactElement }> = [
  { key: "openInvoices", label: "Open invoices", caption: "Available for matching", Icon: InvoiceIcon },
  { key: "bankTransactions", label: "Bank credits", caption: "Inbound settlement rows", Icon: BankIcon },
  { key: "autoMatched", label: "Auto matched", caption: "Passed policy gates", tone: "success", Icon: MatchIcon },
  { key: "needsReview", label: "Review queue", caption: "Needs human decision", tone: "review", Icon: ReviewIcon }
];

export function MetricsStrip({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <section className="metrics-strip" aria-label="Session metrics">
      {TILES.map((tile) => (
        <div className={`metric-tile ${tile.tone ?? ""}`} key={tile.key}>
          <div className="metric-tile-top">
            <div className="metric-value num">{metrics[tile.key]}</div>
            <span className="metric-icon"><tile.Icon /></span>
          </div>
          <div className="metric-label">{tile.label}</div>
          <div className="metric-caption">{tile.caption}</div>
        </div>
      ))}
    </section>
  );
}
