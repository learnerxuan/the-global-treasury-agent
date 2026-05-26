// UI adapter: turns reconciliation run JSON into display-ready labels.
// Values arrive already computed by the engine; we only format for presentation.
// The one exception is the home-currency (MYR) preview below foreign amounts,
// which reuses the engine's own deterministic decimal multiply (no float math)
// applied to the rate the engine already selected — never a fabricated rate.

import { multiplyMoneyByRate } from "../../lib/recon/reconciliation/money";
import type {
  AllocationReason,
  CandidateKind,
  EvidenceTrustLevel,
  FxSourceKind
} from "../../lib/recon/reconciliation/types";
import type {
  BankStatementTransaction,
  ExpectedPaymentRecord,
  NormalizedPaymentProofRecord,
  ReconciliationDisplayRow,
  ReconciliationRun,
  RunStatus
} from "./types";

type MoneyLike = { value: string | null; currency: string | null } | null | undefined;

export type StatusTone = "success" | "info" | "review" | "error" | "neutral";

export type StatusMeta = {
  label: string;
  tone: StatusTone;
  actionLabel: string;
};

const STATUS_META: Record<RunStatus, StatusMeta> = {
  AUTO_MATCHED: { label: "AUTO_MATCHED", tone: "success", actionLabel: "View" },
  LIKELY_MATCHED: { label: "LIKELY_MATCHED", tone: "info", actionLabel: "Review" },
  NEEDS_REVIEW: { label: "NEEDS_REVIEW", tone: "review", actionLabel: "Review" },
  UNMATCHED: { label: "UNMATCHED", tone: "error", actionLabel: "Inspect" },
  NO_PROOF_RECORD: { label: "NO_PROOF_RECORD", tone: "neutral", actionLabel: "Inspect" }
};

export function statusMeta(status: RunStatus): StatusMeta {
  return STATUS_META[status] ?? STATUS_META.NO_PROOF_RECORD;
}

export function formatMoney(amount: MoneyLike): string {
  if (!amount || amount.value === null || amount.value === undefined) return "—";
  const numeric = Number(amount.value);
  const currency = amount.currency ?? "";
  if (!Number.isFinite(numeric)) {
    return `${currency} ${amount.value}`.trim();
  }
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(numeric);
  return `${currency} ${formatted}`.trim();
}

// The SME's home / settlement currency. Foreign amounts get a MYR preview.
const HOME_CURRENCY = "MYR";

function formatMyrApprox(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `RM ${value}`;
  return `RM ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(numeric)}`;
}

export type MyrEquivalent = { text: string; rate: string; sourceLabel: string };

// A muted "≈ RM …" home-currency preview for a foreign amount, converted at the
// exact rate the engine selected for this case. Returns null when the amount is
// already MYR, when no rate is available, or when the selected rate applies to a
// different currency (we never convert with a rate that doesn't belong to it).
export function myrEquivalent(amount: MoneyLike, run: ReconciliationRun): MyrEquivalent | null {
  if (!amount || amount.value === null || amount.value === undefined) return null;
  if ((amount.currency ?? "") === HOME_CURRENCY) return null;
  const scenario = run.selectedResult?.bestFxScenario;
  if (!scenario || !scenario.rate) return null;
  if (scenario.foreignAmount.currency !== amount.currency) return null;
  const myr = multiplyMoneyByRate(amount.value, scenario.rate);
  return {
    text: `≈ ${formatMyrApprox(myr)}`,
    rate: scenario.rate,
    sourceLabel: fxSourceKindLabel(scenario.fxSourceKind)
  };
}

export function fxBasisLabel(basis: string): string {
  switch (basis) {
    case "proof_rate":
      return "Proof rate";
    case "bank_statement":
      return "Bank-recorded rate";
    case "invoice_date":
      return "Invoice date";
    case "payment_date":
      return "Payment date";
    case "bank_date":
      return "Bank booking date";
    case "fallback":
      return "Fallback rate";
    default:
      return basis;
  }
}

export function formatFxRateLabel(run: ReconciliationRun): string {
  const fx = run.selectedResult?.bestFxScenario;
  if (!fx) return "—";
  const rate = Number(fx.rate);
  const rateLabel = Number.isFinite(rate)
    ? new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(rate)
    : fx.rate;
  return `Rate: ${rateLabel} (${fxBasisLabel(fx.basis)})`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

export function fxSourceLabel(source: string | undefined): string {
  if (!source) return "";
  if (source === "proof") return "Rate source: payment proof exchange rate";
  if (source === "bank") return "Rate source: bank statement (recorded FX)";
  if (source.startsWith("fixture")) return "Rate source: local FX fixture table";
  if (source === "same_currency") return "Rate source: same currency (no conversion)";
  if (source === "live_api") return "Rate source: live central-bank API";
  return `Rate source: ${source}`;
}

// Where the selected FX rate ultimately came from (set during the enterprise FX
// upgrade). Distinct from rateSource: this is the trust tier the engine assigns.
export function fxSourceKindLabel(kind: FxSourceKind | undefined): string {
  switch (kind) {
    case "bank_actual":
      return "Bank actual rate";
    case "proof_declared":
      return "Proof-declared rate";
    case "market_cached":
      return "Live market rate (cached)";
    case "fixture_fallback":
      return "Fixture fallback";
    case "spread_adjusted":
      return "Spread-adjusted market rate";
    default:
      return kind ?? "—";
  }
}

export function fxProviderLabel(providerId: string | undefined): string | null {
  if (!providerId) return null;
  if (providerId === "bnm") return "Bank Negara Malaysia (BNM)";
  if (providerId === "fixture") return "Local fixture table";
  return providerId;
}

export function candidateKindLabel(kind: CandidateKind | undefined): string {
  switch (kind) {
    case "single_invoice":
      return "Single invoice";
    case "batch_invoices":
      return "Batch · multiple invoices";
    case "proof_only":
      return "Proof only";
    case "bank_only":
      return "Bank only";
    default:
      return "—";
  }
}

export function allocationReasonLabel(reason: AllocationReason): string {
  switch (reason) {
    case "single_invoice":
      return "Single invoice";
    case "remittance_advice":
      return "Remittance advice";
    case "subset_sum":
      return "Matched by amount sum";
    case "partial_payment":
      return "Partial payment";
    default:
      return reason;
  }
}

export type TrustMeta = { label: string; tone: StatusTone };

export function evidenceTrustMeta(level: EvidenceTrustLevel | undefined): TrustMeta {
  switch (level) {
    case "deterministic":
      return { label: "Verified Data (CSV/Manual)", tone: "success" };
    case "supported_ai":
      return { label: "High-Confidence AI Extraction", tone: "info" };
    case "weak_ai":
      return { label: "Low-Confidence Extraction", tone: "review" };
    case "missing_proof":
      return { label: "Missing Payment Proof", tone: "error" };
    default:
      return { label: "Unknown", tone: "neutral" };
  }
}

export function findInvoice(run: ReconciliationRun): ExpectedPaymentRecord | undefined {
  const id = run.selectedResult?.expectedPaymentId;
  if (!id) return undefined;
  return run.batch.expectedPayments.find((record) => record.expectedPaymentId === id);
}

export function findBank(run: ReconciliationRun): BankStatementTransaction | undefined {
  const id = run.selectedResult?.bankTransactionId;
  if (!id) return undefined;
  return run.batch.bankTransactions.find((record) => record.internalTxId === id);
}

export function findProof(run: ReconciliationRun): NormalizedPaymentProofRecord | undefined {
  const id = run.proofId ?? run.selectedResult?.proofId;
  if (!id) return undefined;
  return run.batch.paymentProofs.find((record) => record.proofId === id);
}

export function customerLabel(run: ReconciliationRun): string {
  const invoice = findInvoice(run);
  const proof = findProof(run);
  const bank = findBank(run);
  return (
    invoice?.debtor.name ??
    proof?.financialPayload.debtor.name ??
    bank?.debtorName ??
    "—"
  );
}

export function receivedAmount(run: ReconciliationRun): MoneyLike {
  const bank = findBank(run);
  if (bank) return bank.netCreditAmount ?? bank.amount;
  const proof = findProof(run);
  return proof?.financialPayload.paidAmount ?? null;
}

export function bankReferenceLabel(bank: BankStatementTransaction | undefined): string {
  return bank?.referenceNo ?? bank?.acctSvcrRef ?? bank?.txId ?? bank?.normalizedReference ?? "—";
}

export function buildDisplayRow(run: ReconciliationRun): ReconciliationDisplayRow {
  const selected = run.selectedResult;
  const invoice = findInvoice(run);
  const bank = findBank(run);

  const invoiceLabel = invoice?.invoiceNumber ?? selected?.expectedPaymentId ?? "—";
  const expectedAmountLabel = formatMoney(invoice?.amountDue ?? null);
  const receivedAmountLabel = formatMoney(receivedAmount(run));

  const scoreLabel = selected ? String(Math.round(selected.score)) : "—";

  return {
    id: run.runId,
    status: run.status,
    bankDateLabel: bank?.bookingDate ?? "—",
    bankRefLabel: bankReferenceLabel(bank),
    invoiceLabel,
    customerLabel: customerLabel(run),
    expectedAmountLabel,
    expectedAmountMyr: myrEquivalent(invoice?.amountDue ?? null, run)?.text ?? null,
    receivedAmountLabel,
    receivedAmountMyr: myrEquivalent(receivedAmount(run), run)?.text ?? null,
    fxBasisLabel: formatFxRateLabel(run),
    scoreLabel,
    summary: run.summary,
    run
  };
}

export type TimelineActorKind = "agent" | "tool" | "artifact" | "human";

export function timelineActorMeta(actor: string): { label: string; kind: TimelineActorKind } {
  switch (actor) {
    case "Agent 2":
      return { label: "Reconciliation Engine", kind: "agent" };
    case "Reconciliation Tool":
      return { label: "Verification Step", kind: "tool" };
    case "Artifact Module":
      return { label: "Report Builder", kind: "artifact" };
    case "Human Review":
      return { label: "Human Review", kind: "human" };
    default:
      return { label: actor, kind: "agent" };
  }
}

export function formatClockTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
