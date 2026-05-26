import Link from "next/link";

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44L2.5 7.38A2.5 2.5 0 0 1 4.96 4.44L9.5 2Z" />
        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44l4.54-12.56A2.5 2.5 0 0 0 19.04 4.44L14.5 2Z" />
      </svg>
    ),
    title: "AI Evidence Extraction",
    body: "Upload invoices, bank statements, and payment proofs in any format. The agent reads, parses, and normalises every field automatically."
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    title: "Live FX Reconciliation",
    body: "Cross-border amounts are matched using bank-recorded rates, BNM daily rates, and implied FX — whichever fits the evidence best."
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
    title: "Policy-Gated Matching",
    body: "Auto-matches pass a deterministic scoring engine. Anything below the confidence threshold lands in the human review queue instead of slipping through."
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "Full Audit Trail",
    body: "Every decision — extraction, FX selection, scoring, human override — is timestamped and stored with the reasoning that produced it."
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    title: "Human-in-the-Loop",
    body: "Risky cases surface a structured review payload — primary question, suggested actions, flag context — so approvals take seconds, not minutes."
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    title: "Generated Reports",
    body: "Reconciliation reports and discrepancy summaries are produced automatically and attached to each case for downstream accounting."
  }
];

const STATS = [
  { value: "Fast", label: "Extraction per document" },
  { value: "Global", label: "Cross-border FX coverage" },
  { value: "Minimal", label: "Manual data entry required" }
];

export default function LandingPage() {
  return (
    <div className="landing-shell">

      {/* ── Nav ── */}
      <nav className="landing-nav">
        <Link className="landing-brand" href="/landing">
          <span className="mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17l5-5 4 4 7-8" />
              <path d="M20 8h-4" />
              <path d="M20 8v4" />
            </svg>
          </span>
          <span className="landing-brand-name">ReconPilot</span>
        </Link>
        <div className="landing-nav-actions">
          <Link className="ghost-link" href="/debug">Debug</Link>
          <Link className="landing-cta-btn" href="/">Open workspace</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <p className="eyebrow">Cross-border reconciliation</p>
        <h1 className="landing-h1">
          AI extraction and reconciliation.<br />
          <span className="landing-h1-accent">Human-guided review.</span>
        </h1>
        <p className="landing-hero-sub">
          ReconPilot connects your invoices, bank settlements, and payment proofs into a single reconciliation engine — handling FX conversion, reference matching, and trust scoring so your team only touches the exceptions.
        </p>
        <div className="landing-hero-actions">
          <Link className="landing-cta-btn landing-cta-lg" href="/">Open workspace</Link>
          <Link className="ghost-link landing-ghost-lg" href="/debug">View debug output</Link>
        </div>

        {/* stat strip */}
        <div className="landing-stats">
          {STATS.map((s) => (
            <div className="landing-stat" key={s.label}>
              <span className="landing-stat-value">{s.value}</span>
              <span className="landing-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="landing-section">
        <p className="eyebrow">How it works</p>
        <h2 className="landing-h2">Three uploads. One decision.</h2>
        <div className="landing-steps">
          {[
            { num: "01", role: "Invoices", desc: "Expected payment records — what your counterparty owes you, in what currency, by when." },
            { num: "02", role: "Bank Statements", desc: "Settlement source of truth — what actually landed in your account and when." },
            { num: "03", role: "Payment Proofs", desc: "Remittance evidence — the payment receipt or SWIFT confirmation from the payer." }
          ].map((step) => (
            <div className="landing-step" key={step.num}>
              <span className="landing-step-num">{step.num}</span>
              <div>
                <h3 className="landing-step-title">{step.role}</h3>
                <p className="landing-step-desc">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="landing-steps-result">
          The engine matches them, computes FX basis, scores confidence, and either auto-approves or surfaces the case for human review — all within seconds.
        </p>
      </section>

      {/* ── Features ── */}
      <section className="landing-section">
        <p className="eyebrow">Capabilities</p>
        <h2 className="landing-h2">Built for cross-border complexity</h2>
        <div className="landing-features">
          {FEATURES.map((f) => (
            <div className="landing-feature" key={f.title}>
              <span className="landing-feature-icon">{f.icon}</span>
              <h3 className="landing-feature-title">{f.title}</h3>
              <p className="landing-feature-body">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA band ── */}
      <section className="landing-band">
        <h2 className="landing-band-h2">Ready to reconcile?</h2>
        <p className="landing-band-sub">Upload your first set of documents and get a reconciliation result in under a minute.</p>
        <Link className="landing-cta-btn landing-cta-lg" href="/">Open workspace →</Link>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <span className="landing-brand">
          <span className="mark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 17l5-5 4 4 7-8" />
              <path d="M20 8h-4" />
              <path d="M20 8v4" />
            </svg>
          </span>
          ReconPilot
        </span>
        <span className="landing-footer-copy">Cross-border reconciliation workspace</span>
      </footer>
    </div>
  );
}
