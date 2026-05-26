import type { ChangeEvent, FormEvent } from "react";
import { statusMeta } from "./adapter";
import { StatusChip } from "./StatusChip";
import type { DocumentRole, ReconciliationRun, UploadStatus } from "./types";

const FILE_HINT = "PDF, image, CSV, XLSX, TXT";

const STATUS_LABEL: Record<UploadStatus, string> = {
  ready: "Ready",
  pending: "Extracting…",
  done: "Stored",
  error: "Failed"
};

const STATUS_TONE: Record<UploadStatus, string> = {
  ready: "plain",
  pending: "info",
  done: "success",
  error: "error"
};

const ROLE_ICON: Record<DocumentRole, string> = {
  invoice: "INV",
  bank_statement: "BNK",
  payment_proof: "PRF"
};

const ROLE_COPY: Record<DocumentRole, string> = {
  invoice: "Expected payment records",
  bank_statement: "Settlement source of truth",
  payment_proof: "Customer remittance evidence"
};

type UploadCardProps = {
  role: DocumentRole;
  title: string;
  files: File[];
  status: UploadStatus;
  error: string | null;
  notice: string | null;
  storedWaiting: number;
  latestRun: ReconciliationRun | null;
  onFilesSelected: (files: File[]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function UploadCard({
  role,
  title,
  files,
  status,
  error,
  notice,
  storedWaiting,
  latestRun,
  onFilesSelected,
  onSubmit
}: UploadCardProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onFilesSelected(Array.from(event.target.files ?? []));
  }

  const accept =
    ".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.csv,.xlsx,application/pdf,image/png,image/jpeg,image/webp,image/tiff,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return (
    <form className={`upload-card ${role}`} onSubmit={onSubmit}>
      <div className="card-top">
        <div className="upload-title">
          <span className="upload-icon" aria-hidden="true">
            {ROLE_ICON[role]}
          </span>
          <div>
            <h3>{title}</h3>
            <p className="file-hint">{ROLE_COPY[role]}</p>
          </div>
        </div>
        <span className={`chip ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
      </div>

      <label className="dropzone">
        <span className="plus" aria-hidden="true">
          +
        </span>
        <span className="dz-title">Choose files</span>
        <span className="dz-copy">{files.length === 0 ? FILE_HINT : `${files.length} file(s) staged for extraction`}</span>
        <input type="file" multiple accept={accept} onChange={handleChange} />
      </label>

      {files.length > 0 ? (
        <div className="file-summary">
          <ul>
            {files.map((file) => (
              <li key={`${file.name}-${file.size}`}>
                <span className="file-check" aria-hidden="true">✓</span>
                {file.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button className="primary-button" type="submit" disabled={status === "pending"}>
        {status === "pending" ? "Extracting…" : `Extract ${title.toLowerCase()}`}
      </button>

      {error ? <div className="card-error">{error}</div> : null}

      {notice ? <div className="card-notice">{notice}</div> : null}

      <div className="card-foot">
        <span className="stored-count">
          Stored waiting: <strong className="num">{storedWaiting}</strong>
        </span>
        {latestRun ? (
          <span className="lr-inline">
            <span className="lr-label">Last reconciliation</span>
            <StatusChip status={latestRun.status} />
          </span>
        ) : null}
      </div>
    </form>
  );
}
