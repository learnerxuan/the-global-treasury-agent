import Link from "next/link";

export function AppHeader({ active }: { active?: "dashboard" | "json" }) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/" className="app-brand" style={{ textDecoration: "none" }}>
          <span className="app-logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="8" width="18" height="12" rx="2" />
              <path d="M12 8V4" />
              <circle cx="12" cy="3" r="1" />
              <path d="M8 13h.01M16 13h.01" />
              <path d="M9 17h6" />
            </svg>
          </span>
          <span>
            <p className="app-brand-name">ReconPilot</p>
            <p className="app-brand-sub">FX Reconciliation Agent</p>
          </span>
        </Link>
        <nav className="app-nav">
          <Link className="app-nav-link" href="/" aria-current={active === "dashboard" ? "page" : undefined}>
            Dashboard
          </Link>
          <Link className="app-nav-link" href="/json" aria-current={active === "json" ? "page" : undefined}>
            Extraction JSON
          </Link>
        </nav>
      </div>
    </header>
  );
}
