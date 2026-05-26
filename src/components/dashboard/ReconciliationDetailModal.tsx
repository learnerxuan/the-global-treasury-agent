import { useEffect, useState } from "react";
import {
  allocationReasonLabel,
  bankReferenceLabel,
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
  statusMeta,
  timelineActorMeta
} from "./adapter";
import { DocumentCompare } from "./DocumentCompare";
import { StatusChip } from "./StatusChip";
import type { ReconciliationDisplayRow, RunStatus } from "./types";
import type { EvidenceTrustLevel, ScoreBreakdown } from "../../lib/recon/reconciliation/types";

type Tab = "overview" | "evidence" | "fx" | "timeline" | "trust" | "artifacts";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "overview", label: "Summary" },
  { key: "evidence", label: "Source Documents" },
  { key: "fx", label: "Currency Conversion" },
  { key: "timeline", label: "System Activity" },
  { key: "trust", label: "Data Quality Checks" },
  { key: "artifacts", label: "Raw Data Logs" }
];

const REASON_COPY: Record<RunStatus, string> = {
  AUTO_MATCHED: "Evidence aligns and the money math is explainable. No human action required.",
  LIKELY_MATCHED: "Strong evidence, but approval is recommended before moving records to completed.",
  NEEDS_REVIEW: "Evidence is conflicting, incomplete, or financially risky.",
  UNMATCHED: "No reliable invoice and bank candidate was found.",
  NO_PROOF_RECORD: "No payment proof record was available to reconcile."
};

export const RECONCILIATION_ACTIONS: Record<RunStatus, string[]> = {
  AUTO_MATCHED: ["View Report"],
  LIKELY_MATCHED: ["Approve", "Reject"],
  NEEDS_REVIEW: ["Approve", "Reject"],
  UNMATCHED: ["Upload Missing Evidence"],
  NO_PROOF_RECORD: ["Upload Missing Evidence"]
};

export function actionCode(label: string): string {
  switch (label) {
    case "View Report":
      return "VIEW_REPORT";
    case "Approve":
    case "Approve Match":
    case "Approve with Note":
      return "APPROVE_MATCH";
    case "Reject":
    case "Reject Match":
      return "REJECT_MATCH";
    case "Upload Missing Evidence":
      return "UPLOAD_MISSING_EVIDENCE";
    default:
      return "REQUEST_MORE_INFO";
  }
}

// Trust level shown as a 4-rung ladder from least to most trustworthy.
const TRUST_LADDER: Array<{ level: EvidenceTrustLevel; label: string }> = [
  { level: "missing_proof", label: "Missing Payment Proof" },
  { level: "weak_ai", label: "Low-Confidence Extraction" },
  { level: "supported_ai", label: "High-Confidence AI Extraction" },
  { level: "deterministic", label: "Verified Data (CSV/Manual)" }
];

const TRUST_BLURB: Record<EvidenceTrustLevel, string> = {
  deterministic: "Key fields came from verified structured data such as CSV, spreadsheet, or manual entry.",
  supported_ai: "Key fields were extracted by AI and passed the confidence checks.",
  weak_ai: "One or more AI-extracted fields fell below the confidence threshold.",
  missing_proof: "No payment proof was available to support this match."
};

const SCORE_LABELS: Array<{ key: keyof ScoreBreakdown; label: string }> = [
  { key: "reference", label: "Reference" },
  { key: "amountFx", label: "Amount / FX" },
  { key: "date", label: "Date" },
  { key: "name", label: "Name" },
  { key: "confidence", label: "AI confidence" },
  { key: "competitionPenalty", label: "Competition penalty" }
];

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

const CODE_COPY: Record<string, string> = {
  AMOUNT_SIGNIFICANT_VARIANCE: "The amount difference is significant.",
  AMOUNT_SMALL_VARIANCE: "The amount has a small difference.",
  AMOUNT_UNEXPLAINED: "The amount difference is unexplained.",
  AMOUNT_WITHIN_TOLERANCE: "The amount is within tolerance.",
  COMPETING_CANDIDATES: "Multiple possible matches were found.",
  COMPETING_CANDIDATES_CLOSE: "Multiple close matches need review.",
  COUNTERPARTY_ACCOUNT_MATCH: "The counterparty account matches.",
  COUNTERPARTY_ALIAS_MATCH: "The counterparty alias matches.",
  DATE_CLOSE: "The payment dates are close.",
  DATE_FAR: "The payment dates are far apart.",
  DUPLICATE_BANK_TRANSACTION: "A duplicate bank transaction may exist.",
  DUPLICATE_PROOF_TX_ID: "A duplicate payment proof transaction ID may exist.",
  EXACT_REFERENCE_MATCH: "The payment reference matches exactly.",
  FIXTURE_FALLBACK_ONLY: "Only the fallback currency rate was available.",
  FLAT_FEE_EXPLAINS_RESIDUAL: "A flat fee explains the unexplained difference.",
  FX_EXPLAINS_AMOUNT: "Currency conversion explains the amount.",
  FX_VARIANCE_EXPLAINS_RESIDUAL: "Currency conversion variance explains the unexplained difference.",
  HIGH_EXTRACTION_CONFIDENCE: "The extracted fields have high confidence.",
  IGNORED_GENERIC_REFERENCE_TOKEN: "A generic reference token was ignored.",
  LOW_CONFIDENCE_CRITICAL_FIELD: "A critical extracted field has low confidence.",
  LOW_EXTRACTION_CONFIDENCE: "The extracted fields have low confidence.",
  MISSING_REFERENCE_WEAK_NAME: "The reference is missing and the payer name match is weak.",
  NAME_MATCH: "The payer name matches.",
  NAME_MISMATCH: "The payer name does not match.",
  NAME_SIMILAR: "The payer name is similar.",
  NO_CANDIDATE: "No reliable match candidate was found.",
  NO_FX_SCENARIO: "No suitable currency conversion scenario was found.",
  NO_REFERENCE: "No payment reference was found.",
  NO_USABLE_FX_SCENARIO: "No usable currency conversion scenario was found.",
  PARTIAL_REFERENCE_MATCH: "The payment reference partially matches.",
  PARTIAL_REFERENCE_WEAK_EVIDENCE: "The reference only partially matches and supporting evidence is weak.",
  POSSIBLE_BATCH_PAYMENT: "This may be a batch payment.",
  POSSIBLE_FEE_OR_SPREAD: "A fee or currency spread may explain the difference.",
  POSSIBLE_OVERPAYMENT: "The received amount may be higher than the invoice amount.",
  POSSIBLE_PARTIAL_PAYMENT: "This may be a partial payment.",
  POSSIBLE_REVERSAL: "This may be a reversal or correction entry.",
  POSSIBLE_SHORT_PAYMENT: "The received amount may be short of the invoice amount.",
  PROOF_NOT_SETTLED: "The payment proof is not marked as settled.",
  RESIDUAL_ABSOLUTE_CAP_EXCEEDED: "The unexplained difference exceeds the absolute limit.",
  RESIDUAL_ABOVE_THRESHOLD: "The unexplained difference is above the review threshold.",
  STRUCTURED_REFERENCE_MATCH: "The structured payment reference matches.",
  UNEXPLAINED_RESIDUAL_ABOVE_CAP: "The unexplained difference exceeds the allowed cap.",
  WEAK_PARTIAL_REFERENCE_MATCH: "The payment reference only weakly matches."
};

function sentenceCase(text: string): string {
  if (!text) return text;
  return `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;
}

function formatCode(code: string): string {
  const mapped = CODE_COPY[code];
  if (mapped) return mapped;

  const phrase = code
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .join(" ");
  return sentenceCase(phrase);
}

function buildDecisionNarrative({
  run,
  invoiceLabel,
  bankAmountLabel,
  selected
}: {
  run: ReconciliationDisplayRow["run"];
  invoiceLabel: string;
  bankAmountLabel: string;
  selected: ReconciliationDisplayRow["run"]["selectedResult"];
}): string {
  const invoiceText = invoiceLabel === "—" ? "the closest invoice candidate" : `Invoice #${invoiceLabel}`;
  const bankText = bankAmountLabel === "—" ? "the closest bank transaction" : `the bank deposit of ${bankAmountLabel}`;
  const basis = selected?.bestFxScenario ? fxBasisLabel(selected.bestFxScenario.basis) : null;
  const difference = selected?.bestFxScenario
    ? formatPercent(selected.bestFxScenario.residualPercent)
    : selected?.residual
      ? formatPercent(selected.residual.residualPercent)
      : null;
  const reason = selected?.reviewPayload?.blockers[0] ?? selected?.hardReviewFlags[0] ?? selected?.reasonCodes[0];

  if (run.status === "AUTO_MATCHED") {
    const conversion = basis
      ? ` The currency conversion was calculated using ${basis}, leaving ${difference ?? "no"} unexplained difference.`
      : " No currency conversion was required.";
    return `This payment was successfully matched to ${invoiceText} and ${bankText}.${conversion}`;
  }

  if (run.status === "LIKELY_MATCHED") {
    return `The system found a strong match between this payment, ${invoiceText}, and ${bankText}, but approval is recommended before closing the case.${reason ? ` Reason: ${formatCode(reason)}` : ""}`;
  }

  if (run.status === "NEEDS_REVIEW") {
    return `The system matched this payment to ${invoiceText}, but human review is required.${reason ? ` Reason: ${formatCode(reason)}` : ""}`;
  }

  if (run.status === "UNMATCHED") {
    return `The system could not confidently match this payment to an invoice and bank deposit.${reason ? ` Reason: ${formatCode(reason)}` : ""}`;
  }

  return REASON_COPY[run.status];
}

export function ReconciliationDetailModal({
  row,
  readOnly = false,
  onClose,
  onActionComplete
}: {
  row: ReconciliationDisplayRow;
  readOnly?: boolean;
  onClose: () => void;
  onActionComplete?: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [actionConfirm, setActionConfirm] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);

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
  const decisionNarrative = buildDecisionNarrative({
    run,
    invoiceLabel: row.invoiceLabel,
    bankAmountLabel: bank ? formatMoney(bank.netCreditAmount ?? bank.amount) : row.receivedAmountLabel,
    selected
  });
  const availableActions = readOnly ? ["View Report"] : RECONCILIATION_ACTIONS[run.status];
  // Original uploaded files, traced back via each record's sourceFileId.
  const invoiceFileId = invoice?.sourceFileId ?? null;
  const proofFileId = proof?.sourceFileId ?? null;
  const bankFileId = bank?.sourceFileId ?? null;
  const canCompare = Boolean(invoiceFileId || proofFileId || bankFileId);
  const bankAmountLabel = bank ? formatMoney(bank.netCreditAmount ?? bank.amount) : row.receivedAmountLabel;
  const bankRefLabel = bankReferenceLabel(bank);
  const matchedInvoiceLabel = row.invoiceLabel === "—" ? "No invoice selected" : `Matched to: Invoice ${row.invoiceLabel}`;
  const fxScenario = selected?.bestFxScenario;
  const actualBankAmount = bank ? bank.netCreditAmount ?? bank.amount : null;

  async function handleAction(label: string) {
    setActionConfirm(null);
    setActionError(null);

    if (label === "View Report") {
      setTab("artifacts");
      setActionConfirm("Report opened in the Raw Data Logs tab.");
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
          note: null
        })
      });
      const body = await response.json();
      if (!response.ok) {
        setActionError(body.error ?? "Unable to save action.");
        return;
      }
      setActionConfirm(`${label} saved to the local audit log for ${row.invoiceLabel}.`);
      await onActionComplete?.();
      if (actionCode(label) === "APPROVE_MATCH" || actionCode(label) === "REJECT_MATCH") {
        onClose();
      }
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
            <div className="mh-id num">Bank Deposit: {bankAmountLabel} (Ref: {bankRefLabel})</div>
            <div className="mh-meta">
              <StatusChip status={run.status} />
              <span className="chip plain">{matchedInvoiceLabel}</span>
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
              {selected?.reviewPayload?.required ? (
                <div className="review-warning-box" role="alert">
                  <div className="review-warning-title">Human review required</div>
                  <p>{selected.reviewPayload.primaryQuestion ?? "This case requires human review before it can be closed."}</p>
                  {selected.reviewPayload.blockers.length > 0 ? (
                    <>
                      <div className="review-warning-subtitle">System Flags</div>
                      <ul className="review-warning-list">
                        {selected.reviewPayload.blockers.map((flag) => (
                          <li key={flag}>{formatCode(flag)}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {selected.reviewPayload.suggestedActions.length > 0 ? (
                    <>
                      <div className="review-warning-subtitle">Recommended actions</div>
                      <ul className="review-warning-list">
                        {selected.reviewPayload.suggestedActions.map((action) => (
                          <li key={action}>{action}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ) : null}
              <div className="field-block">
                <div className="fb-label">Decision summary</div>
                <div className="fb-value summary-narrative">{decisionNarrative}</div>
              </div>
              <div className="field-block">
                <div className="fb-label">Status</div>
                <div className="fb-value decision-line">
                  <StatusChip status={run.status} />
                  {selected?.evidenceTrust ? (
                    <span className={`chip ${evidenceTrustMeta(selected.evidenceTrust.level).tone}`}>
                      {evidenceTrustMeta(selected.evidenceTrust.level).label}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="score-breakdown">
                <div className="score-breakdown-head">
                  <span>Match Score Breakdown</span>
                  <span className="num">{row.scoreLabel}</span>
                </div>
                {selected?.scoreBreakdown ? (
                  <div className="score-breakdown-grid">
                    {SCORE_LABELS.map((item) => (
                      <div className="score-item" key={item.key}>
                        <span>{item.label}</span>
                        <span className="num">{selected.scoreBreakdown?.[item.key] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="evidence-empty">No score breakdown is available for this run.</p>
                )}
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
                <div className="fb-label">Detail</div>
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
              {isUnconfirmed ? (
                <p className="evidence-note">
                  Closest candidate considered — not a confirmed match. The records below are what the engine
                  evaluated for this proof; the signals show why it was not auto-matched.
                </p>
              ) : null}
              <div className="evidence-toolbar">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setShowCompare(true)}
                  disabled={!canCompare}
                  title={canCompare ? "View source documents side by side" : "A source file is needed to compare"}
                >
                  View Source Documents
                </button>
              </div>
              <div className="evidence-grid">
                <div className="evidence-col">
                  <h4>Expected Origin: Invoice</h4>
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
                  {invoiceFileId ? (
                    <a className="view-file-link" href={`/api/files/${encodeURIComponent(invoiceFileId)}`} target="_blank" rel="noreferrer">
                      View invoice file ↗
                    </a>
                  ) : null}
                </div>

                <div className="evidence-col">
                  <h4>Supporting Evidence: Payment Proof</h4>
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
                  {proofFileId ? (
                    <a className="view-file-link" href={`/api/files/${encodeURIComponent(proofFileId)}`} target="_blank" rel="noreferrer">
                      View proof file ↗
                    </a>
                  ) : null}
                </div>

                <div className="evidence-col">
                  <h4>Target to Explain: Bank Statement Row</h4>
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
                        <dd className="num">{bankRefLabel}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="evidence-empty">No matched bank transaction.</p>
                  )}
                  {bankFileId ? (
                    <a className="view-file-link" href={`/api/files/${encodeURIComponent(bankFileId)}`} target="_blank" rel="noreferrer">
                      View statement file ↗
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="signals">
                <h4>Match signals</h4>
                {invoice && (proof || bank) ? (
                  <div className="signal-groups">
                    <div>
                      <h5>Bank ↔ Proof</h5>
                      <div className="signal-row">
                        <span className="sr-name">Amount</span>
                        <span className="sr-value num">{bankAmountLabel} vs {proof ? formatMoney(proof.financialPayload.paidAmount) : "—"}</span>
                      </div>
                      <div className="signal-row">
                        <span className="sr-name">Date</span>
                        <span className="sr-value num">{bank?.bookingDate ?? "—"} vs {proof?.financialPayload.paymentDate ?? "—"}</span>
                      </div>
                      <div className="signal-row">
                        <span className="sr-name">Name</span>
                        <span className="sr-value">{bank?.debtorNormalizedName ?? bank?.debtorName ?? "—"} vs {proof?.financialPayload.debtor.normalizedName ?? proof?.financialPayload.debtor.name ?? "—"}</span>
                      </div>
                    </div>
                    <div>
                      <h5>Proof ↔ Invoice</h5>
                      <div className="signal-row">
                        <span className="sr-name">Reference</span>
                        <span className="sr-value num">{proof?.financialPayload.reference.normalized ?? "—"} vs {invoice.paymentReference.normalized ?? "—"}</span>
                      </div>
                      <div className="signal-row">
                        <span className="sr-name">Amount</span>
                        <span className="sr-value num">{proof ? formatMoney(proof.financialPayload.paidAmount) : "—"} vs {formatMoney(invoice.amountDue)}</span>
                      </div>
                      <div className="signal-row">
                        <span className="sr-name">Name</span>
                        <span className="sr-value">{proof?.financialPayload.debtor.normalizedName ?? proof?.financialPayload.debtor.name ?? "—"} vs {invoice.debtor.normalizedName ?? invoice.debtor.name ?? "—"}</span>
                      </div>
                    </div>
                  </div>
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
              {fxScenario ? (
                <>
                  <div className="fx-scenario selected">
                    <div className="fx-head">
                      <span className="fx-basis">{fxBasisLabel(fxScenario.basis)}</span>
                      <span className="chip success">Selected</span>
                    </div>
                    <div className="fx-flow">
                      <div className="fx-step">
                        <span>Invoice Amount (Foreign)</span>
                        <strong className="num">{formatMoney(fxScenario.foreignAmount)}</strong>
                      </div>
                      <div className="fx-step">
                        <span>Applied Rate</span>
                        <strong className="num">x {fxScenario.rate} ({fxBasisLabel(fxScenario.basis)})</strong>
                      </div>
                      <div className="fx-step">
                        <span>Expected Bank Amount (Local)</span>
                        <strong className="num">{formatMoney(fxScenario.expectedLocalAmount)}</strong>
                      </div>
                      <div className="fx-step">
                        <span>Actual Bank Amount (Local)</span>
                        <strong className="num">{formatMoney(actualBankAmount)}</strong>
                      </div>
                      <div className="fx-step fx-difference">
                        <span>Unexplained Difference</span>
                        <strong className="num">{fxScenario.residualAmount} ({formatPercent(fxScenario.residualPercent)})</strong>
                      </div>
                    </div>
                    <dl className="fx-grid fx-meta-grid">
                      {fxScenario.fxSourceKind ? (
                        <div>
                          <dt>FX source</dt>
                          <dd>{fxSourceKindLabel(fxScenario.fxSourceKind)}</dd>
                        </div>
                      ) : null}
                      {fxProviderLabel(fxScenario.providerId) ? (
                        <div>
                          <dt>Provider</dt>
                          <dd>{fxProviderLabel(fxScenario.providerId)}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>Rate date</dt>
                        <dd className="num">{fxScenario.rateDate ?? "—"}</dd>
                      </div>
                      {fxScenario.spreadMargin ? (
                        <div>
                          <dt>Spread margin</dt>
                          <dd className="num">{formatPercent(fxScenario.spreadMargin)}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <p className="fx-source">{fxSourceLabel(fxScenario.rateSource)}</p>
                  </div>
                  <div className="fx-note">
                    Selected basis: {fxBasisLabel(fxScenario.basis)} produced the lowest unexplained difference
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
                      <span className="audit-section-label">System Flags</span>
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
                      <span className="audit-section-label">System Flags Requiring Review</span>
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
                  <div className="report-summary">
                    <p style={{ fontSize: "0.9rem", color: "var(--ink-invert)", marginBottom: "16px", lineHeight: 1.5 }}>
                      {decisionNarrative}
                    </p>
                    
                    <div style={{ marginBottom: "16px" }}>
                      <h5 style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "rgba(245, 248, 242, 0.45)", marginBottom: "8px", margin: "0 0 8px 0" }}>System Decision</h5>
                      <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div>
                          <dt>Status</dt>
                          <dd><StatusChip status={run.status} /></dd>
                        </div>
                        {selected?.candidateKind && (
                          <div>
                            <dt>Match Type</dt>
                            <dd>{candidateKindLabel(selected.candidateKind)}</dd>
                          </div>
                        )}
                        <div>
                          <dt>Match Score</dt>
                          <dd className="num">{row.scoreLabel}</dd>
                        </div>
                      </dl>
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                      <h5 style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "rgba(245, 248, 242, 0.45)", marginBottom: "8px", margin: "0 0 8px 0" }}>Matched Entities</h5>
                      <dl style={{ display: "grid", gap: "10px" }}>
                        <div>
                          <dt>Invoice</dt>
                          <dd className="num">{selected?.expectedPaymentId ?? "—"} {row.invoiceLabel !== "—" ? <span style={{ color: "rgba(245, 248, 242, 0.5)" }}>({row.invoiceLabel})</span> : ""}</dd>
                        </div>
                        <div>
                          <dt>Bank Transaction</dt>
                          <dd className="num">{selected?.bankTransactionId ?? "—"} <span style={{ color: "rgba(245, 248, 242, 0.5)" }}>({bankAmountLabel})</span></dd>
                        </div>
                        <div>
                          <dt>Payment Proof</dt>
                          <dd className="num">{selected?.proofId ?? run.proofId ?? "—"}</dd>
                        </div>
                      </dl>
                    </div>

                    {selected?.bestFxScenario && (
                      <div>
                        <h5 style={{ fontSize: "0.8rem", textTransform: "uppercase", color: "rgba(245, 248, 242, 0.45)", marginBottom: "8px", margin: "0 0 8px 0" }}>Financial Summary</h5>
                        <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                          <div>
                            <dt>Invoice Amount</dt>
                            <dd className="num">{formatMoney(selected.bestFxScenario.foreignAmount)}</dd>
                          </div>
                          <div>
                            <dt>Expected Local Amount</dt>
                            <dd className="num">{formatMoney(selected.bestFxScenario.expectedLocalAmount)} <span style={{ color: "rgba(245, 248, 242, 0.5)", fontSize: "0.75rem" }}>(Rate: {selected.bestFxScenario.rate})</span></dd>
                          </div>
                          <div>
                            <dt>Actual Local Amount</dt>
                            <dd className="num">{formatMoney(actualBankAmount)}</dd>
                          </div>
                          <div>
                            <dt>Unexplained Difference</dt>
                            <dd className="num">{selected.bestFxScenario.residualAmount} ({formatPercent(selected.bestFxScenario.residualPercent)})</dd>
                          </div>
                        </dl>
                      </div>
                    )}
                  </div>
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
              Back to Summary
            </button>
          ) : null}
          {availableActions.map((label) => (
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

      {showCompare ? (
        <DocumentCompare
          title={`Source documents · ${bankRefLabel}`}
          panes={[
            { label: "Bank Statement", documentId: bankFileId },
            { label: "Payment Proof", documentId: proofFileId },
            { label: "Invoice", documentId: invoiceFileId }
          ]}
          onClose={() => setShowCompare(false)}
        />
      ) : null}
    </div>
  );
}
