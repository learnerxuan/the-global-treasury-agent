import { useEffect, useState } from "react";
import {
  findBank,
  findInvoice,
  findProof,
  formatClockTime,
  formatMoney,
  formatPercent,
  fxBasisLabel,
  fxSourceLabel,
  receivedAmount,
  statusMeta,
  timelineActorMeta
} from "./adapter";
import { StatusChip } from "./StatusChip";
import type { ReconciliationDisplayRow, RunStatus } from "./types";

type Tab = "overview" | "evidence" | "fx" | "timeline" | "artifacts";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "evidence", label: "Evidence" },
  { key: "fx", label: "FX Reasoning" },
  { key: "timeline", label: "Agent Timeline" },
  { key: "artifacts", label: "Artifacts" }
];

const REASON_COPY: Record<RunStatus, string> = {
  AUTO_MATCHED: "Evidence aligns and the money math is explainable. No human action required.",
  LIKELY_MATCHED: "Strong evidence, but approval is recommended before moving records to completed.",
  NEEDS_REVIEW: "Evidence is conflicting, incomplete, or financially risky.",
  UNMATCHED: "No reliable invoice and bank candidate was found.",
  NO_PROOF_RECORD: "No payment proof record was available to reconcile."
};

const ACTIONS: Record<RunStatus, string[]> = {
  AUTO_MATCHED: ["View Report"],
  LIKELY_MATCHED: ["Approve Match", "Reject", "Request More Info"],
  NEEDS_REVIEW: ["Approve with Note", "Reject Match", "Request More Proof"],
  UNMATCHED: ["Mark as Unresolved", "Upload Missing Evidence", "Create Discrepancy Note"],
  NO_PROOF_RECORD: ["Upload Missing Evidence"]
};

function formatCode(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((part) => (part.length > 0 ? `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}` : part))
    .join(" ");
}

export function ReconciliationDetailModal({
  row,
  onClose
}: {
  row: ReconciliationDisplayRow;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [actionConfirm, setActionConfirm] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { run } = row;
  const selected = run.selectedResult;
  const invoice = findInvoice(run);
  const proof = findProof(run);
  const bank = findBank(run);
  const meta = statusMeta(run.status);

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Reconciliation case ${row.invoiceLabel}`}>
        <div className="modal-header">
          <div>
            <div className="mh-id num">{row.invoiceLabel}</div>
            <div className="mh-meta">
              <StatusChip status={run.status} />
              <span className="mh-score num">Score {row.scoreLabel}</span>
            </div>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-tabs">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={`modal-tab ${tab === entry.key ? "active" : ""}`}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === "overview" ? (
            <>
              <div className="field-block">
                <div className="fb-label">Decision</div>
                <div className="fb-value decision-line">
                  <StatusChip status={run.status} />
                </div>
              </div>
              <div className="field-block">
                <div className="fb-label">Reason</div>
                <div className="fb-value">{selected?.explanation ?? run.summary ?? REASON_COPY[run.status]}</div>
              </div>
              <div className="field-block">
                <div className="fb-label">Next action</div>
                <div className="fb-value">{run.nextAction}</div>
              </div>
            </>
          ) : null}

          {tab === "evidence" ? (
            <>
              <div className="evidence-grid">
                <div className="evidence-col">
                  <h4>Invoice</h4>
                  {invoice ? (
                    <dl>
                      <div>
                        <dt>Invoice</dt>
                        <dd className="num">{invoice.invoiceNumber}</dd>
                      </div>
                      <div>
                        <dt>Customer</dt>
                        <dd>{invoice.debtor.name ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Amount due</dt>
                        <dd className="num">{formatMoney(invoice.amountDue)}</dd>
                      </div>
                      <div>
                        <dt>Issue date</dt>
                        <dd className="num">{invoice.issueDate ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Reference</dt>
                        <dd className="num">{invoice.paymentReference.raw ?? "—"}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="evidence-empty">No matched invoice.</p>
                  )}
                </div>

                <div className="evidence-col">
                  <h4>Payment Proof</h4>
                  {proof ? (
                    <dl>
                      <div>
                        <dt>Payer</dt>
                        <dd>{proof.financialPayload.debtor.name ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Paid amount</dt>
                        <dd className="num">{formatMoney(proof.financialPayload.paidAmount)}</dd>
                      </div>
                      <div>
                        <dt>Payment date</dt>
                        <dd className="num">{proof.financialPayload.paymentDate ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Reference</dt>
                        <dd className="num">{proof.financialPayload.reference.raw ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{proof.financialPayload.paymentStatusLabel ?? proof.financialPayload.paymentStatus}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="evidence-empty">No matched payment proof.</p>
                  )}
                </div>

                <div className="evidence-col">
                  <h4>Bank Statement Row</h4>
                  {bank ? (
                    <dl>
                      <div>
                        <dt>Description</dt>
                        <dd>{bank.description ?? bank.rawDescription ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Amount</dt>
                        <dd className="num">{formatMoney(bank.netCreditAmount ?? bank.amount)}</dd>
                      </div>
                      <div>
                        <dt>Booking date</dt>
                        <dd className="num">{bank.bookingDate ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Reference</dt>
                        <dd className="num">{bank.referenceNo ?? bank.normalizedReference ?? "—"}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="evidence-empty">No matched bank transaction.</p>
                  )}
                </div>
              </div>

              <div className="signals">
                <h4>Match signals</h4>
                {invoice && (proof || bank) ? (
                  <>
                    <div className="signal-row">
                      <span className="sr-name">Reference</span>
                      <span className="sr-value num">
                        {invoice.paymentReference.normalized ?? "—"}
                        {" vs "}
                        {proof?.financialPayload.reference.normalized ?? bank?.normalizedReference ?? "—"}
                      </span>
                    </div>
                    <div className="signal-row">
                      <span className="sr-name">Name</span>
                      <span className="sr-value">
                        {invoice.debtor.normalizedName ?? invoice.debtor.name ?? "—"}
                        {" vs "}
                        {proof?.financialPayload.debtor.normalizedName ??
                          bank?.debtorNormalizedName ??
                          bank?.debtorName ??
                          "—"}
                      </span>
                    </div>
                    <div className="signal-row">
                      <span className="sr-name">Amount</span>
                      <span className="sr-value num">
                        {formatMoney(invoice.amountDue)}
                        {" expected vs "}
                        {formatMoney(receivedAmount(run))}
                        {" received"}
                      </span>
                    </div>
                    <div className="signal-row">
                      <span className="sr-name">Date</span>
                      <span className="sr-value num">
                        {proof?.financialPayload.paymentDate ?? "—"}
                        {" vs "}
                        {bank?.bookingDate ?? "—"}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="evidence-empty">Not enough matched records to compare signals.</p>
                )}
              </div>
            </>
          ) : null}

          {tab === "fx" ? (
            <>
              {selected?.bestFxScenario ? (
                <>
                  <div className="fx-scenario selected">
                    <div className="fx-head">
                      <span className="fx-basis">{fxBasisLabel(selected.bestFxScenario.basis)}</span>
                      <span className="chip success">Selected</span>
                    </div>
                    <dl className="fx-grid">
                      <div>
                        <dt>Rate</dt>
                        <dd className="num">{selected.bestFxScenario.rate}</dd>
                      </div>
                      <div>
                        <dt>Rate date</dt>
                        <dd className="num">{selected.bestFxScenario.rateDate ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Expected local</dt>
                        <dd className="num">{formatMoney(selected.bestFxScenario.expectedLocalAmount)}</dd>
                      </div>
                      <div>
                        <dt>Foreign amount</dt>
                        <dd className="num">{formatMoney(selected.bestFxScenario.foreignAmount)}</dd>
                      </div>
                      <div>
                        <dt>Residual</dt>
                        <dd className="num">{selected.bestFxScenario.residualAmount}</dd>
                      </div>
                      <div>
                        <dt>Residual %</dt>
                        <dd className="num">{formatPercent(selected.bestFxScenario.residualPercent)}</dd>
                      </div>
                    </dl>
                    <p className="fx-source">{fxSourceLabel(selected.bestFxScenario.rateSource)}</p>
                  </div>
                  <div className="fx-note">
                    Selected basis: {fxBasisLabel(selected.bestFxScenario.basis)} produced the lowest residual
                    {selected.residual ? ` (band: ${formatCode(selected.residual.band)})` : ""}.
                  </div>
                </>
              ) : (
                <p className="evidence-empty">
                  No usable FX scenario was found for this case. The bank credit could not be explained by a fixture FX
                  rate within tolerance.
                </p>
              )}
            </>
          ) : null}

          {tab === "timeline" ? (
            <div className="timeline">
              {run.reconciliation.timeline.length === 0 ? (
                <p className="evidence-empty">No agent timeline was recorded for this run.</p>
              ) : (
                run.reconciliation.timeline.map((event) => {
                  const actor = timelineActorMeta(event.actor);
                  return (
                    <div className="timeline-item" key={event.step}>
                      <span className="ti-time">{formatClockTime(event.timestamp)}</span>
                      <div>
                        <span className={`ti-actor ${actor.kind}`}>{actor.label}</span>
                        <div>
                          <span className="ti-action">{event.action}</span>
                          {event.toolName ? <span className="ti-tool num">{event.toolName}</span> : null}
                        </div>
                        {event.resultSummary ? <div className="ti-result">{event.resultSummary}</div> : null}
                        {event.reasoning ? <div className="ti-reason">{event.reasoning}</div> : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : null}

          {tab === "artifacts" ? (
            <>
              {run.outputPaths.reconciliationReportPath ? (
                <div className="artifact-card">
                  <div className="ac-head">
                    <h4>Reconciliation Report</h4>
                    <span className="chip success">Generated</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Matched invoice</dt>
                      <dd className="num">{selected?.expectedPaymentId ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Matched bank transaction</dt>
                      <dd className="num">{selected?.bankTransactionId ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Matched payment proof</dt>
                      <dd className="num">{selected?.proofId ?? run.proofId ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}

              {run.outputPaths.discrepancySummaryPath ? (
                <div className="artifact-card">
                  <div className="ac-head">
                    <h4>Discrepancy Summary</h4>
                    <span className="chip review">Generated</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Main issue</dt>
                      <dd>
                        {selected?.hardReviewFlags?.[0]
                          ? formatCode(selected.hardReviewFlags[0])
                          : selected?.reasonCodes?.[0]
                            ? formatCode(selected.reasonCodes[0])
                            : "No reliable candidate found"}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}

              {run.outputPaths.mockNotificationPath ? (
                <div className="artifact-card">
                  <div className="ac-head">
                    <h4>Notification</h4>
                    <span className="chip review">Generated</span>
                  </div>
                  <div className="preview">
                    {run.summary}
                    <br />
                    Recommended next action: {run.nextAction}
                  </div>
                </div>
              ) : null}

              {!run.outputPaths.reconciliationReportPath &&
              !run.outputPaths.discrepancySummaryPath &&
              !run.outputPaths.mockNotificationPath ? (
                <p className="evidence-empty">No artifacts were generated for this run.</p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="modal-foot">
          {actionConfirm ? (
            <span className="action-confirm">{actionConfirm}</span>
          ) : (
            ACTIONS[run.status].map((label) => (
              <button
                key={label}
                type="button"
                className={label === "View Report" || label.startsWith("Approve") ? "primary-button" : "secondary-button"}
                onClick={() => setActionConfirm(`${label} — recorded for ${row.invoiceLabel}.`)}
              >
                {label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
