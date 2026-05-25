"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReconciliationRun, RoleApiResult, UploadKey } from "../../src/components/dashboard/types";

type StoredResults = Partial<Record<UploadKey, RoleApiResult>>;

const ROLE_LABEL: Record<UploadKey, string> = {
  invoices: "Invoices",
  bankStatements: "Bank Statements",
  paymentProofs: "Payment Proofs"
};

function DebugRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="debug-row">
      <dt>{label}</dt>
      <dd>{value && value.length > 0 ? value : "—"}</dd>
    </div>
  );
}

export default function DebugPage() {
  const [results, setResults] = useState<StoredResults>({});
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedJson, setSelectedJson] = useState<string>("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("reconpilot:results");
      if (raw) setResults(JSON.parse(raw) as StoredResults);
    } catch {
      setResults({});
    }
    // Reconciliation runs are persisted on disk, so load them regardless of session.
    void (async () => {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { runs?: ReconciliationRun[] };
        setRuns(body.runs ?? []);
      } catch {
        // ignore — debug page is best-effort
      }
    })();
  }, []);

  const uploads = useMemo(
    () => (Object.entries(results) as Array<[UploadKey, RoleApiResult]>).filter(([, value]) => Boolean(value)),
    [results]
  );

  const jsonSources = useMemo(() => {
    const sources: Array<{ id: string; label: string; data: unknown }> = [];
    for (const [key, value] of uploads) {
      sources.push({ id: `resp-${key}`, label: `${ROLE_LABEL[key]} — full response`, data: value });
      sources.push({ id: `norm-${key}`, label: `${ROLE_LABEL[key]} — normalized batch`, data: value.codeTools.normalizedInputBatch });
    }
    for (const run of runs) {
      sources.push({ id: `run-${run.runId}`, label: `Run ${run.status} — ${run.proofId ?? run.runId}`, data: run });
    }
    return sources;
  }, [uploads, runs]);

  const activeJson = useMemo(() => {
    const source = jsonSources.find((entry) => entry.id === selectedJson) ?? jsonSources[0];
    return source ? JSON.stringify(source.data, null, 2) : "";
  }, [jsonSources, selectedJson]);

  async function clearRuntime() {
    setClearing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/dev/clear-runtime", { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body.error ?? "Unable to clear runtime data.");
        return;
      }
      sessionStorage.removeItem("reconpilot:results");
      setResults({});
      setMessage("Local runtime data cleared.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to clear runtime data.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <main className="shell">
      <div className="debug-head">
        <h1>Debug Console</h1>
        <div className="header-actions">
          {message ? <span className="reset-message">{message}</span> : null}
          <Link className="ghost-link" href="/">
            Back to Dashboard
          </Link>
          <button className="secondary-button" type="button" onClick={clearRuntime} disabled={clearing}>
            {clearing ? "Clearing…" : "Clear Demo Data"}
          </button>
        </div>
      </div>

      {uploads.length === 0 && runs.length === 0 ? (
        <p className="empty-note">
          No diagnostics in this session yet. Run an extraction on the dashboard, then return here to inspect raw paths
          and JSON.
        </p>
      ) : (
        <>
          {uploads.map(([key, value]) => (
            <section className="debug-panel" key={key}>
              <h2>{ROLE_LABEL[key]} — Upload Debug Files</h2>
              <dl className="debug-grid">
                <DebugRow label="Ingestion ID" value={value.ingestionId} />
                <DebugRow label="Full response JSON" value={value.debugResponsePath} />
                <DebugRow label="Ingestion summary" value={value.storage.summaryPath} />
                <DebugRow label="Parsed input batch" value={value.storage.parsedInputBatchPath} />
                <DebugRow label="Normalized input batch" value={value.storage.normalizedInputBatchPath} />
                <DebugRow label="Jobs" value={value.storage.jobsPath} />
                <DebugRow label="Waiting records" value={value.storage.waitingRecordPaths.join("\n")} />
              </dl>
            </section>
          ))}

          {runs.length > 0 ? (
            <section className="debug-panel">
              <h2>Reconciliation Files</h2>
              {runs.map((run) => (
                <dl className="debug-grid" key={run.runId}>
                  <DebugRow label="Status" value={run.status} />
                  <DebugRow label="Run JSON" value={run.outputPaths.runPath} />
                  <DebugRow label="Report JSON" value={run.outputPaths.reconciliationReportPath} />
                  <DebugRow label="Discrepancy JSON" value={run.outputPaths.discrepancySummaryPath} />
                  <DebugRow label="Mock notification JSON" value={run.outputPaths.mockNotificationPath} />
                </dl>
              ))}
            </section>
          ) : null}

          <section className="debug-panel">
            <h2>Raw JSON Viewer</h2>
            <div className="json-controls">
              <select
                className="status-filter"
                value={selectedJson || jsonSources[0]?.id || ""}
                onChange={(event) => setSelectedJson(event.target.value)}
              >
                {jsonSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.label}
                  </option>
                ))}
              </select>
            </div>
            <pre className="json-viewer">{activeJson}</pre>
          </section>
        </>
      )}
    </main>
  );
}
