import type { ReconciliationResult } from "../../lib/recon/reconciliation/types";
import { formatMoney, formatPercent, formatReason, statusClass, statusLabel, type RecordIndex } from "./helpers";

function EvidenceComparison({ result, index }: { result: ReconciliationResult; index: RecordIndex }) {
  const expected = result.expectedPaymentId ? index.expectedById.get(result.expectedPaymentId) : undefined;
  const proof = result.proofId ? index.proofById.get(result.proofId) : undefined;
  const bank = result.bankTransactionId ? index.bankById.get(result.bankTransactionId) : undefined;

  const bankReference = bank?.remittanceInformation.structured?.invoiceNumber ?? bank?.normalizedReference ?? null;

  const rows: Array<{ label: string; expected: string; proof: string; bank: string }> = [
    {
      label: "Reference",
      expected: expected?.paymentReference.normalized ?? "missing",
      proof: proof?.financialPayload.reference.normalized ?? "missing",
      bank: bankReference ?? "missing"
    },
    {
      label: "Party",
      expected: expected?.debtor.normalizedName ?? "missing",
      proof: proof?.financialPayload.debtor.normalizedName ?? "missing",
      bank: bank?.debtorNormalizedName ?? "missing"
    },
    {
      label: "Amount",
      expected: formatMoney(expected?.amountDue),
      proof: formatMoney(proof?.financialPayload.paidAmount),
      bank: formatMoney(bank?.amount)
    },
    {
      label: "Date",
      expected: expected ? `${expected.issueDate}${expected.dueDate ? ` → ${expected.dueDate}` : ""}` : "—",
      proof: proof?.financialPayload.paymentDate ?? "—",
      bank: bank ? bank.bookingDate : "—"
    },
    {
      label: "Source confidence",
      expected: expected ? formatPercent(maxConfidence(expected.fieldConfidence)) : "—",
      proof: proof ? formatPercent(proof.aiMetadata.overallConfidence) : "—",
      bank: bank ? "parsed row" : "—"
    }
  ];

  return (
    <div className="recon-evidence">
      <div className="recon-evidence-head">
        <span>Field</span>
        <span>Expected payment</span>
        <span>Payment proof</span>
        <span>Bank credit</span>
      </div>
      {rows.map((row) => (
        <div className="recon-evidence-row" key={row.label}>
          <span className="recon-evidence-label">{row.label}</span>
          <span className={cellClass(row.expected)}>{row.expected}</span>
          <span className={cellClass(row.proof)}>{row.proof}</span>
          <span className={cellClass(row.bank)}>{row.bank}</span>
        </div>
      ))}
    </div>
  );
}

function maxConfidence(fieldConfidence: Record<string, number>): number {
  const values = Object.values(fieldConfidence);
  return values.length > 0 ? Math.max(...values) : 0;
}

function cellClass(value: string): string {
  return value === "missing" ? "recon-evidence-cell is-missing" : "recon-evidence-cell";
}

function FxReasoningPanel({ result }: { result: ReconciliationResult }) {
  const fx = result.bestFxScenario;
  if (!fx) {
    return (
      <div className="recon-fx recon-fx-empty">
        <p className="eyebrow">FX Reasoning</p>
        <p>No usable FX scenario was available. This case requires review.</p>
      </div>
    );
  }
  return (
    <div className="recon-fx">
      <p className="eyebrow">FX Reasoning</p>
      <p className="recon-fx-headline">{fx.label} best explains the received amount.</p>
      <dl className="mini-grid recon-fx-grid">
        <div>
          <dt>Rate</dt>
          <dd>{fx.rate}</dd>
        </div>
        <div>
          <dt>Rate date</dt>
          <dd>{fx.rateDate ?? "—"}</dd>
        </div>
        <div>
          <dt>Expected local</dt>
          <dd>{formatMoney(fx.expectedLocalAmount)}</dd>
        </div>
        <div>
          <dt>Residual</dt>
          <dd>
            {fx.residualAmount} {fx.expectedLocalAmount.currency} / {formatPercent(result.residual?.residualPercent)}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{fx.rateSource.replace(/_/g, " ")}</dd>
        </div>
        <div>
          <dt>Basis</dt>
          <dd>{fx.basis.replace(/_/g, " ")}</dd>
        </div>
      </dl>
    </div>
  );
}

function ScoreAndFlagsPanel({ result }: { result: ReconciliationResult }) {
  return (
    <div className="recon-score">
      <div className="recon-score-head">
        <span className="recon-score-value">{result.score}</span>
        <span className="recon-score-max">/ 100</span>
      </div>
      <div className="recon-score-cols">
        <div>
          <p className="eyebrow">Reason codes</p>
          <ul className="recon-codes">
            {result.reasonCodes.map((code) => (
              <li key={code}>{formatReason(code)}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow">Hard review flags</p>
          {result.hardReviewFlags.length === 0 ? (
            <p className="recon-flags-none">None</p>
          ) : (
            <ul className="recon-flags">
              {result.hardReviewFlags.map((flag) => (
                <li key={flag}>{formatReason(flag)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function CaseDetailPanel({ result, index }: { result: ReconciliationResult; index: RecordIndex }) {
  return (
    <section className="panel recon-detail" aria-label="Selected case detail">
      <div className="recon-detail-head">
        <div>
          <p className="eyebrow">{result.caseId}</p>
          <h2>
            <span className={`recon-badge recon-badge-${statusClass(result.status)}`}>{statusLabel(result.status)}</span>
            <span className="recon-detail-score">Score {result.score}</span>
          </h2>
        </div>
      </div>
      <p className="recon-explanation">{result.explanation}</p>
      <EvidenceComparison result={result} index={index} />
      <div className="recon-detail-split">
        <FxReasoningPanel result={result} />
        <ScoreAndFlagsPanel result={result} />
      </div>
    </section>
  );
}
