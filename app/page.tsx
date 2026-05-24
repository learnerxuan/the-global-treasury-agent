"use client";

import { FormEvent, useMemo, useState } from "react";

type DocumentRole = "invoice" | "bank_statement" | "payment_proof";

type ExtractionResult = {
  role: DocumentRole;
  selectedTool: string;
  confidence: number;
  summary: string;
  invoices: unknown[];
  bankTransactions: unknown[];
  paymentProofs: unknown[];
  warnings: string[];
};

type ApiResult = {
  batchId: string;
  uploadedAt: string;
  documents: Record<DocumentRole, { fileName: string; mimeType: string; readableTextLength: number; toolObservations: string[]; warnings: string[] }>;
  extractions: Record<DocumentRole, ExtractionResult>;
  codeTools: {
    parsedInputBatch: unknown;
    normalizedInputBatch: unknown;
  };
};

type UploadKey = "invoice" | "bankStatement" | "paymentProof";

const uploadCards: Array<{ key: UploadKey; role: DocumentRole; eyebrow: string; title: string; copy: string }> = [
  { key: "invoice", role: "invoice", eyebrow: "Expected payment source", title: "Invoice / Expected Payment", copy: "PDF, image, XLSX, CSV, or TXT" },
  { key: "bankStatement", role: "bank_statement", eyebrow: "Cash movement source", title: "Bank Statement", copy: "PDF, image, XLSX, CSV, or TXT" },
  { key: "paymentProof", role: "payment_proof", eyebrow: "Customer evidence", title: "Payment Proof", copy: "PDF, image, XLSX, CSV, or TXT" }
];

const roleLabels: Record<DocumentRole, string> = {
  invoice: "invoice",
  bank_statement: "bank statement",
  payment_proof: "payment proof"
};

function recordCount(result: ExtractionResult): number {
  if (result.role === "invoice") return result.invoices.length;
  if (result.role === "bank_statement") return result.bankTransactions.length;
  return result.paymentProofs.length;
}

function formatFile(file?: File): string {
  if (!file) return "No file selected";
  return `${file.name} - ${file.type || "unknown type"} - ${Math.ceil(file.size / 1024)} KB`;
}

export default function Home() {
  const [files, setFiles] = useState<Partial<Record<UploadKey, File>>>({});
  const [status, setStatus] = useState<"ready" | "pending" | "readyDone" | "error">("ready");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const structuredExtractionJson = result
    ? {
        batchId: result.batchId,
        uploadedAt: result.uploadedAt,
        documents: result.documents,
        extractions: result.extractions
      }
    : {};

  const statusCopy = useMemo(() => {
    if (status === "pending") return "AI provider is selecting tools";
    if (status === "readyDone") return "Extraction complete";
    if (status === "error") return "Extraction failed";
    return "Ready";
  }, [status]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    for (const card of uploadCards) {
      if (!files[card.key]) {
        setStatus("error");
        setError("Select all three documents before extraction.");
        return;
      }
    }

    const formData = new FormData();
    for (const card of uploadCards) {
      formData.append(card.key, files[card.key] as File);
    }

    setStatus("pending");
    const response = await fetch("/api/reconciliation/extractions", {
      method: "POST",
      body: formData
    });
    const body = await response.json();

    if (!response.ok) {
      setStatus("error");
      setError(body.error ?? "Extraction failed.");
      return;
    }

    setResult(body as ApiResult);
    setStatus("readyDone");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ReconPilot MVP</p>
          <h1>Three-Document Extraction</h1>
          <p className="lede">
            Upload the three source documents used by the MVP. The API stores the files, prepares readable evidence, and the AI extraction provider selects the route for each document before Code Tools parse and normalize the finance JSON.
          </p>
        </div>
        <div className="rule-card">
          <span className="rule-label">MVP boundary</span>
          <span>In a company deployment, invoices and bank rows usually arrive through system integrations. This MVP keeps the same API boundary while letting the browser provide all three source files.</span>
        </div>
      </header>

      <form className="upload-form" onSubmit={onSubmit}>
        <section className="upload-grid" aria-label="Reconciliation input uploads">
          {uploadCards.map((card) => (
            <article className={`panel intake-panel ${card.role}`} key={card.key}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">{card.eyebrow}</p>
                  <h2>{card.title}</h2>
                </div>
              </div>
              <label className="drop-zone">
                <span className="drop-icon" aria-hidden="true">
                  +
                </span>
                <span className="drop-title">Choose file</span>
                <span className="drop-copy">{card.copy}</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.csv,.xlsx,application/pdf,image/png,image/jpeg,image/webp,image/tiff,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => setFiles((current) => ({ ...current, [card.key]: event.target.files?.[0] }))}
                />
              </label>
              <div className="selected-file">
                <span>{formatFile(files[card.key])}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="run-bar">
          <div>
            <p className="eyebrow">Extraction Agent</p>
            <h2>The AI extraction provider chooses the route for every document</h2>
          </div>
          <span className={`status-pill ${status === "error" ? "review" : status === "pending" ? "pending" : status === "readyDone" ? "ready" : "neutral"}`}>
            {statusCopy}
          </span>
          <button className="primary-button" disabled={status === "pending"} type="submit">
            Extract all documents
          </button>
        </section>
      </form>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="results-grid" aria-label="Extraction result summaries">
        {(["invoice", "bank_statement", "payment_proof"] as DocumentRole[]).map((role) => {
          const extraction = result?.extractions[role];
          const document = result?.documents[role];
          const title = role === "invoice" ? "Invoice Extraction" : role === "bank_statement" ? "Bank Statement Extraction" : "Payment Proof Extraction";
          return (
            <article className="panel result-panel" key={role}>
              <p className="eyebrow">{title}</p>
              {extraction ? (
                <div className="result-body">
                  <div className="summary-row">
                    <strong>{Math.round(extraction.confidence * 100)}% confidence</strong>
                    <span>{recordCount(extraction)} records</span>
                  </div>
                  <p>{extraction.summary}</p>
                  <dl className="mini-grid">
                    <div>
                      <dt>Selected tool</dt>
                      <dd>{extraction.selectedTool}</dd>
                    </div>
                    <div>
                      <dt>Source</dt>
                      <dd>{document?.fileName}</dd>
                    </div>
                    <div>
                      <dt>Observed text</dt>
                      <dd>{document?.readableTextLength} chars</dd>
                    </div>
                  </dl>
                  {extraction.warnings.length > 0 ? (
                    <ul>{extraction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                  ) : (
                    <p>No extraction warnings.</p>
                  )}
                </div>
              ) : (
                <div className="result-body empty">Waiting for {roleLabels[role]} extraction.</div>
              )}
            </article>
          );
        })}
      </section>

      <section className="details-grid" aria-label="Raw API result">
        <article className="panel json-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">API Response</p>
              <h2>Structured Extraction JSON</h2>
            </div>
            <span className="status-pill neutral">JSON</span>
          </div>
          <pre tabIndex={0}>{JSON.stringify(structuredExtractionJson, null, 2)}</pre>
        </article>
        <article className="panel json-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Code Tools Output</p>
              <h2>Parsed + Normalized JSON</h2>
            </div>
            <span className="status-pill neutral">JSON</span>
          </div>
          <pre tabIndex={0}>{JSON.stringify(result?.codeTools ?? {}, null, 2)}</pre>
        </article>
      </section>
    </main>
  );
}
