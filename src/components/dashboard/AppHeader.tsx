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
      <div className="brand">
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
          <p className="subtagline">AI extracts evidence. Code does money math. Humans approve risky cases.</p>
        </div>
      </div>
      <div className="header-actions">
        {resetMessage ? (
          <span className={`reset-message ${resetError ? "error" : ""}`}>{resetMessage}</span>
        ) : null}
        <Link className="ghost-link" href="/debug">
          Debug
        </Link>
        <button className="secondary-button" type="button" onClick={onRescan} disabled={rescanning}>
          {rescanning ? "Re-running…" : "Re-run reconciliation"}
        </button>
        <button className="secondary-button" type="button" onClick={onClearDemo} disabled={clearing}>
          {clearing ? "Clearing…" : "Clear Demo Data"}
        </button>
      </div>
    </header>
  );
}
