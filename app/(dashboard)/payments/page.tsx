"use client";

import { DASHBOARD_CARDS, useDashboard } from "../../../src/components/dashboard/DashboardContext";
import { UploadCard } from "../../../src/components/dashboard/UploadCard";

export default function PaymentsPage() {
  const { files, statuses, errors, notices, runs, submitUpload, setFilesFor, storedFor } = useDashboard();
  const card = DASHBOARD_CARDS.find((item) => item.key === "paymentProofs");
  const latestRun = runs[0] ?? null;

  if (!card) return null;

  return (
    <section className="workspace-main" aria-label="Payment proof upload workspace">
      <div className="section-title">
        <div>
          <p className="eyebrow">Payment processing</p>
          <h2>Upload payment proofs</h2>
        </div>
        <span className="hint">Payment proofs trigger reconciliation against the persisted intake queue.</span>
      </div>

      <section className="upload-strip two-up" aria-label="Upload payment proofs">
        <UploadCard
          role={card.role}
          title={card.title}
          files={files[card.key]}
          status={statuses[card.key]}
          error={errors[card.key]}
          notice={notices[card.key]}
          storedWaiting={storedFor(card.key)}
          latestRun={latestRun}
          onFilesSelected={(selected) => setFilesFor(card.key, selected)}
          onSubmit={(event) => submitUpload(event, card)}
        />

        <div className="upload-card" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "40px 24px", borderTopColor: "var(--accent)" }}>
          <div style={{ marginBottom: "20px" }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h3 style={{ fontSize: "1.35rem", marginBottom: "12px" }}>Connect External Systems</h3>
          <p style={{ color: "var(--muted-fg)", fontSize: "0.95rem", marginBottom: "32px", lineHeight: "1.6", maxWidth: "320px" }}>
            Connect directly to your ERP, accounting software, or cloud storage providers (AWS, Google, Azure) to automatically sync payment proofs in real-time.
          </p>
          <button className="primary-button" type="button" style={{ width: "100%", maxWidth: "280px", height: "48px", fontSize: "1rem" }}>
            Connect Company System
          </button>
        </div>
      </section>
    </section>
  );
}
