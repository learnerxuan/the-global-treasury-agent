import { describe, expect, it } from "vitest";
import { normalizePaymentProof } from "./normalize-payment-proof";
import type { PaymentProofExtractionOutput } from "./types";

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeExtraction(opts: {
  financialPayload?: Partial<PaymentProofExtractionOutput["financialPayload"]>;
  aiMetadata?: Partial<PaymentProofExtractionOutput["aiMetadata"]>;
} = {}): PaymentProofExtractionOutput {
  return {
    schemaVersion: "1.0.0",
    proofId: "proof_001",
    sourceFileId: "file_001",
    financialPayload: {
      documentType: "bank_advice",
      paymentStatus: "ACSC",
      paymentStatusLabel: null,
      rawPaymentStatus: "ACSC",
      debtor: { rawName: "Acme Pte Ltd" },
      creditor: { rawName: "ReconPilot Sdn Bhd" },
      debtorAccount: null,
      creditorAccount: null,
      paidAmount: { value: "10.00", currency: "USD" },
      paymentDate: "2026-05-20",
      valueDate: null,
      bookingDate: null,
      reference: { raw: "INV-1001" },
      providerTransactionId: null,
      providerOrBankName: null,
      invoiceIds: [],
      endToEndId: null,
      uetr: null,
      feeAmount: null,
      netAmount: null,
      sourceAmount: null,
      targetAmount: null,
      exchangeRateInformation: null,
      remittanceInformation: { raw: null, structured: null },
      rawText: null,
      ...opts.financialPayload,
    },
    aiMetadata: {
      extractionRoute: "parse_pdf_text",
      overallConfidence: 0.95,
      fieldConfidence: {},
      evidenceSpans: [],
      requiresManualReview: false,
      warnings: [],
      ...opts.aiMetadata,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("normalizePaymentProof — happy path", () => {
  it("sets schemaVersion to 1.0.0", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.schemaVersion).toBe("1.0.0");
  });

  it("copies proofId and sourceFileId", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.proofId).toBe("proof_001");
    expect(result.sourceFileId).toBe("file_001");
  });

  it("normalizes debtor name — preserves raw, strips legal suffix", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.financialPayload.debtor.name).toBe("Acme Pte Ltd");
    expect(result.financialPayload.debtor.normalizedName).toBe("ACME");
  });

  it("normalizes creditor name — preserves raw, strips legal suffix", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.financialPayload.creditor.name).toBe("ReconPilot Sdn Bhd");
    expect(result.financialPayload.creditor.normalizedName).toBe("RECONPILOT");
  });

  it("normalizes payment reference — preserves raw, strips hyphens", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.financialPayload.reference.raw).toBe("INV-1001");
    expect(result.financialPayload.reference.normalized).toBe("INV1001");
  });

  it("preserves aiMetadata unchanged", () => {
    const extraction = makeExtraction();
    const result = normalizePaymentProof(extraction);
    expect(result.aiMetadata).toEqual(extraction.aiMetadata);
  });

  it("records normalizedAt as a valid ISO datetime", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.normalizationMetadata.normalizedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("preserves paidAmount unchanged", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.financialPayload.paidAmount).toEqual({ value: "10.00", currency: "USD" });
  });

  it("emits no normalization warnings for a clean extraction", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.normalizationMetadata.warnings).toHaveLength(0);
  });

  it("includes normalize_party_name in toolsUsed when names are present", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.normalizationMetadata.toolsUsed).toContain("normalize_party_name");
  });

  it("includes normalize_reference in toolsUsed when reference is present", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.normalizationMetadata.toolsUsed).toContain("normalize_reference");
  });

  it("includes normalize_date in toolsUsed when paymentDate is present", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.normalizationMetadata.toolsUsed).toContain("normalize_date");
  });
});

describe("normalizePaymentProof — date normalization", () => {
  it("strips time component from ISO datetime paymentDate", () => {
    const result = normalizePaymentProof(makeExtraction({
      financialPayload: { paymentDate: "2026-05-20T18:30:00+08:00" },
    }));
    expect(result.financialPayload.paymentDate).toBe("2026-05-20");
  });

  it("preserves ISO date paymentDate unchanged", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.financialPayload.paymentDate).toBe("2026-05-20");
  });

  it("passes null paymentDate through as null", () => {
    const result = normalizePaymentProof(makeExtraction({
      financialPayload: { paymentDate: null },
    }));
    expect(result.financialPayload.paymentDate).toBeNull();
  });

  it("does not include normalize_date in toolsUsed when all dates are null", () => {
    const result = normalizePaymentProof(makeExtraction({
      financialPayload: { paymentDate: null, valueDate: null, bookingDate: null },
    }));
    expect(result.normalizationMetadata.toolsUsed).not.toContain("normalize_date");
  });
});

describe("normalizePaymentProof — missing fields", () => {
  it("emits MISSING_DEBTOR when debtor.rawName is null", () => {
    const result = normalizePaymentProof(makeExtraction({
      financialPayload: { debtor: { rawName: null } },
    }));
    expect(result.normalizationMetadata.warnings.some((w) => w.code === "MISSING_DEBTOR")).toBe(true);
  });

  it("sets debtor.name to null when rawName is null", () => {
    const result = normalizePaymentProof(makeExtraction({
      financialPayload: { debtor: { rawName: null } },
    }));
    expect(result.financialPayload.debtor.name).toBeNull();
    expect(result.financialPayload.debtor.normalizedName).toBeNull();
  });

  it("emits MISSING_CREDITOR when creditor.rawName is null", () => {
    const result = normalizePaymentProof(makeExtraction({
      financialPayload: { creditor: { rawName: null } },
    }));
    expect(result.normalizationMetadata.warnings.some((w) => w.code === "MISSING_CREDITOR")).toBe(true);
  });

  it("emits MISSING_PAYMENT_REFERENCE when reference.raw is null", () => {
    const result = normalizePaymentProof(makeExtraction({
      financialPayload: { reference: { raw: null } },
    }));
    expect(result.normalizationMetadata.warnings.some((w) => w.code === "MISSING_PAYMENT_REFERENCE")).toBe(true);
  });

  it("does not include normalize_reference in toolsUsed when reference is null", () => {
    const result = normalizePaymentProof(makeExtraction({
      financialPayload: { reference: { raw: null } },
    }));
    expect(result.normalizationMetadata.toolsUsed).not.toContain("normalize_reference");
  });

  it("emits MISSING_PAID_AMOUNT when paidAmount is null", () => {
    const result = normalizePaymentProof(makeExtraction({
      financialPayload: { paidAmount: null },
    }));
    expect(result.normalizationMetadata.warnings.some((w) => w.code === "MISSING_PAID_AMOUNT")).toBe(true);
  });

  it("emits MISSING_PAYMENT_DATE when paymentDate is null", () => {
    const result = normalizePaymentProof(makeExtraction({
      financialPayload: { paymentDate: null },
    }));
    expect(result.normalizationMetadata.warnings.some((w) => w.code === "MISSING_PAYMENT_DATE")).toBe(true);
  });
});

describe("normalizePaymentProof — payment status", () => {
  it("emits PAYMENT_NOT_SETTLED when paymentStatus is not ACSC", () => {
    const result = normalizePaymentProof(makeExtraction({
      financialPayload: { paymentStatus: "PNDG" },
      aiMetadata: { requiresManualReview: true },
    }));
    expect(result.normalizationMetadata.warnings.some((w) => w.code === "PAYMENT_NOT_SETTLED")).toBe(true);
  });

  it("does not emit PAYMENT_NOT_SETTLED when paymentStatus is ACSC", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.normalizationMetadata.warnings.some((w) => w.code === "PAYMENT_NOT_SETTLED")).toBe(false);
  });
});

describe("normalizePaymentProof — confidence", () => {
  it("emits LOW_CONFIDENCE_EXTRACTION when overallConfidence is below 0.60", () => {
    const result = normalizePaymentProof(makeExtraction({
      aiMetadata: { overallConfidence: 0.55 },
    }));
    expect(result.normalizationMetadata.warnings.some((w) => w.code === "LOW_CONFIDENCE_EXTRACTION")).toBe(true);
  });

  it("does not emit LOW_CONFIDENCE_EXTRACTION when overallConfidence is exactly 0.60", () => {
    const result = normalizePaymentProof(makeExtraction({
      aiMetadata: { overallConfidence: 0.60 },
    }));
    expect(result.normalizationMetadata.warnings.some((w) => w.code === "LOW_CONFIDENCE_EXTRACTION")).toBe(false);
  });

  it("does not emit LOW_CONFIDENCE_EXTRACTION when overallConfidence is above 0.60", () => {
    const result = normalizePaymentProof(makeExtraction());
    expect(result.normalizationMetadata.warnings.some((w) => w.code === "LOW_CONFIDENCE_EXTRACTION")).toBe(false);
  });
});
