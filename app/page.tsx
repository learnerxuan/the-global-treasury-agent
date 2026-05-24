"use client";

import { FormEvent, useMemo, useState } from "react";

type DocumentRole = "invoice" | "bank_statement" | "payment_proof";
type UploadKey = "invoices" | "bankStatements" | "paymentProofs";
type UploadStatus = "ready" | "pending" | "done" | "error";

type MoneyExtraction = {
  value: string | null;
  currency: string | null;
};

type BankTransactionExtraction = {
  transactionDate: string | null;
  valueDate: string | null;
  description: string | null;
  payerName: string | null;
  amount: MoneyExtraction;
  amountReceived?: MoneyExtraction | null;
  sourceAmount?: MoneyExtraction | null;
  exchangeRateApplied?: string | null;
  bankFeeDeducted?: MoneyExtraction | null;
  feeCurrency?: string | null;
  netCreditAmount?: MoneyExtraction | null;
  reference?: string | null;
  referenceNo?: string | null;
  ttNo?: string | null;
  remarks?: string | null;
};

type PaymentProofExtraction = {
  payerName: string | null;
  creditorName: string | null;
  paymentDate: string | null;
  paidAmount: MoneyExtraction;
  reference: string | null;
  paymentStatus: string | null;
  providerOrBankName: string | null;
  exchangeRate: string | null;
  grossAmount?: MoneyExtraction | null;
  feeAmount?: MoneyExtraction | null;
  feeCurrency?: string | null;
  netAmount?: MoneyExtraction | null;
};

type ExtractionResult = {
  role: DocumentRole;
  selectedTool: string;
  confidence: number;
  summary: string;
  invoices: unknown[];
  bankTransactions: BankTransactionExtraction[];
  paymentProofs: PaymentProofExtraction[];
  warnings: string[];
};

type RoleApiResult = {
  ingestionId: string;
  role: DocumentRole;
  uploadedAt: string;
  documents: Array<{ fileName: string; mimeType: string; readableTextLength: number; toolObservations: string[]; warnings: string[] }>;
  extractions: ExtractionResult[];
  codeTools: {
    parsedInputBatch: unknown;
    normalizedInputBatch: unknown;
  };
  storage: {
    ingestionDir: string;
    summaryPath: string;
    waitingRecordPaths: string[];
  };
  mockReconciliationRun: {
    runId: string;
    status: string;
    message: string;
    nextStep: string;
    path: string;
  } | null;
};

type UploadCard = {
  key: UploadKey;
  role: DocumentRole;
  endpoint: string;
  eyebrow: string;
  title: string;
  copy: string;
};

const uploadCards: UploadCard[] = [
  {
    key: "invoices",
    role: "invoice",
    endpoint: "/api/invoices/extractions",
    eyebrow: "Expected payments",
    title: "Invoices",
    copy: "Upload one or many PDF, image, XLSX, CSV, or TXT files"
  },
  {
    key: "bankStatements",
    role: "bank_statement",
    endpoint: "/api/bank-statements/extractions",
    eyebrow: "Cash movement",
    title: "Bank Statements",
    copy: "Upload one or many PDF, image, XLSX, CSV, or TXT files"
  },
  {
    key: "paymentProofs",
    role: "payment_proof",
    endpoint: "/api/payment-proofs/extractions",
    eyebrow: "Customer evidence",
    title: "Payment Proofs",
    copy: "Upload one or many PDF, image, XLSX, CSV, or TXT files"
  }
];

const accept = ".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.csv,.xlsx,application/pdf,image/png,image/jpeg,image/webp,image/tiff,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function formatFile(file: File): string {
  return `${file.name} - ${file.type || "unknown type"} - ${Math.ceil(file.size / 1024)} KB`;
}

function recordCount(result: ExtractionResult): number {
  if (result.role === "invoice") return result.invoices.length;
  if (result.role === "bank_statement") return result.bankTransactions.length;
  return result.paymentProofs.length;
}

function totalRecordCount(results: ExtractionResult[]): number {
  return results.reduce((total, result) => total + recordCount(result), 0);
}

function statusCopy(status: UploadStatus): string {
  if (status === "pending") return "Extracting";
  if (status === "done") return "Stored";
  if (status === "error") return "Failed";
  return "Ready";
}

export default function Home() {
  const [files, setFiles] = useState<Record<UploadKey, File[]>>({
    invoices: [],
    bankStatements: [],
    paymentProofs: []
  });
  const [statuses, setStatuses] = useState<Record<UploadKey, UploadStatus>>({
    invoices: "ready",
    bankStatements: "ready",
    paymentProofs: "ready"
  });
  const [errors, setErrors] = useState<Record<UploadKey, string | null>>({
    invoices: null,
    bankStatements: null,
    paymentProofs: null
  });
  const [results, setResults] = useState<Partial<Record<UploadKey, RoleApiResult>>>({});
  const latestResult = useMemo(() => {
    const values = Object.values(results);
    return values.length > 0 ? values[values.length - 1] : null;
  }, [results]);

  async function submitUpload(event: FormEvent<HTMLFormElement>, card: UploadCard) {
    event.preventDefault();
    const selected = files[card.key];
    if (selected.length === 0) {
      setStatuses((current) => ({ ...current, [card.key]: "error" }));
      setErrors((current) => ({ ...current, [card.key]: "Upload at least one file." }));
      return;
    }

    const formData = new FormData();
    for (const file of selected) {
      formData.append("files", file);
    }

    setStatuses((current) => ({ ...current, [card.key]: "pending" }));
    setErrors((current) => ({ ...current, [card.key]: null }));

    const response = await fetch(card.endpoint, {
      method: "POST",
      body: formData
    });
    const body = await response.json();

    if (!response.ok) {
      setStatuses((current) => ({ ...current, [card.key]: "error" }));
      setErrors((current) => ({ ...current, [card.key]: body.error ?? "Extraction failed." }));
      return;
    }

    setResults((current) => ({ ...current, [card.key]: body as RoleApiResult }));
    setStatuses((current) => ({ ...current, [card.key]: "done" }));
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ReconPilot MVP</p>
          <h1>Separate Extraction Storage</h1>
          <p className="lede">
            Upload invoices, bank statements, and payment proofs independently. Each file is extracted, parsed, normalized, and written to local waiting storage.
          </p>
        </div>
        <div className="rule-card">
          <span className="rule-label">Current slice</span>
          <span>Upload to local storage only. Reconciliation matching will read these waiting records in the next step.</span>
        </div>
      </header>

      <section className="upload-grid" aria-label="Separate uploads">
        {uploadCards.map((card) => {
          const result = results[card.key];
          const status = statuses[card.key];
          return (
            <form className={`panel intake-panel ${card.role}`} key={card.key} onSubmit={(event) => submitUpload(event, card)}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">{card.eyebrow}</p>
                  <h2>{card.title}</h2>
                </div>
                <span className={`status-pill ${status === "error" ? "review" : status === "pending" ? "pending" : status === "done" ? "ready" : "neutral"}`}>
                  {statusCopy(status)}
                </span>
              </div>

              <label className="drop-zone">
                <span className="drop-icon" aria-hidden="true">+</span>
                <span className="drop-title">Choose files</span>
                <span className="drop-copy">{card.copy}</span>
                <input
                  type="file"
                  multiple
                  accept={accept}
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

              <button className="primary-button" disabled={status === "pending"} type="submit">
                Extract {card.title.toLowerCase()}
              </button>

              {errors[card.key] ? <div className="error-banner">{errors[card.key]}</div> : null}

              {result ? (
                <div className="result-body">
                  <div className="summary-row">
                    <strong>{result.documents.length} file(s)</strong>
                    <span>{totalRecordCount(result.extractions)} waiting record(s)</span>
                  </div>
                  <dl className="mini-grid">
                    <div>
                      <dt>Ingestion</dt>
                      <dd>{result.ingestionId}</dd>
                    </div>
                    <div>
                      <dt>Stored records</dt>
                      <dd>{result.storage.waitingRecordPaths.length}</dd>
                    </div>
                    <div>
                      <dt>Local folder</dt>
                      <dd>{result.storage.ingestionDir}</dd>
                    </div>
                    {result.mockReconciliationRun ? (
                      <>
                        <div>
                          <dt>Recon mock</dt>
                          <dd>{result.mockReconciliationRun.status}</dd>
                        </div>
                        <div>
                          <dt>Mock run file</dt>
                          <dd>{result.mockReconciliationRun.path}</dd>
                        </div>
                      </>
                    ) : null}
                  </dl>
                  {result.mockReconciliationRun ? (
                    <p>{result.mockReconciliationRun.message}</p>
                  ) : null}
                </div>
              ) : null}
            </form>
          );
        })}
      </section>

      <section className="details-grid" aria-label="Latest stored result">
        <article className="panel json-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Latest Upload</p>
              <h2>Stored Extraction JSON</h2>
            </div>
            <span className="status-pill neutral">JSON</span>
          </div>
          <pre tabIndex={0}>{JSON.stringify(latestResult ?? {}, null, 2)}</pre>
        </article>
      </section>
    </main>
  );
}
