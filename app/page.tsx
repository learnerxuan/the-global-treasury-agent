"use client";

import { FormEvent, ReactNode, useState } from "react";
import type { NormalizedInputBatch } from "../src/lib/recon/types";
import type { OrchestratorOutput } from "../src/lib/recon/reconciliation/types";
import type { AgentActivityEvent } from "../src/server/input-extraction/agent-activity";
import { AppHeader } from "../src/components/AppHeader";
import { AgentActivityPanel } from "../src/components/reconciliation/AgentActivityPanel";
import { ReconciliationDashboard } from "../src/components/reconciliation/ReconciliationDashboard";

type ApiResult = {
  batchId: string;
  uploadedAt: string;
  documents: unknown;
  extractions: unknown;
  codeTools: {
    parsedInputBatch: unknown;
    normalizedInputBatch: NormalizedInputBatch;
  };
  reconciliation: OrchestratorOutput | null;
  reconciliationError: string | null;
  agentActivity: AgentActivityEvent[];
};

type UploadKey = "invoices" | "paymentProofs" | "bankStatements";

const uploadCards: Array<{ key: UploadKey; cls: string; title: string; copy: string; icon: ReactNode }> = [
  {
    key: "invoices",
    cls: "expected",
    title: "Expected Payments",
    copy: "CSV or Excel file with invoice data",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
      </svg>
    )
  },
  {
    key: "paymentProofs",
    cls: "proofs",
    title: "Payment Proofs",
    copy: "PDFs or images of payment receipts",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2h12l4 4v16l-3-2-3 2-3-2-3 2-3-2-3 2V2z" />
        <path d="M9 8h6M9 12h6" />
      </svg>
    )
  },
  {
    key: "bankStatements",
    cls: "bank",
    title: "Bank Statements",
    copy: "CSV or PDF bank statements",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18M5 21V10M19 21V10M3 10l9-6 9 6M9 21v-6h6v6" />
      </svg>
    )
  }
];

const acceptTypes =
  ".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.md,.markdown,.csv,.xlsx,application/pdf,image/png,image/jpeg,image/webp,image/tiff,text/plain,text/markdown,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  const [files, setFiles] = useState<Record<UploadKey, File[]>>({ invoices: [], paymentProofs: [], bankStatements: [] });
  const [status, setStatus] = useState<"ready" | "pending" | "done" | "error">("ready");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  const allUploaded = uploadCards.every((card) => files[card.key].length > 0);
  const showActivity = status === "pending" || result !== null;

  function addFiles(key: UploadKey, incoming: File[]) {
    setFiles((current) => ({ ...current, [key]: [...current[key], ...incoming] }));
  }

  function removeFile(key: UploadKey, target: File) {
    setFiles((current) => ({ ...current, [key]: current[key].filter((file) => file !== target) }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!allUploaded) {
      setStatus("error");
      setError("Upload at least one file in each category to proceed.");
      return;
    }

    const formData = new FormData();
    for (const card of uploadCards) {
      for (const file of files[card.key]) {
        formData.append(card.key, file);
      }
    }

    setStatus("pending");
    setResult(null);
    try {
      const response = await fetch("/api/reconciliation/extractions", { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) {
        setStatus("error");
        setError(body.error ?? "Reconciliation failed.");
        return;
      }
      setResult(body as ApiResult);
      setStatus("done");
      try {
        sessionStorage.setItem("reconpilot:lastResult", JSON.stringify(body));
      } catch {
        /* storage quota / disabled — non-fatal */
      }
    } catch (requestError) {
      setStatus("error");
      setError(requestError instanceof Error ? requestError.message : "Reconciliation request failed.");
    }
  }

  return (
    <>
      <AppHeader active="dashboard" />
      <main className="shell">
        <form onSubmit={onSubmit}>
          <div className={`run-layout ${showActivity ? "has-activity" : ""}`}>
            <div>
              <div className="section-head">
                <h1>Upload Files</h1>
                <p>Upload your expected payments, payment proofs, and bank statements to begin reconciliation.</p>
              </div>

              <div className="upload-grid">
                {uploadCards.map((card) => (
                  <article className={`upload-card ${card.cls}`} key={card.key}>
                    <div className="upload-card-head">
                      <span className="upload-card-title">
                        <span className="upload-card-icon">{card.icon}</span>
                        {card.title}
                      </span>
                      {files[card.key].length > 0 ? (
                        <span className="file-count">
                          {files[card.key].length} file{files[card.key].length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>

                    <label className="drop-zone">
                      <svg className="drop-zone-arrow" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
                      </svg>
                      <span className="drop-zone-main">{card.copy}</span>
                      <span className="drop-zone-sub">Drag and drop or click to browse</span>
                      <input
                        type="file"
                        multiple
                        accept={acceptTypes}
                        onChange={(event) => {
                          addFiles(card.key, Array.from(event.target.files ?? []));
                          event.target.value = "";
                        }}
                      />
                    </label>

                    {files[card.key].length > 0 ? (
                      <div className="file-chips">
                        {files[card.key].map((file) => (
                          <div className="file-chip" key={`${file.name}-${file.size}-${file.lastModified}`}>
                            <svg className="file-chip-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                            </svg>
                            <span className="file-chip-body">
                              <span className="file-chip-name">{file.name}</span>
                              <span className="file-chip-size">{formatSize(file.size)}</span>
                            </span>
                            <button type="button" className="file-chip-remove" aria-label={`Remove ${file.name}`} onClick={() => removeFile(card.key, file)}>
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>

              <div className="run-bar">
                <button className="run-button" type="submit" disabled={status === "pending"}>
                  {status === "pending" ? (
                    <>
                      <span className="spinner" aria-hidden="true" /> Processing…
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Run Reconciliation
                    </>
                  )}
                </button>
                <p className={`run-hint ${status === "error" ? "error" : ""}`}>
                  {status === "error" && error
                    ? error
                    : allUploaded
                      ? "Ready to reconcile."
                      : "Please upload at least one file in each category to proceed."}
                </p>
              </div>
            </div>

            {showActivity ? (
              <AgentActivityPanel activity={result?.agentActivity ?? []} processing={status === "pending"} />
            ) : null}
          </div>
        </form>

        {result && result.reconciliationError ? (
          <div className="error-banner">
            {result.reconciliationError} Extraction JSON remains available on the Extraction JSON page.
          </div>
        ) : null}

        {result?.reconciliation ? (
          <ReconciliationDashboard output={result.reconciliation} batch={result.codeTools.normalizedInputBatch} />
        ) : null}
      </main>
    </>
  );
}
