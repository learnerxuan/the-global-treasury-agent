import { statusMeta } from "./adapter";
import { StatusChip } from "./StatusChip";
import type { ReconciliationDisplayRow, RunStatus } from "./types";

type TableState = "idle" | "loading" | "error";

type ReconciliationResultsTableProps = {
  rows: ReconciliationDisplayRow[];
  state: TableState;
  errorMessage: string | null;
  statusFilter: RunStatus | "ALL";
  onStatusFilterChange: (value: RunStatus | "ALL") => void;
  onOpenRow: (row: ReconciliationDisplayRow) => void;
  eyebrow?: string;
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyCopy?: string;
  showFilter?: boolean;
  actionLabel?: string;
  onExportReport?: () => void;
};

const FILTERS: Array<{ value: RunStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "AUTO_MATCHED", label: "Auto matched" },
  { value: "LIKELY_MATCHED", label: "Likely matched" },
  { value: "NEEDS_REVIEW", label: "Needs review" },
  { value: "UNMATCHED", label: "Unmatched" },
  { value: "NO_PROOF_RECORD", label: "No proof record" }
];

export function ReconciliationResultsTable({
  rows,
  state,
  errorMessage,
  statusFilter,
  onStatusFilterChange,
  onOpenRow,
  eyebrow = "Case queue",
  title = "Reconciliation results",
  description = "Open a case to inspect evidence comparison, allocation, FX basis, trust level, and audit trail.",
  emptyTitle = "No reconciliation results yet.",
  emptyCopy = "Upload invoices and bank statements first, then upload a payment proof to trigger matching.",
  showFilter = true,
  actionLabel,
  onExportReport
}: ReconciliationResultsTableProps) {
  const visibleRows = statusFilter === "ALL" ? rows : rows.filter((row) => row.status === statusFilter);

  return (
    <section className="results-panel" aria-label="Reconciliation results">
      <div className="results-toolbar">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="results-subcopy">{description}</p>
        </div>
        <div className="results-controls">
          <span className="visible-count num">{visibleRows.length} shown</span>
          {onExportReport && visibleRows.length > 0 ? (
            <button className="secondary-button" type="button" onClick={onExportReport} style={{ marginLeft: "8px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Report
            </button>
          ) : null}
          {showFilter ? (
            <select
              className="status-filter"
              value={statusFilter}
              onChange={(event) => onStatusFilterChange(event.target.value as RunStatus | "ALL")}
              aria-label="Filter by status"
            >
              {FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {state === "loading" ? (
        <div className="table-state loading">
          <span className="spinner" aria-hidden="true" />
          <span className="state-title">Reconciling payment proof…</span>
          <span className="state-copy">Generating candidates, testing FX dates, and scoring matches.</span>
        </div>
      ) : state === "error" ? (
        <div className="table-state">
          <span className="state-title">Reconciliation failed.</span>
          <span className="state-copy">{errorMessage ?? "Try uploading the payment proof again."}</span>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="table-state">
          <span className="state-title">{emptyTitle}</span>
          <span className="state-copy">{emptyCopy}</span>
        </div>
      ) : (
        <>
          <table className="results-table">
            <thead>
              <tr>
                <th>Bank Date</th>
                <th>Bank Ref</th>
                <th>Bank Amount</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Expected</th>
                <th>Rate Source</th>
                <th>Score</th>
                <th>Status</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} onClick={() => onOpenRow(row)}>
                  <td className="num">{row.bankDateLabel}</td>
                  <td className="num">{row.bankRefLabel}</td>
                  <td>
                    {row.receivedAmountLabel}
                    {row.receivedAmountMyr ? <div className="myr-sub">{row.receivedAmountMyr}</div> : null}
                  </td>
                  <td className="num">{row.invoiceLabel}</td>
                  <td className="col-customer">{row.customerLabel}</td>
                  <td className="num">
                    {row.expectedAmountLabel}
                    {row.expectedAmountMyr ? <div className="myr-sub">{row.expectedAmountMyr}</div> : null}
                  </td>
                  <td>{row.fxBasisLabel}</td>
                  <td className="num">{row.scoreLabel}</td>
                  <td>
                    <StatusChip status={row.status} />
                  </td>
                  <td>
                    <button
                      className="row-action"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenRow(row);
                      }}
                    >
                      {actionLabel ?? statusMeta(row.status).actionLabel}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="result-cards">
            {visibleRows.map((row) => (
              <article className="result-card" key={`card-${row.id}`} onClick={() => onOpenRow(row)}>
                <div className="rc-top">
                  <span className="rc-invoice num">{row.bankRefLabel}</span>
                  <StatusChip status={row.status} />
                </div>
                <div className="rc-customer num">{row.bankDateLabel} · {row.receivedAmountLabel}</div>
                <div className="rc-customer">{row.customerLabel}</div>
                <div className="rc-amounts num">
                  Invoice {row.invoiceLabel}
                  <span className="arrow">→</span>
                  Expected {row.expectedAmountLabel}
                </div>
                {row.expectedAmountMyr || row.receivedAmountMyr ? (
                  <div className="rc-amounts-myr myr-sub num">
                    {row.expectedAmountMyr ?? ""}
                    {row.expectedAmountMyr && row.receivedAmountMyr ? <span className="arrow">→</span> : null}
                    {row.receivedAmountMyr ?? ""}
                  </div>
                ) : null}
                <button
                  className="row-action"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenRow(row);
                  }}
                >
                  {actionLabel ?? statusMeta(row.status).actionLabel}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
