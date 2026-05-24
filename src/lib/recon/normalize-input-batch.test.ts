import { describe, expect, it } from "vitest";
import { normalizeInputBatch } from "./normalize-input-batch";
import type {
  BankStatementTransaction,
  ExpectedPaymentRecord,
  InputBatch,
  PaymentProofExtractionOutput,
} from "./types";

// ─── Minimal valid fixtures ───────────────────────────────────────────────────

const EXPECTED_PAYMENT: ExpectedPaymentRecord = {
  schemaVersion: "1.0.0",
  expectedPaymentId: "exp_file_001_row002",
  invoiceNumber: "INV-1001",
  issueDate: "2026-05-19",
  dueDate: null,
  creditor: { name: null, normalizedName: null },
  debtor: { name: "Acme Pte Ltd", normalizedName: "ACME" },
  creditorAccount: null,
  debtorAccount: null,
  invoiceCurrency: "USD",
  amountDue: { value: "10.00", currency: "USD" },
  expectedSettlementCurrency: "MYR",
  paymentReference: { raw: "INV-1001", normalized: "INV1001" },
  reconciliationStatus: "OPEN",
  debtorReference: null,
  purchaseOrderReference: null,
  paymentTerms: null,
  outstandingAmount: { value: "10.00", currency: "USD" },
  sourceFileId: "file_001",
  sourceRowNumber: 2,
  fieldConfidence: {},
  evidenceSpans: [],
  warnings: [],
};

const BANK_TXN: BankStatementTransaction = {
  schemaVersion: "1.0.0",
  internalTxId: "txn_bank_001_row002",
  accountId: "MYR_MAIN",
  bookingDate: "2026-05-20",
  valueDate: null,
  creditDebitIndicator: "CRDT",
  amount: { value: "42.50", currency: "MYR" },
  acctSvcrRef: null,
  endToEndId: null,
  txId: null,
  debtorName: "ACME PTE LTD",
  debtorNormalizedName: "ACME",
  debtorAccount: null,
  creditorName: null,
  creditorNormalizedName: null,
  creditorAccount: null,
  remittanceInformation: { raw: "INV-1001 payment", structured: { invoiceNumber: "INV-1001" } },
  description: "INV-1001 payment",
  rawDescription: "INV-1001 payment",
  sourceFileId: "bank_001",
  sourceRowNumber: 2,
  warnings: [],
};

// ─── Factories ────────────────────────────────────────────────────────────────

function makeExtraction(
  opts: { financialPayload?: Partial<PaymentProofExtractionOutput["financialPayload"]>; aiMetadata?: Partial<PaymentProofExtractionOutput["aiMetadata"]> } = {},
): PaymentProofExtractionOutput {
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

function makeInputBatch(opts: Partial<InputBatch> = {}): InputBatch {
  return {
    schemaVersion: "1.0.0",
    batchId: "batch_001",
    uploadedAt: "2026-05-24T00:00:00.000Z",
    files: [],
    expectedPayments: [],
    bankTransactions: [],
    paymentProofInputs: [],
    paymentProofExtractions: [],
    warnings: [],
    ...opts,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("normalizeInputBatch — output shape", () => {
  it("sets schemaVersion to 1.0.0", () => {
    const result = normalizeInputBatch(makeInputBatch());
    expect(result.schemaVersion).toBe("1.0.0");
  });

  it("copies batchId and uploadedAt from the input batch", () => {
    const result = normalizeInputBatch(makeInputBatch());
    expect(result.batchId).toBe("batch_001");
    expect(result.uploadedAt).toBe("2026-05-24T00:00:00.000Z");
  });

  it("passes expectedPayments through unchanged", () => {
    const result = normalizeInputBatch(makeInputBatch({ expectedPayments: [EXPECTED_PAYMENT] }));
    expect(result.expectedPayments).toEqual([EXPECTED_PAYMENT]);
  });

  it("passes bankTransactions through unchanged", () => {
    const result = normalizeInputBatch(makeInputBatch({ bankTransactions: [BANK_TXN] }));
    expect(result.bankTransactions).toEqual([BANK_TXN]);
  });

  it("emits exactly one timeline event", () => {
    const result = normalizeInputBatch(makeInputBatch());
    expect(result.timelines).toHaveLength(1);
  });

  it("timeline event has agent 'Code Tools'", () => {
    const result = normalizeInputBatch(makeInputBatch());
    expect(result.timelines[0]!.agent).toBe("Code Tools");
  });

  it("timeline event has action 'normalize_input_batch'", () => {
    const result = normalizeInputBatch(makeInputBatch());
    expect(result.timelines[0]!.action).toBe("normalize_input_batch");
  });

  it("timeline event id embeds the batchId", () => {
    const result = normalizeInputBatch(makeInputBatch());
    expect(result.timelines[0]!.id).toContain("batch_001");
  });

  it("timeline event timestamp is a valid ISO datetime string", () => {
    const result = normalizeInputBatch(makeInputBatch());
    expect(result.timelines[0]!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("normalizeInputBatch — proof normalization", () => {
  it("normalizes one proof extraction into a NormalizedPaymentProofRecord", () => {
    const result = normalizeInputBatch(makeInputBatch({ paymentProofExtractions: [makeExtraction()] }));
    expect(result.paymentProofs).toHaveLength(1);
    expect(result.paymentProofs[0]!.financialPayload.debtor.normalizedName).toBe("ACME");
    expect(result.paymentProofs[0]!.financialPayload.reference.normalized).toBe("INV1001");
  });

  it("normalizes multiple proof extractions", () => {
    const ext1 = makeExtraction();
    const ext2 = { ...makeExtraction(), proofId: "proof_002" };
    const result = normalizeInputBatch(makeInputBatch({ paymentProofExtractions: [ext1, ext2] }));
    expect(result.paymentProofs).toHaveLength(2);
  });

  it("produces an empty paymentProofs array when no extractions are present", () => {
    const result = normalizeInputBatch(makeInputBatch());
    expect(result.paymentProofs).toHaveLength(0);
  });

  it("each normalized proof carries a normalizationMetadata block", () => {
    const result = normalizeInputBatch(makeInputBatch({ paymentProofExtractions: [makeExtraction()] }));
    expect(result.paymentProofs[0]!.normalizationMetadata).toBeDefined();
    expect(result.paymentProofs[0]!.normalizationMetadata.toolsUsed).toContain("normalize_party_name");
  });
});

describe("normalizeInputBatch — warnings", () => {
  it("includes batch-level input warnings in the output warnings", () => {
    const batchWarning = { code: "UNMAPPED_COLUMN" as const, message: "Unknown column", field: "branch_code" };
    const result = normalizeInputBatch(makeInputBatch({ warnings: [batchWarning] }));
    expect(result.warnings).toContainEqual(batchWarning);
  });

  it("collects proof normalization warnings into the output warnings", () => {
    const result = normalizeInputBatch(
      makeInputBatch({
        paymentProofExtractions: [
          makeExtraction({ financialPayload: { paidAmount: null } }),
        ],
      }),
    );
    expect(result.warnings.some((w) => w.code === "MISSING_PAID_AMOUNT")).toBe(true);
  });

  it("surfaces proof normalization warnings in the timeline event warnings", () => {
    const result = normalizeInputBatch(
      makeInputBatch({
        paymentProofExtractions: [
          makeExtraction({ financialPayload: { debtor: { rawName: null } } }),
        ],
      }),
    );
    expect(result.timelines[0]!.warnings.some((w) => w.code === "MISSING_DEBTOR")).toBe(true);
  });

  it("has no warnings for a clean batch with a clean proof", () => {
    const result = normalizeInputBatch(makeInputBatch({ paymentProofExtractions: [makeExtraction()] }));
    expect(result.warnings).toHaveLength(0);
    expect(result.timelines[0]!.warnings).toHaveLength(0);
  });

  it("combines batch warnings and normalization warnings without deduplication", () => {
    const batchWarning = { code: "UNMAPPED_COLUMN" as const, message: "Unknown column", field: "x" };
    const result = normalizeInputBatch(
      makeInputBatch({
        warnings: [batchWarning],
        paymentProofExtractions: [
          makeExtraction({ financialPayload: { paidAmount: null } }),
        ],
      }),
    );
    expect(result.warnings.some((w) => w.code === "UNMAPPED_COLUMN")).toBe(true);
    expect(result.warnings.some((w) => w.code === "MISSING_PAID_AMOUNT")).toBe(true);
  });
});
