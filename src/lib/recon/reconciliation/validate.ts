import type { NormalizedInputBatch } from "../types";
import type { InputValidationResult, ToolResult } from "./types";

const TOOL_NAME = "validateNormalizedBatch";
const DECIMAL_RE = /^(0|[1-9]\d*)(\.\d+)?$/;

// Lightweight structural gate before orchestration. The Code Tools layer is the
// real normalizer; this only confirms Agent 2 received something it can run.
export function validateNormalizedBatch(batch: NormalizedInputBatch): ToolResult<InputValidationResult> {
  const issues: string[] = [];

  if (batch.schemaVersion !== "1.0.0") {
    issues.push(`Unexpected schemaVersion ${batch.schemaVersion}.`);
  }

  const bankCredits = batch.bankTransactions.filter((tx) => tx.creditDebitIndicator === "CRDT");

  if (batch.bankTransactions.length === 0) {
    issues.push("Batch has no bank transactions to reconcile against.");
  }

  for (const tx of batch.bankTransactions) {
    if (!DECIMAL_RE.test(tx.amount.value)) {
      issues.push(`Bank transaction ${tx.internalTxId} has a malformed money value "${tx.amount.value}".`);
    }
  }

  for (const proof of batch.paymentProofs) {
    const paid = proof.financialPayload.paidAmount;
    if (paid && !DECIMAL_RE.test(paid.value)) {
      issues.push(`Proof ${proof.proofId} has a malformed money value "${paid.value}".`);
    }
  }

  const data: InputValidationResult = {
    valid: issues.length === 0,
    issues,
    counts: {
      expectedPayments: batch.expectedPayments.length,
      bankTransactions: batch.bankTransactions.length,
      bankCredits: bankCredits.length,
      paymentProofs: batch.paymentProofs.length
    }
  };

  return {
    ok: true,
    toolName: TOOL_NAME,
    data,
    summary: data.valid
      ? `Validated batch: ${data.counts.bankCredits} credit(s), ${data.counts.paymentProofs} proof(s), ${data.counts.expectedPayments} expected payment(s).`
      : `Validation found ${issues.length} issue(s).`
  };
}
