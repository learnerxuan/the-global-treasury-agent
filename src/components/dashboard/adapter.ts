// UI adapter: turns reconciliation run JSON into display-ready labels.
// No money math happens here — values arrive already computed by the engine.
// We only format strings for presentation.

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
  return `Rate source: ${source}`;
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

export function buildDisplayRow(run: ReconciliationRun): ReconciliationDisplayRow {
  const selected = run.selectedResult;
  const invoice = findInvoice(run);

  const invoiceLabel = invoice?.invoiceNumber ?? selected?.expectedPaymentId ?? "—";
  const expectedAmountLabel = formatMoney(invoice?.amountDue ?? null);
  const receivedAmountLabel = formatMoney(receivedAmount(run));

  const fx = selected?.bestFxScenario;
  const fxBasisText = fx ? `${fxBasisLabel(fx.basis)} · ${fx.rate}` : "—";
  const scoreLabel = selected ? String(Math.round(selected.score)) : "—";

  return {
    id: run.runId,
    status: run.status,
    invoiceLabel,
    customerLabel: customerLabel(run),
    expectedAmountLabel,
    receivedAmountLabel,
    fxBasisLabel: fxBasisText,
    scoreLabel,
    summary: run.summary,
    run
  };
}

export type TimelineActorKind = "agent" | "tool" | "artifact" | "human";

export function timelineActorMeta(actor: string): { label: string; kind: TimelineActorKind } {
  switch (actor) {
    case "Agent 2":
      return { label: "Agent 2", kind: "agent" };
    case "Reconciliation Tool":
      return { label: "Code Tools", kind: "tool" };
    case "Artifact Module":
      return { label: "Artifact Module", kind: "artifact" };
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
