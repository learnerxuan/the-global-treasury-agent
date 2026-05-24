"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "../../src/components/AppHeader";

type StoredResult = {
  batchId: string;
  uploadedAt: string;
  documents: unknown;
  extractions: unknown;
  codeTools: { parsedInputBatch: unknown; normalizedInputBatch: unknown };
};

type Tab = "structured" | "normalized";

export default function JsonPage() {
  const [data, setData] = useState<StoredResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("structured");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("reconpilot:lastResult");
      if (raw) setData(JSON.parse(raw) as StoredResult);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  const structuredExtraction = data
    ? { batchId: data.batchId, uploadedAt: data.uploadedAt, documents: data.documents, extractions: data.extractions }
    : null;

  return (
    <>
      <AppHeader active="json" />
      <main className="shell">
        <div className="section-head">
          <h1>Extraction JSON</h1>
          <p>Structured extraction and parsed + normalized output from the most recent reconciliation run.</p>
        </div>

        {loaded && !data ? (
          <div className="panel debug-empty">
            <div>
              <p style={{ marginBottom: 6 }}>No run data yet.</p>
              <p style={{ margin: 0 }}>
                Run a reconciliation on the <a href="/">dashboard</a> first.
              </p>
            </div>
          </div>
        ) : null}

        {data ? (
          <div className="panel json-panel">
            <div className="tabs">
              <button type="button" className={`tab ${tab === "structured" ? "is-active" : ""}`} onClick={() => setTab("structured")}>
                Structured Extraction JSON
              </button>
              <button type="button" className={`tab ${tab === "normalized" ? "is-active" : ""}`} onClick={() => setTab("normalized")}>
                Parsed + Normalized JSON
              </button>
            </div>
            <pre tabIndex={0}>
              {tab === "structured"
                ? JSON.stringify(structuredExtraction, null, 2)
                : JSON.stringify(data.codeTools, null, 2)}
            </pre>
          </div>
        ) : null}
      </main>
    </>
  );
}
