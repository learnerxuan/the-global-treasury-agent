import { useEffect, useState } from "react";
import {
  allocationReasonLabel,
  candidateKindLabel,
  evidenceTrustMeta,
  findBank,
  findInvoice,
  findProof,
  formatClockTime,
  formatMoney,
  formatPercent,
  fxBasisLabel,
  fxProviderLabel,
  fxSourceKindLabel,
  fxSourceLabel,
  myrEquivalent,
  receivedAmount,
  statusMeta,
  timelineActorMeta
} from "./adapter";
import { StatusChip } from "./StatusChip";
import type { ReconciliationDisplayRow, RunStatus } from "./types";
import type { EvidenceTrustLevel } from "../../lib/recon/reconciliation/types";

type Tab = "overview" | "evidence" | "fx" | "timeline" | "trust" | "artifacts";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "evidence", label: "Evidence" },
  { key: "fx", label: "FX Reasoning" },
  { key: "timeline", label: "Agent Timeline" },
  { key: "trust", label: "Trust & Audit" },
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

// Trust level shown as a 4-rung ladder from least to most trustworthy.
const TRUST_LADDER: Array<{ level: EvidenceTrustLevel; label: string }> = [
  { level: "missing_proof", label: "Missing" },
  { level: "weak_ai", label: "Weak AI" },
  { level: "supported_ai", label: "AI-supported" },
  { level: "deterministic", label: "Deterministic" }
];

const TRUST_BLURB: Record<EvidenceTrustLevel, string> = {
  deterministic: "Fields were parsed deterministically (CSV / spreadsheet / manual) — the highest-trust source.",
  supported_ai: "AI-extracted, with every critical field above the confidence floor.",
  weak_ai: "AI-extracted, but one or more critical fields fell below the confidence floor.",
  missing_proof: "No payment-proof evidence was available to support this match."
};

function trustRank(level: EvidenceTrustLevel): number {
  return Math.max(0, TRUST_LADDER.findIndex((step) => step.level === level));
}

// "financialPayload.paidAmount.value" -> "Paid Amount Value"; "aiMetadata.overallConfidence" -> "Overall Confidence".
function prettyField(field: string): string {
  return field
    .split(".")
    .filter((seg) => seg !== "financialPayload" && seg !== "aiMetadata")
    .join(" ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function routeLabel(route: string | null): string {
  if (!route) return "—";
  return route
    .replace(/_/g, " ")
    .replace(/\bpdf\b/i, "PDF")
    .replace(/\bocr\b/i, "OCR")
    .replace(/\bcsv\b/i, "CSV")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

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
  // For non-confirmed cases the invoice/bank shown are the closest candidate the
  // engine evaluated and rejected — not a committed match. Flag that in the UI.
  const isUnconfirmed = run.status === "NEEDS_REVIEW" || run.status === "UNMATCHED" || run.status === "NO_PROOF_RECORD";
  const invoiceMyr = invoice ? myrEquivalent(invoice.amountDue, run) : null;
  const proofMyr = proof ? myrEquivalent(proof.financialPayload.paidAmount, run) : null;
  const bankMyr = bank ? myrEquivalent(bank.netCreditAmount ?? bank.amount, run) : null;

  function actionCode(label: string): string {
    switch (label) {
      case "View Report":
        return "VIEW_REPORT";
      case "Approve Match":
      case "Approve with Note":
        return "APPROVE_MATCH";
      case "Reject":
      case "Reject Match":
        return "REJECT_MATCH";
      case "Request More Info":
      case "Request More Proof":
        return "REQUEST_MORE_INFO";
      case "Mark as Unresolved":
        return "MARK_UNRESOLVED";
      case "Upload Missing Evidence":
        return "UPLOAD_MISSING_EVIDENCE";
      case "Create Discrepancy Note":
        return "CREATE_DISCREPANCY_NOTE";
      default:
        return "REQUEST_MORE_INFO";
    }
  }

  async function handleAction(label: string) {
    setActionConfirm(null);
    setActionError(null);

    if (label === "View Report") {
      setTab("artifacts");
      setActionConfirm("Report opened in the Artifacts tab.");
      return;
    }

    setActionBusy(label);
    try {
      const response = await fetch("/api/reconciliation/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: run.runId,
          proofId: run.proofId,
          invoiceLabel: row.invoiceLabel,
          action: actionCode(label),
          note: `${label} selected from reconciliation detail modal.`
        })
      });
      const body = await response.json();
      if (!response.ok) {
        setActionError(body.error ?? "Unable to save action.");
        return;
      }
      setActionConfirm(`${label} saved to the local audit log for ${row.invoiceLabel}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to save action.");
    } finally {
      setActionBusy(null);
    }
  }

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
                  {selected?.evidenceTrust ? (
                    <span className={`chip ${evidenceTrustMeta(selected.evidenceTrust.level).tone}`}>
                      {evidenceTrustMeta(selected.evidenceTrust.level).label}
                    </span>
                  ) : null}
                </div>
              </div>
              {selected?.candidateKind ? (
                <div className="field-block">
                  <div className="fb-label">Match type</div>
                  <div className="fb-value">
                    {candidateKindLabel(selected.candidateKind)}
                    {selected.expectedPaymentIds && selected.expectedPaymentIds.length > 1
                      ? ` · ${selected.expectedPaymentIds.length} invoices`
                      : ""}
                  </div>
                </div>
              ) : null}
              <div className="field-block">
                <div className="fb-label">Reason</div>
                <div className="fb-value">{selected?.explanation ?? run.summary ?? REASON_COPY[run.status]}</div>
              </div>
              <div className="field-block">
                <div className="fb-label">Next action</div>
                <div className="fb-value">{run.nextAction}</div>
              </div>
              {selected?.reviewPayload?.required ? (
                <div className="field-block">
                  <div className="fb-label">Human review</div>
                  <div className="fb-value">
                    {selected.reviewPayload.primaryQuestion ?? "This case requires human review."}
                    {selected.reviewPayload.blockers.length > 0 ? (
                      <div className="chip-row">
                        {selected.reviewPayload.blockers.map((flag) => (
                          <span key={flag} className="chip plain">
                            {formatCode(flag)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {selected.reviewPayload.suggestedActions.length > 0 ? (
                      <ul className="suggested-actions">
                        {selected.reviewPayload.suggestedActions.map((action) => (
                          <li key={action}>{action}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {tab === "evidence" ? (
            <>
              {isUnconfirmed ? (
                <p className="evidence-note">
                  Closest candidate considered — not a confirmed match. The records below are what the engine
                  evaluated for this proof; the signals show why it was not auto-matched.
                </p>
              ) : null}
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
                        <dd className="num">
                          {formatMoney(invoice.amountDue)}
                          {invoiceMyr ? (
                            <span className="myr-sub" title={`${invoiceMyr.rate} · ${invoiceMyr.sourceLabel}`}>
                              {invoiceMyr.text}
                            </span>
                          ) : null}
                        </dd>
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
                        <dd className="num">
                          {formatMoney(proof.financialPayload.paidAmount)}
                          {proofMyr ? (
                            <span className="myr-sub" title={`${proofMyr.rate} · ${proofMyr.sourceLabel}`}>
                              {proofMyr.text}
                            </span>
                          ) : null}
                        </dd>
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
                        <dd className="num">
                          {formatMoney(bank.netCreditAmount ?? bank.amount)}
                          {bankMyr ? (
                            <span className="myr-sub" title={`${bankMyr.rate} · ${bankMyr.sourceLabel}`}>
                              {bankMyr.text}
                            </span>
                          ) : null}
                        </dd>
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

              {selected?.allocations && selected.allocations.length > 0 ? (
                <div className="alloc-block">
                  <h4>
                    Payment allocation
                    {selected.allocations.length > 1 ? ` · ${selected.allocations.length} invoices` : ""}
                  </h4>
                  <table className="alloc-table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Applied</th>
                        <th>Remaining</th>
                        <th>Basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.allocations.map((alloc) => (
                        <tr key={alloc.expectedPaymentId}>
                          <td className="num">{alloc.invoiceNumber}</td>
                          <td className="num">{formatMoney(alloc.appliedAmount)}</td>
                          <td className="num">{formatMoney(alloc.remainingAmount)}</td>
                          <td>{allocationReasonLabel(alloc.reason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
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
                      {selected.bestFxScenario.fxSourceKind ? (
                        <div>
                          <dt>FX source</dt>
                          <dd>{fxSourceKindLabel(selected.bestFxScenario.fxSourceKind)}</dd>
                        </div>
                      ) : null}
                      {fxProviderLabel(selected.bestFxScenario.providerId) ? (
                        <div>
                          <dt>Provider</dt>
                          <dd>{fxProviderLabel(selected.bestFxScenario.providerId)}</dd>
                        </div>
                      ) : null}
                      {selected.bestFxScenario.spreadMargin ? (
                        <div>
                          <dt>Spread margin</dt>
                          <dd className="num">{formatPercent(selected.bestFxScenario.spreadMargin)}</dd>
                        </div>
                      ) : null}
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

          {tab === "trust" ? (
            <>
              {selected?.evidenceTrust ? (
                (() => {
                  const trust = selected.evidenceTrust;
                  const meta = evidenceTrustMeta(trust.level);
                  const rank = trustRank(trust.level);
                  // A field that appears in `issues` failed the confidence floor,
                  // so it is NOT verified — only show fields that actually passed.
                  const issueFields = new Set(trust.issues.map((issue) => issue.field));
                  const verifiedFields = trust.criticalFieldsChecked.filter((field) => !issueFields.has(field));
                  return (
                    <div className="trust-card">
                      <div className={`trust-hero ${meta.tone}`}>
                        <div className="trust-hero-top">
                          <span className="trust-hero-eyebrow">Evidence trust</span>
                          <span className={`chip ${meta.tone}`}>{meta.label}</span>
                        </div>
                        <div className="trust-ladder" role="img" aria-label={`Evidence trust level: ${meta.label}`}>
                          {TRUST_LADDER.map((step, index) => (
                            <span
                              key={step.level}
                              className={`trust-rung ${index <= rank ? `filled ${meta.tone}` : ""}`}
                              title={step.label}
                            />
                          ))}
                        </div>
                        <p className="trust-blurb">{TRUST_BLURB[trust.level]}</p>
                      </div>

                      <div className="trust-stats">
                        <div className="trust-stat">
                          <span className="ts-label">Extraction route</span>
                          <span className="ts-value">{routeLabel(trust.extractionRoute)}</span>
                        </div>
                        <div className="trust-stat">
                          <span className="ts-label">Evidence spans</span>
                          <span className="ts-value">{trust.hasEvidenceSpans ? "Present" : "None"}</span>
                        </div>
                        <div className="trust-stat">
                          <span className="ts-label">Fields checked</span>
                          <span className="ts-value num">{trust.criticalFieldsChecked.length}</span>
                        </div>
                      </div>

                      {verifiedFields.length > 0 ? (
                        <div className="trust-section">
                          <div className="trust-section-label">Verified critical fields</div>
                          <div className="chip-row">
                            {verifiedFields.map((field) => (
                              <span key={field} className="chip verified">
                                {prettyField(field)}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {trust.issues.length > 0 ? (
                        <div className="trust-section">
                          <div className="trust-section-label">Confidence issues</div>
                          <div className="trust-issues">
                            {trust.issues.map((issue) => {
                              const pct = issue.confidence === null ? null : Math.round(issue.confidence * 100);
                              return (
                                <div className="trust-issue" key={`${issue.field}-${issue.message}`}>
                                  <div className="ti-row">
                                    <span className="ti-field">{prettyField(issue.field)}</span>
                                    <span className="ti-pct num">{pct === null ? "—" : `${pct}%`}</span>
                                  </div>
                                  <div className="ti-meter">
                                    <span className="ti-meter-fill" style={{ width: pct === null ? "0%" : `${pct}%` }} />
                                    <span
                                      className="ti-meter-floor"
                                      style={{ left: `${Math.round(issue.threshold * 100)}%` }}
                                      title={`Confidence floor ${Math.round(issue.threshold * 100)}%`}
                                    />
                                  </div>
                                  <div className="ti-msg">{issue.message}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="trust-clear">✓ All critical fields cleared the confidence floor.</div>
                      )}
                    </div>
                  );
                })()
              ) : null}

              {selected?.auditTrail ? (
                <div className="audit-card">
                  <div className="audit-head">
                    <h4>Audit trail</h4>
                    <span className="chip plain">Policy {selected.auditTrail.policyVersion}</span>
                  </div>
                  <dl className="audit-grid">
                    <div>
                      <dt>Selected candidate</dt>
                      <dd className="num">{selected.auditTrail.selectedCandidateId ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Match type</dt>
                      <dd>{candidateKindLabel(selected.auditTrail.candidateKind ?? undefined)}</dd>
                    </div>
                    <div>
                      <dt>FX source</dt>
                      <dd>{fxSourceKindLabel(selected.auditTrail.fxSourceKind ?? undefined)}</dd>
                    </div>
                    <div>
                      <dt>FX scenario</dt>
                      <dd className="num">{selected.auditTrail.fxScenarioId ?? "—"}</dd>
                    </div>
                  </dl>
                  {selected.auditTrail.reasonCodes.length > 0 ? (
                    <div className="audit-section">
                      <span className="audit-section-label">Reason codes</span>
                      <div className="chip-row">
                        {selected.auditTrail.reasonCodes.map((code) => (
                          <span key={code} className="chip plain">
                            {formatCode(code)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selected.auditTrail.hardReviewFlags.length > 0 ? (
                    <div className="audit-section">
                      <span className="audit-section-label">Hard review flags</span>
                      <div className="chip-row">
                        {selected.auditTrail.hardReviewFlags.map((flag) => (
                          <span key={flag} className="chip review">
                            {formatCode(flag)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {selected.auditTrail.evidenceRefs.length > 0 ? (
                    <div className="audit-section">
                      <span className="audit-section-label">Evidence references</span>
                      <div className="chip-row">
                        {selected.auditTrail.evidenceRefs.map((ref) => (
                          <span key={`${ref.kind}-${ref.id}`} className="chip ref-chip">
                            <span className="ref-kind">{formatCode(ref.kind)}</span>
                            <span className="num">{ref.id}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!selected?.evidenceTrust && !selected?.auditTrail ? (
                <p className="evidence-empty">
                  No trust or audit metadata on this run. Re-run reconciliation to generate the enterprise audit trail.
                </p>
              ) : null}
            </>
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
          {actionConfirm ? <span className="action-confirm">{actionConfirm}</span> : null}
          {actionError ? <span className="action-confirm error">{actionError}</span> : null}
          {tab !== "overview" ? (
            <button type="button" className="secondary-button" onClick={() => setTab("overview")}>
              Back to Overview
            </button>
          ) : null}
          {ACTIONS[run.status].map((label) => (
            <button
              key={label}
              type="button"
              className={label === "View Report" || label.startsWith("Approve") ? "primary-button" : "secondary-button"}
              onClick={() => void handleAction(label)}
              disabled={actionBusy !== null}
            >
              {actionBusy === label ? "Saving..." : label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
