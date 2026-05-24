import { normalizePaymentProof } from "./normalize-payment-proof";
import type { InputBatch, NormalizedInputBatch, TimelineEvent, Warning } from "./types";

export function normalizeInputBatch(batch: InputBatch): NormalizedInputBatch {
  const timestamp = new Date().toISOString();

  // Normalize every proof extraction — warnings live in each proof's normalizationMetadata
  const paymentProofs = batch.paymentProofExtractions.map(normalizePaymentProof);

  // Surface all proof-level normalization warnings at the batch level for Agent 2
  const normalizationWarnings: Warning[] = paymentProofs.flatMap(
    (proof) => proof.normalizationMetadata.warnings,
  );

  const allWarnings: Warning[] = [...batch.warnings, ...normalizationWarnings];

  const timeline: TimelineEvent = {
    id: `ct_${batch.batchId}_normalize`,
    timestamp,
    agent: "Code Tools",
    action: "normalize_input_batch",
    inputSummary: [
      `Batch ${batch.batchId}:`,
      `${batch.paymentProofExtractions.length} proof extraction(s),`,
      `${batch.expectedPayments.length} expected payment(s),`,
      `${batch.bankTransactions.length} bank transaction(s)`,
    ].join(" "),
    resultSummary: [
      `Normalized ${paymentProofs.length} payment proof(s).`,
      `Emitted ${normalizationWarnings.length} normalization warning(s).`,
    ].join(" "),
    reasoning:
      "Deterministic normalization: party names stripped of legal suffixes, references stripped of punctuation, dates converted to ISO-date. No FX, matching, or scoring.",
    warnings: normalizationWarnings,
  };

  return {
    schemaVersion: "1.0.0",
    batchId: batch.batchId,
    uploadedAt: batch.uploadedAt,
    expectedPayments: batch.expectedPayments,
    bankTransactions: batch.bankTransactions,
    paymentProofs,
    warnings: allWarnings,
    timelines: [timeline],
  };
}
