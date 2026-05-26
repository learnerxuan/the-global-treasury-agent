"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "../src/components/dashboard/AppHeader";
import { buildDisplayRow } from "../src/components/dashboard/adapter";
import { MetricsStrip, type DashboardMetrics } from "../src/components/dashboard/MetricsStrip";
import { ReconciliationDetailModal } from "../src/components/dashboard/ReconciliationDetailModal";
import { ReconciliationResultsTable } from "../src/components/dashboard/ReconciliationResultsTable";
import { UploadCard } from "../src/components/dashboard/UploadCard";
import type {
  DocumentRole,
  ReconciliationDisplayRow,
  ReconciliationRun,
  RoleApiResult,
  RunStatus,
  UploadKey,
  UploadStatus
} from "../src/components/dashboard/types";

type CardConfig = {
  key: UploadKey;
  role: DocumentRole;
  title: string;
  endpoint: string;
};

const CARDS: CardConfig[] = [
  { key: "invoices", role: "invoice", title: "Invoices", endpoint: "/api/invoices/extractions" },
  { key: "bankStatements", role: "bank_statement", title: "Bank Statements", endpoint: "/api/bank-statements/extractions" },
  { key: "paymentProofs", role: "payment_proof", title: "Payment Proofs", endpoint: "/api/payment-proofs/extractions" }
];

const REVIEW_STATUSES: RunStatus[] = ["LIKELY_MATCHED", "NEEDS_REVIEW", "UNMATCHED"];

type WaitingCounts = { invoices: number; bankTransactions: number; paymentProofs: number };

const EMPTY_WAITING: WaitingCounts = { invoices: 0, bankTransactions: 0, paymentProofs: 0 };

function countEnterpriseSignals(runs: ReconciliationRun[]) {
  return runs.reduce(
    (totals, run) => {
      const result = run.selectedResult;
      if (!result) return totals;
      totals.hardFlags += result.hardReviewFlags?.length ?? 0;
      totals.trustIssues += result.evidenceTrust?.issues.length ?? 0;
      totals.batchMatches += result.candidateKind === "batch_invoices" ? 1 : 0;
      totals.liveFx += result.bestFxScenario?.providerId === "bnm" ? 1 : 0;
      return totals;
    },
    { hardFlags: 0, trustIssues: 0, batchMatches: 0, liveFx: 0 }
  );
}

export default function DashboardPage() {
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
  const [notices, setNotices] = useState<Record<UploadKey, string | null>>({
    invoices: null,
    bankStatements: null,
    paymentProofs: null
  });

  // Persisted state, loaded from disk so a refresh keeps everything visible.
  const [waiting, setWaiting] = useState<WaitingCounts>(EMPTY_WAITING);
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [hydrating, setHydrating] = useState(true);

  const [statusFilter, setStatusFilter] = useState<RunStatus | "ALL">("ALL");
  const [openRow, setOpenRow] = useState<ReconciliationDisplayRow | null>(null);

  const [clearing, setClearing] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { waiting?: WaitingCounts; runs?: ReconciliationRun[] };
      setWaiting(body.waiting ?? EMPTY_WAITING);
      setRuns(body.runs ?? []);
    } catch {
      // Network/disk read failed — leave current state untouched.
    } finally {
      setHydrating(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const rows = useMemo<ReconciliationDisplayRow[]>(() => runs.map(buildDisplayRow), [runs]);

  const metrics = useMemo<DashboardMetrics>(
    () => ({
      openInvoices: waiting.invoices,
      bankTransactions: waiting.bankTransactions,
      autoMatched: runs.filter((run) => run.status === "AUTO_MATCHED").length,
      needsReview: runs.filter((run) => REVIEW_STATUSES.includes(run.status)).length
    }),
    [waiting, runs]
  );

  const latestRun = runs.length > 0 ? runs[0] ?? null : null;
  const enterpriseSignals = useMemo(() => countEnterpriseSignals(runs), [runs]);
  const latestTimeline = latestRun?.reconciliation.timeline.slice(-4).reverse() ?? [];
  const latestQuestion = latestRun?.selectedResult?.reviewPayload?.primaryQuestion;
  const latestPolicy = latestRun?.selectedResult?.policyVersion ?? "Policy ready";

  const storedFor = (key: UploadKey): number => {
    if (key === "invoices") return waiting.invoices;
    if (key === "bankStatements") return waiting.bankTransactions;
    return waiting.paymentProofs;
  };

  const tableState =
    statuses.paymentProofs === "pending"
      ? "loading"
      : statuses.paymentProofs === "error"
        ? "error"
        : hydrating && runs.length === 0
          ? "loading"
          : "idle";

  async function submitUpload(event: FormEvent<HTMLFormElement>, card: CardConfig) {
    event.preventDefault();
    const selected = files[card.key];
    if (selected.length === 0) {
      setStatuses((current) => ({ ...current, [card.key]: "error" }));
      setErrors((current) => ({ ...current, [card.key]: "Select at least one file." }));
      return;
    }

    const formData = new FormData();
    for (const file of selected) {
      formData.append("files", file);
    }

    setStatuses((current) => ({ ...current, [card.key]: "pending" }));
    setErrors((current) => ({ ...current, [card.key]: null }));
    setNotices((current) => ({ ...current, [card.key]: null }));

    try {
      const response = await fetch(card.endpoint, { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) {
        setStatuses((current) => ({ ...current, [card.key]: "error" }));
        setErrors((current) => ({ ...current, [card.key]: body.error ?? "Extraction failed." }));
        return;
      }
      // Keep per-upload diagnostics for /debug, then re-hydrate persisted state.
      try {
        const previous = JSON.parse(sessionStorage.getItem("reconpilot:results") ?? "{}");
        sessionStorage.setItem("reconpilot:results", JSON.stringify({ ...previous, [card.key]: body as RoleApiResult }));
      } catch {
        // sessionStorage optional
      }
      const summary = (body as RoleApiResult).extractionSummary;
      if (summary && summary.failed > 0) {
        setNotices((current) => ({
          ...current,
          [card.key]: `Extracted ${summary.extracted} of ${summary.total} file(s). ${summary.failed} failed (rate limit or unreadable) — re-upload the failed file(s) to retry.`
        }));
      }
      setStatuses((current) => ({ ...current, [card.key]: "done" }));
      setFiles((current) => ({ ...current, [card.key]: [] }));
      await loadDashboard();
    } catch (error) {
      setStatuses((current) => ({ ...current, [card.key]: "error" }));
      setErrors((current) => ({
        ...current,
        [card.key]: error instanceof Error ? error.message : "Network error during extraction."
      }));
    }
  }

  async function clearDemoData() {
    setClearing(true);
    setResetMessage(null);
    setResetError(false);
    try {
      const response = await fetch("/api/dev/clear-runtime", { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        setResetError(true);
        setResetMessage(body.error ?? "Unable to clear demo data.");
        return;
      }
      setFiles({ invoices: [], bankStatements: [], paymentProofs: [] });
      setStatuses({ invoices: "ready", bankStatements: "ready", paymentProofs: "ready" });
      setErrors({ invoices: null, bankStatements: null, paymentProofs: null });
      setNotices({ invoices: null, bankStatements: null, paymentProofs: null });
      setWaiting(EMPTY_WAITING);
      setRuns([]);
      setOpenRow(null);
      try {
        sessionStorage.removeItem("reconpilot:results");
      } catch {
        // ignore
      }
      setResetMessage("Demo data cleared.");
    } catch (error) {
      setResetError(true);
      setResetMessage(error instanceof Error ? error.message : "Unable to clear demo data.");
    } finally {
      setClearing(false);
    }
  }

  async function rescan() {
    setRescanning(true);
    setResetMessage(null);
    setResetError(false);
    try {
      const response = await fetch("/api/reconciliation/rescan", { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        setResetError(true);
        setResetMessage(body.error ?? "Unable to re-run reconciliation.");
        return;
      }
      await loadDashboard();
      setResetMessage(`Re-ran reconciliation for ${body.count} proof(s).`);
    } catch (error) {
      setResetError(true);
      setResetMessage(error instanceof Error ? error.message : "Unable to re-run reconciliation.");
    } finally {
      setRescanning(false);
    }
  }

  return (
    <main className="shell">
      <AppHeader
        onClearDemo={clearDemoData}
        clearing={clearing}
        resetMessage={resetMessage}
        resetError={resetError}
        onRescan={rescan}
        rescanning={rescanning}
      />

      <section className="ops-hero" aria-label="Enterprise reconciliation status">
        <div className="ops-copy">
          <span className="ops-kicker">Enterprise agent workspace</span>
          <h2>Reconcile cross-border cash with evidence, FX reasoning, and audit gates in one view.</h2>
          <p>
            Upload source documents, let the extraction and reconciliation agents build candidate matches, then resolve
            only the cases blocked by policy, trust, or money-math risk.
          </p>
        </div>
        <div className="ops-grid" aria-label="Enterprise safeguards">
          <div className="ops-stat">
            <span>Policy</span>
            <strong>{latestPolicy}</strong>
          </div>
          <div className="ops-stat">
            <span>Batch matches</span>
            <strong className="num">{enterpriseSignals.batchMatches}</strong>
          </div>
          <div className="ops-stat">
            <span>BNM FX cases</span>
            <strong className="num">{enterpriseSignals.liveFx}</strong>
          </div>
          <div className="ops-stat warn">
            <span>Review blockers</span>
            <strong className="num">{enterpriseSignals.hardFlags + enterpriseSignals.trustIssues}</strong>
          </div>
        </div>
      </section>

      <section className="workspace-grid" aria-label="Reconciliation workspace">
        <div className="workspace-main">
          <div className="section-title">
            <div>
              <p className="eyebrow">Evidence intake</p>
              <h2>Upload source documents</h2>
            </div>
            <span className="hint">Invoices, bank rows, and payment proofs stay in the persisted waiting queue.</span>
          </div>

          <section className="upload-strip" aria-label="Upload evidence">
            {CARDS.map((card) => (
              <UploadCard
                key={card.key}
                role={card.role}
                title={card.title}
                files={files[card.key]}
                status={statuses[card.key]}
                error={errors[card.key]}
                notice={notices[card.key]}
                storedWaiting={storedFor(card.key)}
                latestRun={card.key === "paymentProofs" ? latestRun : null}
                onFilesSelected={(selected) => setFiles((current) => ({ ...current, [card.key]: selected }))}
                onSubmit={(event) => submitUpload(event, card)}
              />
            ))}
          </section>

          <MetricsStrip metrics={metrics} />

          <ReconciliationResultsTable
            rows={rows}
            state={tableState}
            errorMessage={errors.paymentProofs}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onOpenRow={setOpenRow}
          />
        </div>

        <aside className="agent-rail" aria-label="Agent activity and review context">
          <div className="rail-card rail-card-primary">
            <span className="eyebrow">Review command</span>
            <h3>{latestQuestion ?? "No active blocker"}</h3>
            <p>
              {latestRun
                ? latestRun.nextAction
                : "Run a payment proof after loading invoices and bank statements to populate the human review queue."}
            </p>
          </div>

          <div className="rail-card">
            <div className="rail-head">
              <span className="eyebrow">Agent timeline</span>
              <span className="num">{latestTimeline.length} events</span>
            </div>
            {latestTimeline.length > 0 ? (
              <div className="rail-timeline">
                {latestTimeline.map((event) => (
                  <div className="rail-event" key={`${event.step}-${event.timestamp}`}>
                    <span className="rail-dot" aria-hidden="true" />
                    <div>
                      <strong>{event.actor}</strong>
                      <span>{event.action}</span>
                      {event.resultSummary ? <p>{event.resultSummary}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rail-empty">Agent activity appears here while extraction, FX checks, and scoring run.</p>
            )}
          </div>

          <div className="rail-card compact">
            <span className="eyebrow">Guide coverage</span>
            <div className="coverage-list">
              <span>Safety gates</span>
              <span>FX provider trace</span>
              <span>Allocation ledger</span>
              <span>Evidence trust</span>
              <span>Audit payload</span>
            </div>
          </div>
        </aside>
      </section>

      {openRow ? <ReconciliationDetailModal row={openRow} onClose={() => setOpenRow(null)} /> : null}
    </main>
  );
}
