"use client";

import { useMemo, useState } from "react";
import { buildDisplayRow } from "../../../src/components/dashboard/adapter";
import { useDashboard } from "../../../src/components/dashboard/DashboardContext";
import { ReconciliationDetailModal } from "../../../src/components/dashboard/ReconciliationDetailModal";
import { ReconciliationResultsTable } from "../../../src/components/dashboard/ReconciliationResultsTable";
import type { ReconciliationDisplayRow } from "../../../src/components/dashboard/types";

export default function RejectedPage() {
  const { rejectedRuns, loadDashboard } = useDashboard();
  const [openCase, setOpenCase] = useState<{ row: ReconciliationDisplayRow; readOnly: boolean } | null>(null);

  const rejectedRows = useMemo<ReconciliationDisplayRow[]>(() => rejectedRuns.map(buildDisplayRow), [rejectedRuns]);

  return (
    <div className="workspace-grid">
      <section className="workspace-main" aria-label="Rejected cases workspace">
        <ReconciliationResultsTable
          rows={rejectedRows}
          state="idle"
          errorMessage={null}
          statusFilter="ALL"
          onStatusFilterChange={() => undefined}
          onOpenRow={(row) => setOpenCase({ row, readOnly: true })}
          eyebrow="Quarantine"
          title="Rejected Cases"
          description="These reconciliations were manually rejected. They are isolated from the waiting queue and will not be re-scanned."
          emptyTitle="No rejected cases yet."
          emptyCopy="Items that are manually rejected during review will appear here."
          showFilter={false}
          actionLabel="View"
        />
      </section>

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
