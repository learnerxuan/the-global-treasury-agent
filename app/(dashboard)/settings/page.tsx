import { ReconciliationSettingsPanel } from "../../../src/components/dashboard/ReconciliationSettingsPanel";

export default function SettingsPage() {
  return (
    <section className="workspace-main animate-fade-in" aria-label="Settings workspace">
      <div className="section-title">
        <div>
          <p style={{ color: "rgba(245, 248, 242, 0.52)", fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>Configuration</p>
          <h2>Reconciliation Settings</h2>
        </div>
        <span className="hint">Configure the tolerances and margins used by the reconciliation engine.</span>
      </div>
      <ReconciliationSettingsPanel />
    </section>
  );
}
