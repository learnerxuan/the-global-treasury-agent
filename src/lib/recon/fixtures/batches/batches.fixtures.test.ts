import { describe, expect, it } from "vitest";
import { normalizeInputBatch } from "../../normalize-input-batch";
import { ambiguousReferenceBatch } from "./ambiguous-reference-batch";
import { cleanBatch } from "./clean-batch";
import { missingReferenceBatch } from "./missing-reference-batch";
import { weakConfidenceBatch } from "./weak-confidence-batch";

// ─── Clean batch ──────────────────────────────────────────────────────────────

describe("clean batch", () => {
  const result = normalizeInputBatch(cleanBatch);

  it("produces no warnings", () => {
    expect(result.warnings).toHaveLength(0);
  });

  it("normalizes both proof extractions", () => {
    expect(result.paymentProofs).toHaveLength(2);
  });

  it("normalizes debtor name on proof 1 — Acme Pte Ltd → ACME", () => {
    expect(result.paymentProofs[0]!.financialPayload.debtor.normalizedName).toBe("ACME");
  });

  it("normalizes debtor name on proof 2 — Beta Sdn Bhd → BETA", () => {
    expect(result.paymentProofs[1]!.financialPayload.debtor.normalizedName).toBe("BETA");
  });

  it("normalizes reference on proof 1 — INV-1001 → INV1001", () => {
    expect(result.paymentProofs[0]!.financialPayload.reference.normalized).toBe("INV1001");
  });

  it("normalizes reference on proof 2 — INV-1002 → INV1002", () => {
    expect(result.paymentProofs[1]!.financialPayload.reference.normalized).toBe("INV1002");
  });

  it("passes expected payments through unchanged", () => {
    expect(result.expectedPayments).toEqual(cleanBatch.expectedPayments);
  });

  it("passes bank transactions through unchanged", () => {
    expect(result.bankTransactions).toEqual(cleanBatch.bankTransactions);
  });

  it("emits a Code Tools timeline event", () => {
    expect(result.timelines[0]!.agent).toBe("Code Tools");
  });
});

// ─── Weak-confidence batch ─────────────────────────────────────────────────────

describe("weak-confidence batch", () => {
  const result = normalizeInputBatch(weakConfidenceBatch);

  it("emits LOW_CONFIDENCE_EXTRACTION warning (overallConfidence 0.42 < 0.60)", () => {
    expect(result.warnings.some((w) => w.code === "LOW_CONFIDENCE_EXTRACTION")).toBe(true);
  });

  it("still normalizes the proof debtor and reference", () => {
    expect(result.paymentProofs[0]!.financialPayload.debtor.normalizedName).toBe("GAMMA");
    expect(result.paymentProofs[0]!.financialPayload.reference.normalized).toBe("INV1003");
  });

  it("surfaces LOW_CONFIDENCE_EXTRACTION in the timeline event warnings", () => {
    expect(result.timelines[0]!.warnings.some((w) => w.code === "LOW_CONFIDENCE_EXTRACTION")).toBe(true);
  });
});

// ─── Missing-reference batch ──────────────────────────────────────────────────

describe("missing-reference batch", () => {
  const result = normalizeInputBatch(missingReferenceBatch);

  it("emits MISSING_PAYMENT_REFERENCE warning", () => {
    expect(result.warnings.some((w) => w.code === "MISSING_PAYMENT_REFERENCE")).toBe(true);
  });

  it("proof reference.raw and normalized are both null", () => {
    expect(result.paymentProofs[0]!.financialPayload.reference.raw).toBeNull();
    expect(result.paymentProofs[0]!.financialPayload.reference.normalized).toBeNull();
  });

  it("still normalizes the proof debtor name — Delta Ltd → DELTA", () => {
    expect(result.paymentProofs[0]!.financialPayload.debtor.normalizedName).toBe("DELTA");
  });

  it("does not include normalize_reference in toolsUsed for that proof", () => {
    expect(result.paymentProofs[0]!.normalizationMetadata.toolsUsed).not.toContain("normalize_reference");
  });
});

// ─── Ambiguous-reference batch ─────────────────────────────────────────────────

describe("ambiguous-reference batch", () => {
  const result = normalizeInputBatch(ambiguousReferenceBatch);

  it("produces no normalization warnings (proof itself is clean)", () => {
    expect(result.warnings).toHaveLength(0);
  });

  it("normalizes proof reference INV-2001 → INV2001", () => {
    expect(result.paymentProofs[0]!.financialPayload.reference.normalized).toBe("INV2001");
  });

  it("expected payment references normalize to INV2001A and INV2001B", () => {
    expect(result.expectedPayments[0]!.paymentReference.normalized).toBe("INV2001A");
    expect(result.expectedPayments[1]!.paymentReference.normalized).toBe("INV2001B");
  });

  it("INV2001 does not exactly match INV2001A or INV2001B — ambiguity is preserved for Agent 2", () => {
    const proofRef = result.paymentProofs[0]!.financialPayload.reference.normalized;
    const refs = result.expectedPayments.map((ep) => ep.paymentReference.normalized);
    expect(refs).not.toContain(proofRef);
  });
});
