import Link from "next/link";

type AppHeaderProps = {
  onClearDemo: () => void;
  clearing: boolean;
  resetMessage: string | null;
  resetError: boolean;
  onRescan: () => void;
  rescanning: boolean;
};

export function AppHeader({ onClearDemo, clearing, resetMessage, resetError, onRescan, rescanning }: AppHeaderProps) {
  return (
    <header className="app-header">
      <Link className="brand" href="/landing">
        <span className="mark" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 17l5-5 4 4 7-8" />
            <path d="M20 8h-4" />
            <path d="M20 8v4" />
          </svg>
        </span>
        <div>
          <h1>ReconPilot</h1>
          <p className="tagline">Cross-border reconciliation workspace</p>
        </div>
      </Link>
      <p className="header-tagline">AI extracts evidence. Code does money math. Humans approve risky cases.</p>
      <div className="header-actions">
        {resetMessage ? (
          <span className={`reset-message ${resetError ? "error" : ""}`}>{resetMessage}</span>
        ) : null}
        <Link className="ghost-link" href="/debug">
          Debug
        </Link>
        <button className="secondary-button" type="button" onClick={onRescan} disabled={rescanning}>
          {rescanning ? (
            "Re-running…"
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
              Re-run reconciliation
            </>
          )}
        </button>
        <button className="secondary-button" type="button" onClick={onClearDemo} disabled={clearing}>
          {clearing ? (
            "Clearing…"
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
              Clear Demo Data
            </>
          )}
        </button>
      </div>
    </header>
  );
}
