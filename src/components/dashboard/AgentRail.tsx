import type { HardReviewFlag, ReasonCode } from "../../lib/recon/reconciliation/types";
import type { AgentTimelineEvent, ReconciliationDisplayRow, ReconciliationRun } from "./types";

type AgentRailProps = {
  runs: ReconciliationRun[];
  selectedRow: ReconciliationDisplayRow | null;
  latestRun: ReconciliationRun | null;
  isProcessing?: boolean;
};

export type AgentRailViewModel = {
  mode: "aggregate" | "detail";
  reviewTitle: string;
  reviewCopy: string;
  timeline: AgentTimelineEvent[];
  timelineCountLabel: string;
  checks: string[];
  riskIndicators: string[];
};

const AGGREGATE_CHECKS = [
  "Policy Validation",
  "Exchange Rate Verification",
  "Document Analysis",
  "Allocation Review",
  "Audit Trail"
];

const HARD_FLAG_LABELS: Record<HardReviewFlag, string> = {
  LOW_CONFIDENCE_CRITICAL_FIELD: "Low-confidence critical field",
  COMPETING_CANDIDATES_CLOSE: "Competing matches need review",
  MISSING_REFERENCE_WEAK_NAME: "Missing reference with weak name match",
  PARTIAL_REFERENCE_WEAK_EVIDENCE: "Partial reference with weak evidence",
  PROOF_NOT_SETTLED: "Payment proof is not settled",
  POSSIBLE_PARTIAL_PAYMENT: "Possible partial payment",
  POSSIBLE_OVERPAYMENT: "Possible overpayment",
  POSSIBLE_BATCH_PAYMENT: "Possible batch payment",
  DUPLICATE_PROOF_TX_ID: "Duplicate payment proof transaction ID",
  DUPLICATE_BANK_TRANSACTION: "Duplicate bank transaction",
  POSSIBLE_REVERSAL: "Possible reversal",
  RESIDUAL_ABOVE_THRESHOLD: "Amount variance above review threshold",
  UNEXPLAINED_RESIDUAL_ABOVE_CAP: "Unexplained variance above cap",
  FIXTURE_FALLBACK_ONLY: "Fallback-only exchange rate",
  NO_FX_SCENARIO: "No usable exchange rate scenario"
};

const CHECK_LABELS: Partial<Record<ReasonCode, string>> = {
  EXACT_REFERENCE_MATCH: "Exact reference match",
  STRUCTURED_REFERENCE_MATCH: "Structured reference match",
  PARTIAL_REFERENCE_MATCH: "Reference match reviewed",
  WEAK_PARTIAL_REFERENCE_MATCH: "Weak reference match reviewed",
  NO_REFERENCE: "Missing reference reviewed",
  AMOUNT_WITHIN_TOLERANCE: "Amount tolerance check",
  AMOUNT_SMALL_VARIANCE: "Small amount variance check",
  AMOUNT_SIGNIFICANT_VARIANCE: "Significant amount variance check",
  FX_EXPLAINS_AMOUNT: "Live FX verification",
  FX_VARIANCE_EXPLAINS_RESIDUAL: "FX variance review",
  FLAT_FEE_EXPLAINS_RESIDUAL: "Bank fee review",
  DATE_CLOSE: "Payment date check",
  DATE_FAR: "Date gap review",
  NAME_MATCH: "Counterparty name check",
  NAME_SIMILAR: "Similar name review",
  NAME_MISMATCH: "Name mismatch review",
  HIGH_EXTRACTION_CONFIDENCE: "Document confidence check",
  LOW_EXTRACTION_CONFIDENCE: "Low-confidence document review",
  COMPETING_CANDIDATES: "Competing match review",
  NO_CANDIDATE: "No-match investigation"
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function selectedResultIds(run: ReconciliationRun) {
  const result = run.selectedResult;
  return new Set(
    [
      result?.caseId,
      result?.selectedCandidateId,
      result?.bankTransactionId,
      result?.proofId,
      run.proofId,
      result?.expectedPaymentId,
      ...(result?.expectedPaymentIds ?? [])
    ].filter(Boolean)
  );
}

function timelineForRun(run: ReconciliationRun) {
  const ids = selectedResultIds(run);
  const filtered = run.reconciliation.timeline.filter((event) => {
    const relatedIds = event.relatedIds;
    if (!relatedIds) return false;
    return Object.values(relatedIds).some((id) => id && ids.has(id));
  });

  return filtered.length > 0 ? filtered : run.reconciliation.timeline;
}

function countRiskIndicators(runs: ReconciliationRun[]) {
  return runs.reduce(
    (totals, run) => {
      const result = run.selectedResult;
      if (!result) return totals;
      totals.criticalWarnings += result.hardReviewFlags?.length ?? 0;
      totals.documentDiscrepancies += result.evidenceTrust?.issues.length ?? 0;
      totals.batchPayments += result.candidateKind === "batch_invoices" ? 1 : 0;
      totals.liveFxChecks +=
        result.bestFxScenario?.providerId && result.bestFxScenario.providerId !== "fixture" ? 1 : 0;
      return totals;
    },
    { criticalWarnings: 0, documentDiscrepancies: 0, batchPayments: 0, liveFxChecks: 0 }
  );
}

function aggregateRisks(runs: ReconciliationRun[], latestRun: ReconciliationRun | null) {
  const totals = countRiskIndicators(runs);
  const policy = latestRun?.selectedResult?.policyVersion ?? "Policy ready";

  return [
    pluralize(totals.criticalWarnings, "Critical Warning"),
    pluralize(totals.documentDiscrepancies, "Document Discrepancy", "Document Discrepancies"),
    pluralize(totals.batchPayments, "batch payment"),
    pluralize(totals.liveFxChecks, "live FX check"),
    policy
  ];
}

function detailChecks(run: ReconciliationRun) {
  const result = run.selectedResult;
  if (!result) return ["Case record review"];

  const checks = new Set<string>();
  result.reasonCodes.forEach((code) => {
    const label = CHECK_LABELS[code];
    if (label) checks.add(label);
  });

  if (result.bestFxScenario) checks.add(result.bestFxScenario.providerId ? "Live FX verification" : "Exchange rate review");
  if (result.evidenceTrust) checks.add("Document analysis");
  if (result.allocations?.length) checks.add("Allocation review");
  if (result.auditTrail) checks.add("Audit trail");

  return checks.size > 0 ? Array.from(checks) : ["Case record review"];
}

function detailRisks(run: ReconciliationRun) {
  const result = run.selectedResult;
  if (!result) return ["No selected reconciliation result for this transaction."];

  const risks = [
    ...result.hardReviewFlags.map((flag) => `Critical Warning: ${HARD_FLAG_LABELS[flag] ?? flag}`),
    ...(result.evidenceTrust?.issues ?? []).map((issue) => `Document Discrepancy: ${issue.message}`)
  ];

  if (result.bestFxScenario?.isFallback) risks.push("Exchange Rate Warning: fallback rate was used.");
  if (result.residual?.exceedsHardReviewThreshold) {
    risks.push(`Amount Variance: residual ${result.residual.residualAmount ?? "exceeds threshold"}.`);
  }

  return risks.length > 0 ? risks : ["No risk indicators found for this transaction."];
}

export function buildAgentRailViewModel({ runs, selectedRow, latestRun, isProcessing }: AgentRailProps): AgentRailViewModel {
  const selectedRun = selectedRow ? runs.find((run) => run.runId === selectedRow.id) ?? selectedRow.run : null;

  if (selectedRun) {
    const result = selectedRun.selectedResult;
    const timeline = timelineForRun(selectedRun);
    return {
      mode: "detail",
      reviewTitle: result?.reviewPayload?.primaryQuestion ?? "Review this transaction",
      reviewCopy: selectedRun.nextAction,
      timeline,
      timelineCountLabel: pluralize(timeline.length, "event"),
      checks: detailChecks(selectedRun),
      riskIndicators: detailRisks(selectedRun)
    };
  }

  let latestTimeline = latestRun ? [...latestRun.reconciliation.timeline].reverse() : [];
  if (isProcessing) {
    latestTimeline = [
      { step: "processing" as unknown as number, timestamp: Date.now(), action: "Reconciling evidence...", actor: "ReconAgent", resultSummary: "Extracting and analyzing..." } as unknown as AgentTimelineEvent,
      ...latestTimeline
    ];
  }
  
  return {
    mode: "aggregate",
    reviewTitle: latestRun ? (isProcessing ? "Reconciling..." : "Ready for review") : (isProcessing ? "Processing..." : "No active blocker"),
    reviewCopy: isProcessing ? "Agent is actively processing documents and executing the matching engine." : (latestRun
      ? latestRun.nextAction
      : "Run a payment proof after loading invoices and bank statements to populate the human review queue."),
    timeline: latestTimeline,
    timelineCountLabel: isProcessing ? "live rolling" : pluralize(latestTimeline.length, "event"),
    checks: AGGREGATE_CHECKS,
    riskIndicators: aggregateRisks(runs, latestRun)
  };
}

export function AgentRail(props: AgentRailProps) {
  const view = buildAgentRailViewModel(props);

  return (
    <aside className="agent-rail" aria-label="Agent activity and review context">
      <div className="rail-card rail-card-primary">
        <span className="eyebrow">Review command</span>
        <h3>{view.reviewTitle}</h3>
        <p>{view.reviewCopy}</p>
      </div>

      <div className="rail-card">
        <div className="rail-head">
          <span className="eyebrow">Agent timeline</span>
          <span className="num">{view.timelineCountLabel}</span>
        </div>
        {view.timeline.length > 0 ? (
          <div className="rail-timeline scrollable">
            {view.timeline.map((event) => (
              <div className="rail-event" key={`${event.step}-${event.timestamp}`}>
                <span className={`rail-dot ${(event.step as unknown as string) === "processing" ? "pulsing" : ""}`} aria-hidden="true" />
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
        <span className="eyebrow">Checks Performed</span>
        <div className="coverage-list">
          {view.checks.map((check) => (
            <span key={check}>{check}</span>
          ))}
        </div>
      </div>

      <div className="rail-card compact">
        <span className="eyebrow">Risk Indicators</span>
        <div className="coverage-list">
          {view.riskIndicators.map((risk) => (
            <span key={risk}>{risk}</span>
          ))}
        </div>
      </div>
    </aside>
  );
}
