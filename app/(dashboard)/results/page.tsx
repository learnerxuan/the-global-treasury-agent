"use client";

import { useEffect, useMemo, useState } from "react";
import { buildDisplayRow } from "../../../src/components/dashboard/adapter";
import { AgentRail } from "../../../src/components/dashboard/AgentRail";
import { useDashboard } from "../../../src/components/dashboard/DashboardContext";
import { MetricsStrip, type DashboardMetrics } from "../../../src/components/dashboard/MetricsStrip";
import { ReconciliationDetailModal } from "../../../src/components/dashboard/ReconciliationDetailModal";
import { ReconciliationResultsTable } from "../../../src/components/dashboard/ReconciliationResultsTable";
import type { ReconciliationDisplayRow, ReconciliationRun, RunStatus } from "../../../src/components/dashboard/types";

const REVIEW_STATUSES: RunStatus[] = ["LIKELY_MATCHED", "NEEDS_REVIEW", "UNMATCHED"];

export default function ResultsPage() {
  const { waiting, runs, completedRuns, statuses, errors, hydrating, loadDashboard, rescanning } = useDashboard();
  const [statusFilter, setStatusFilter] = useState<RunStatus | "ALL">("ALL");
  const [openCase, setOpenCase] = useState<{ row: ReconciliationDisplayRow; readOnly: boolean } | null>(null);

  const rows = useMemo<ReconciliationDisplayRow[]>(() => runs.map(buildDisplayRow), [runs]);
  const completedRows = useMemo<ReconciliationDisplayRow[]>(() => completedRuns.map(buildDisplayRow), [completedRuns]);
  const metrics = useMemo<DashboardMetrics>(
    () => ({
      openInvoices: waiting.invoices,
      bankTransactions: waiting.bankTransactions,
      autoMatched: completedRuns.length,
      needsReview: runs.filter((run) => REVIEW_STATUSES.includes(run.status)).length
    }),
    [waiting, runs, completedRuns]
  );

  const latestRun = runs[0] ?? null;
  const tableState =
    statuses.paymentProofs === "pending"
      ? "loading"
      : statuses.paymentProofs === "error"
        ? "error"
        : hydrating && runs.length === 0
          ? "loading"
          : "idle";

  useEffect(() => {
    if (
      openCase &&
      !runs.some((run) => run.runId === openCase.row.id) &&
      !completedRuns.some((run) => run.runId === openCase.row.id)
    ) {
      setOpenCase(null);
    }
  }, [openCase, runs, completedRuns]);

  const handleExportCsv = () => {
    if (completedRows.length === 0) return;
    const headers = [
      "Status",
      "Bank Date",
      "Bank Reference",
      "Customer",
      "Invoice",
      "Expected Amount",
      "Bank Amount",
      "FX Basis",
      "Score",
      "Notes"
    ].join(",");

    const csvRows = completedRows.map(row => {
      const escapeField = (field: string | null | undefined) => `"${(field ?? "").replace(/"/g, '""')}"`;
      const expectedAmount = row.expectedAmountMyr 
        ? `${row.expectedAmountLabel} (${row.expectedAmountMyr})`
        : row.expectedAmountLabel;
      const bankAmount = row.receivedAmountMyr
        ? `${row.receivedAmountLabel} (${row.receivedAmountMyr})`
        : row.receivedAmountLabel;

      return [
        escapeField(row.status),
        escapeField(row.bankDateLabel),
        escapeField(row.bankRefLabel),
        escapeField(row.customerLabel),
        escapeField(row.invoiceLabel),
        escapeField(expectedAmount),
        escapeField(bankAmount),
        escapeField(row.fxBasisLabel),
        escapeField(row.scoreLabel),
        escapeField(row.summary)
      ].join(",");
    });

    const blob = new Blob([headers + "\n" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `recon-report-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="workspace-grid">
      <section className="workspace-main" aria-label="Reconciliation results workspace">
        <MetricsStrip metrics={metrics} />

        <ReconciliationResultsTable
          rows={rows}
          state={tableState}
          errorMessage={errors.paymentProofs}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onOpenRow={(row) => setOpenCase({ row, readOnly: false })}
        />

        <ReconciliationResultsTable
          rows={completedRows}
          state="idle"
          errorMessage={null}
          statusFilter="ALL"
          onStatusFilterChange={() => undefined}
          onOpenRow={(row) => setOpenCase({ row, readOnly: true })}
          eyebrow="Archive"
          title="Completed Reconciliations"
          description="Finalized matches stay here for review and are excluded from future reconciliation reruns."
          emptyTitle="No completed reconciliations yet."
          emptyCopy="Auto-matched and approved cases appear here after their records move out of the waiting queue."
          showFilter={false}
          actionLabel="View"
          onExportReport={handleExportCsv}
        />
      </section>

      <AgentRail runs={runs} selectedRow={openCase?.row ?? null} latestRun={latestRun} isProcessing={statuses.paymentProofs === "pending" || rescanning} />

      {openCase ? (
        <ReconciliationDetailModal
          row={openCase.row}
          readOnly={openCase.readOnly}
          onActionComplete={loadDashboard}
          onClose={() => setOpenCase(null)}
        />
      ) : null}
    </div>
  );
}
