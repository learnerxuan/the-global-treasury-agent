"use client";

import { DASHBOARD_CARDS, useDashboard } from "../../../src/components/dashboard/DashboardContext";
import { UploadCard } from "../../../src/components/dashboard/UploadCard";

const BANK_STATEMENTS_KEYS = new Set(["bankStatements"]);

export default function BankStatementsPage() {
  const { files, statuses, errors, notices, runs, submitUpload, setFilesFor, storedFor } = useDashboard();
  const latestRun = runs[0] ?? null;

  return (
    <section className="workspace-main" aria-label="Bank Statements workspace">
      <div className="section-title">
        <div>
          <p className="eyebrow">Statement Ingestion</p>
          <h2>Upload bank statements</h2>
        </div>
        <span className="hint">Bank statements provide the settlement source of truth.</span>
      </div>

      <section className="upload-strip two-up" aria-label="Upload bank statements">
        {DASHBOARD_CARDS.filter((card) => BANK_STATEMENTS_KEYS.has(card.key)).map((card) => (
          <UploadCard
            key={card.key}
            role={card.role}
            title={card.title}
            files={files[card.key]}
            status={statuses[card.key]}
            error={errors[card.key]}
            notice={notices[card.key]}
            storedWaiting={storedFor(card.key)}
            latestRun={null}
            onFilesSelected={(selected) => setFilesFor(card.key, selected)}
            onSubmit={(event) => submitUpload(event, card)}
          />
        ))}

        <div className="upload-card" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "40px 24px", borderTopColor: "var(--info)" }}>
          <div style={{ marginBottom: "20px" }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--info)" }}>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="7" y1="15" x2="7.01" y2="15" />
              <line x1="11" y1="15" x2="13" y2="15" />
            </svg>
          </div>
          <h3 style={{ fontSize: "1.35rem", marginBottom: "12px" }}>Automate Bank Feeds</h3>
          <p style={{ color: "var(--muted-fg)", fontSize: "0.95rem", marginBottom: "32px", lineHeight: "1.6", maxWidth: "320px" }}>
            Connect directly to your corporate banking portal, TMS, or via Open Banking APIs (e.g., SWIFT, Plaid) to automatically fetch daily bank statements.
          </p>
          <button className="primary-button" type="button" style={{ width: "100%", maxWidth: "280px", height: "48px", fontSize: "1rem", backgroundColor: "var(--info)", borderColor: "var(--info)" }}>
            Connect Bank Account
          </button>
        </div>
      </section>
    </section>
  );
}
