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
  onOpenRow
}: ReconciliationResultsTableProps) {
  const visibleRows = statusFilter === "ALL" ? rows : rows.filter((row) => row.status === statusFilter);

  return (
    <section className="results-panel" aria-label="Reconciliation results">
      <div className="results-toolbar">
        <h2>Reconciliation Results</h2>
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
          <span className="state-title">No reconciliation results yet.</span>
          <span className="state-copy">
            Upload invoices and bank statements first, then upload a payment proof to trigger matching.
          </span>
        </div>
      ) : (
        <>
          <table className="results-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Expected</th>
                <th>Received</th>
                <th>FX basis</th>
                <th>Score</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} onClick={() => onOpenRow(row)}>
                  <td>
                    <StatusChip status={row.status} />
                  </td>
                  <td className="num">{row.invoiceLabel}</td>
                  <td className="col-customer">{row.customerLabel}</td>
                  <td className="num">{row.expectedAmountLabel}</td>
                  <td className="num">{row.receivedAmountLabel}</td>
                  <td>{row.fxBasisLabel}</td>
                  <td className="num">{row.scoreLabel}</td>
                  <td>
                    <button
                      className="row-action"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenRow(row);
                      }}
                    >
                      {statusMeta(row.status).actionLabel}
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
                  <span className="rc-invoice num">{row.invoiceLabel}</span>
                  <StatusChip status={row.status} />
                </div>
                <div className="rc-customer">{row.customerLabel}</div>
                <div className="rc-amounts num">
                  {row.expectedAmountLabel}
                  <span className="arrow">→</span>
                  {row.receivedAmountLabel}
                </div>
                <button
                  className="row-action"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenRow(row);
                  }}
                >
                  {statusMeta(row.status).actionLabel}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
