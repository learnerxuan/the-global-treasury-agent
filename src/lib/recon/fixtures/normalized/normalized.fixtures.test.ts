import { describe, expect, it } from "vitest";
import {
  ambiguousReferenceNormalizedBatch,
  cleanNormalizedBatch,
  missingReferenceNormalizedBatch,
  weakConfidenceNormalizedBatch,
} from "./index";

// Smoke-tests that validate the shape Agent 2 will receive for each scenario.

describe("cleanNormalizedBatch", () => {
  it("has schema version 1.0.0", () => {
    expect(cleanNormalizedBatch.schemaVersion).toBe("1.0.0");
  });

  it("has batchId batch_clean_001", () => {
    expect(cleanNormalizedBatch.batchId).toBe("batch_clean_001");
  });

  it("carries 2 expected payments", () => {
    expect(cleanNormalizedBatch.expectedPayments).toHaveLength(2);
  });

  it("carries 2 bank transactions", () => {
    expect(cleanNormalizedBatch.bankTransactions).toHaveLength(2);
  });

  it("carries 2 normalized payment proofs", () => {
    expect(cleanNormalizedBatch.paymentProofs).toHaveLength(2);
  });

  it("has no batch-level warnings", () => {
    expect(cleanNormalizedBatch.warnings).toHaveLength(0);
  });

  it("proof[0] debtor normalizes to ACME", () => {
    expect(cleanNormalizedBatch.paymentProofs[0]!.financialPayload.debtor.normalizedName).toBe("ACME");
  });

  it("proof[1] debtor normalizes to BETA", () => {
    expect(cleanNormalizedBatch.paymentProofs[1]!.financialPayload.debtor.normalizedName).toBe("BETA");
  });

  it("proof[0] reference normalizes to INV1001", () => {
    expect(cleanNormalizedBatch.paymentProofs[0]!.financialPayload.reference.normalized).toBe("INV1001");
  });

  it("proof[1] reference normalizes to INV1002", () => {
    expect(cleanNormalizedBatch.paymentProofs[1]!.financialPayload.reference.normalized).toBe("INV1002");
  });

  it("has a single Code Tools timeline event", () => {
    expect(cleanNormalizedBatch.timelines).toHaveLength(1);
    expect(cleanNormalizedBatch.timelines[0]!.agent).toBe("Code Tools");
  });

  it("normalizationMetadata.normalizedAt is a valid ISO datetime", () => {
    expect(cleanNormalizedBatch.paymentProofs[0]!.normalizationMetadata.normalizedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });
});

describe("weakConfidenceNormalizedBatch", () => {
  it("has batchId batch_weak_001", () => {
    expect(weakConfidenceNormalizedBatch.batchId).toBe("batch_weak_001");
  });

  it("emits LOW_CONFIDENCE_EXTRACTION warning", () => {
    expect(weakConfidenceNormalizedBatch.warnings.some((w) => w.code === "LOW_CONFIDENCE_EXTRACTION")).toBe(true);
  });

  it("proof aiMetadata.requiresManualReview is true", () => {
    expect(weakConfidenceNormalizedBatch.paymentProofs[0]!.aiMetadata.requiresManualReview).toBe(true);
  });

  it("proof still normalizes despite low confidence", () => {
    expect(weakConfidenceNormalizedBatch.paymentProofs[0]!.financialPayload.debtor.normalizedName).toBe("GAMMA");
    expect(weakConfidenceNormalizedBatch.paymentProofs[0]!.financialPayload.reference.normalized).toBe("INV1003");
  });
});

describe("missingReferenceNormalizedBatch", () => {
  it("has batchId batch_noref_001", () => {
    expect(missingReferenceNormalizedBatch.batchId).toBe("batch_noref_001");
  });

  it("emits MISSING_PAYMENT_REFERENCE warning", () => {
    expect(missingReferenceNormalizedBatch.warnings.some((w) => w.code === "MISSING_PAYMENT_REFERENCE")).toBe(true);
  });

  it("proof reference.raw is null", () => {
    expect(missingReferenceNormalizedBatch.paymentProofs[0]!.financialPayload.reference.raw).toBeNull();
  });

  it("proof reference.normalized is null", () => {
    expect(missingReferenceNormalizedBatch.paymentProofs[0]!.financialPayload.reference.normalized).toBeNull();
  });

  it("proof debtor still normalizes to DELTA", () => {
    expect(missingReferenceNormalizedBatch.paymentProofs[0]!.financialPayload.debtor.normalizedName).toBe("DELTA");
  });

  it("normalize_reference is absent from toolsUsed", () => {
    expect(missingReferenceNormalizedBatch.paymentProofs[0]!.normalizationMetadata.toolsUsed).not.toContain(
      "normalize_reference",
    );
  });
});

describe("ambiguousReferenceNormalizedBatch", () => {
  it("has batchId batch_ambig_001", () => {
    expect(ambiguousReferenceNormalizedBatch.batchId).toBe("batch_ambig_001");
  });

  it("has zero normalization warnings — ambiguity is a matching concern, not normalization", () => {
    expect(ambiguousReferenceNormalizedBatch.warnings).toHaveLength(0);
  });

  it("proof reference normalizes to INV2001", () => {
    expect(ambiguousReferenceNormalizedBatch.paymentProofs[0]!.financialPayload.reference.normalized).toBe("INV2001");
  });

  it("expected payment[0] reference is INV2001A", () => {
    expect(ambiguousReferenceNormalizedBatch.expectedPayments[0]!.paymentReference.normalized).toBe("INV2001A");
  });

  it("expected payment[1] reference is INV2001B", () => {
    expect(ambiguousReferenceNormalizedBatch.expectedPayments[1]!.paymentReference.normalized).toBe("INV2001B");
  });

  it("proof INV2001 does not exactly match either expected payment reference", () => {
    const proofRef = ambiguousReferenceNormalizedBatch.paymentProofs[0]!.financialPayload.reference.normalized;
    const epRefs = ambiguousReferenceNormalizedBatch.expectedPayments.map((ep) => ep.paymentReference.normalized);
    expect(epRefs).not.toContain(proofRef);
  });
});
