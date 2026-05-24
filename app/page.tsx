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
  documents: Record<DocumentRole, Array<{ fileName: string; mimeType: string; readableTextLength: number; toolObservations: string[]; warnings: string[] }>>;
  extractions: Record<DocumentRole, ExtractionResult[]>;
  codeTools: {
    parsedInputBatch: unknown;
    normalizedInputBatch: unknown;
  };
};

type UploadKey = "invoices" | "bankStatements" | "paymentProofs";

const uploadCards: Array<{ key: UploadKey; role: DocumentRole; eyebrow: string; title: string; copy: string }> = [
  { key: "invoices", role: "invoice", eyebrow: "Expected payment sources", title: "Invoices / Expected Payments", copy: "Upload one or many PDF, image, MD, XLSX, CSV, or TXT files" },
  { key: "bankStatements", role: "bank_statement", eyebrow: "Cash movement sources", title: "Bank Statements", copy: "Upload one or many PDF, image, MD, XLSX, CSV, or TXT files" },
  { key: "paymentProofs", role: "payment_proof", eyebrow: "Customer evidence", title: "Payment Proofs", copy: "Upload one or many PDF, image, MD, XLSX, CSV, or TXT files" }
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

function totalRecordCount(results: ExtractionResult[]): number {
  return results.reduce((total, result) => total + recordCount(result), 0);
}

function formatFile(file: File): string {
  return `${file.name} - ${file.type || "unknown type"} - ${Math.ceil(file.size / 1024)} KB`;
}

export default function Home() {
  const [files, setFiles] = useState<Record<UploadKey, File[]>>({
    invoices: [],
    bankStatements: [],
    paymentProofs: []
  });
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
      if (files[card.key].length === 0) {
        setStatus("error");
        setError("Upload at least one file for invoices, bank statements, and payment proofs.");
        return;
      }
    }

    const formData = new FormData();
    for (const card of uploadCards) {
      for (const file of files[card.key]) {
        formData.append(card.key, file);
      }
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
          <h1>Batch Extraction</h1>
          <p className="lede">
            Upload invoices, bank statements, and customer payment proofs in batches. The API stores every file, prepares readable evidence, the AI extraction provider selects the extraction route, and Code Tools parse and normalize the finance JSON.
          </p>
        </div>
        <div className="rule-card">
          <span className="rule-label">MVP boundary</span>
          <span>In a company deployment, invoices and bank rows usually arrive through system integrations. This MVP keeps the same batch API boundary while letting the browser provide many source files.</span>
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
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.md,.markdown,.csv,.xlsx,application/pdf,image/png,image/jpeg,image/webp,image/tiff,text/plain,text/markdown,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => setFiles((current) => ({ ...current, [card.key]: Array.from(event.target.files ?? []) }))}
                />
              </label>
              <div className="selected-file">
                <strong>{files[card.key].length === 0 ? "No files selected" : `${files[card.key].length} selected`}</strong>
                {files[card.key].length > 0 ? (
                  <ul>
                    {files[card.key].map((file) => (
                      <li key={`${file.name}-${file.size}`}>{formatFile(file)}</li>
                    ))}
                  </ul>
                ) : null}
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
            Extract all files
          </button>
        </section>
      </form>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="results-grid" aria-label="Extraction result summaries">
        {(["invoice", "bank_statement", "payment_proof"] as DocumentRole[]).map((role) => {
          const extraction = result?.extractions[role];
          const document = result?.documents[role];
          const title = role === "invoice" ? "Invoice Extractions" : role === "bank_statement" ? "Bank Statement Extractions" : "Payment Proof Extractions";
          return (
            <article className="panel result-panel" key={role}>
              <p className="eyebrow">{title}</p>
              {extraction && document ? (
                <div className="result-body">
                  <div className="summary-row">
                    <strong>{extraction.length} files</strong>
                    <span>{totalRecordCount(extraction)} records</span>
                  </div>
                  <div className="extraction-list">
                    {extraction.map((item, index) => (
                      <section className="extraction-item" key={`${item.role}-${document[index]?.fileName ?? index}`}>
                        <div className="summary-row">
                          <strong>{Math.round(item.confidence * 100)}% confidence</strong>
                          <span>{recordCount(item)} records</span>
                        </div>
                        <p>{item.summary}</p>
                        <dl className="mini-grid">
                          <div>
                            <dt>Selected tool</dt>
                            <dd>{item.selectedTool}</dd>
                          </div>
                          <div>
                            <dt>Source</dt>
                            <dd>{document[index]?.fileName}</dd>
                          </div>
                          <div>
                            <dt>Observed text</dt>
                            <dd>{document[index]?.readableTextLength ?? 0} chars</dd>
                          </div>
                        </dl>
                        {item.warnings.length > 0 ? (
                          <ul>{item.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                        ) : (
                          <p>No extraction warnings.</p>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="result-body empty">Waiting for {roleLabels[role]} batch extraction.</div>
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
