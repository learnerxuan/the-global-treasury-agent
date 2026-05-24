import { describe, expect, it } from "vitest";
import {
  bankStatementTransactionSchema,
  expectedPaymentRecordSchema,
  inputBatchSchema,
  inputFileDescriptorSchema,
  paymentProofExtractionOutputSchema,
  paymentProofInputDescriptorSchema
} from "./schemas";

const expectedPayment = {
  schemaVersion: "1.0.0",
  expectedPaymentId: "exp_001",
  invoiceNumber: "INV-1001",
  issueDate: "2026-05-19",
  dueDate: "2026-06-18",
  creditor: { name: "ReconPilot Sdn Bhd", normalizedName: "RECONPILOT" },
  debtor: { name: "Acme Pte Ltd", normalizedName: "ACME" },
  creditorAccount: { iban: null, swiftBic: null, localAccountId: "MYR_MAIN_ACCOUNT", maskedAccount: "****7788" },
  debtorAccount: null,
  invoiceCurrency: "USD",
  amountDue: { value: "10.00", currency: "USD" },
  expectedSettlementCurrency: "MYR",
  paymentReference: { raw: "INV-1001", normalized: "INV1001" },
  reconciliationStatus: "OPEN",
  debtorReference: null,
  purchaseOrderReference: null,
  paymentTerms: "Due within 30 days",
  outstandingAmount: { value: "10.00", currency: "USD" },
  sourceFileId: "file_expected_001",
  sourceRowNumber: 2,
  fieldConfidence: { invoiceNumber: 1 },
  evidenceSpans: [],
  warnings: []
};

const bankTransaction = {
  schemaVersion: "1.0.0",
  internalTxId: "txn_001",
  accountId: "MYR_MAIN_ACCOUNT",
  bookingDate: "2026-05-20",
  valueDate: "2026-05-20",
  creditDebitIndicator: "CRDT",
  amount: { value: "42.50", currency: "MYR" },
  acctSvcrRef: "BNK-9001",
  normalizedReference: "INV1001",
  endToEndId: null,
  txId: null,
  debtorName: "ACME PTE LTD",
  debtorNormalizedName: "ACME",
  debtorAccount: null,
  creditorName: "ReconPilot Sdn Bhd",
  creditorNormalizedName: "RECONPILOT",
  creditorAccount: { iban: null, swiftBic: null, localAccountId: "MYR_MAIN_ACCOUNT", maskedAccount: "****7788" },
  remittanceInformation: { raw: "Payment for INV-1001", structured: { invoiceNumber: "INV-1001" } },
  description: "Foreign inward remittance INV-1001 ACME",
  rawDescription: "Foreign inward remittance INV-1001 ACME",
  sourceFileId: "file_bank_001",
  sourceRowNumber: 4,
  warnings: []
};

const proofInput = {
  schemaVersion: "1.0.0",
  fileId: "proof_file_001",
  fileName: "proof.txt",
  mimeType: "text/plain",
  inputKind: "payment_proof",
  sizeBytes: 512,
  storageRef: { kind: "local_path", uri: "runtime/uploads/proof.txt", sha256: null },
  uploadedAt: "2026-05-23T18:31:00+08:00",
  parseStatus: "PENDING",
  textLayer: true,
  tableLikely: false,
  imageQuality: "high",
  warnings: []
};

const proofExtraction = {
  schemaVersion: "1.0.0",
  proofId: "proof_001",
  sourceFileId: "proof_file_001",
  financialPayload: {
    documentType: "provider_receipt",
    paymentStatus: "ACSC",
    paymentStatusLabel: "Settled",
    rawPaymentStatus: "Paid",
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
    providerOrBankName: "Wise",
    invoiceIds: ["INV-1001"],
    endToEndId: null,
    uetr: null,
    feeAmount: null,
    netAmount: null,
    sourceAmount: { value: "10.00", currency: "USD" },
    targetAmount: null,
    exchangeRateInformation: null,
    remittanceInformation: { raw: "Payment for INV-1001", structured: { invoiceNumber: "INV-1001" } },
    rawText: "Paid USD 10.00. Reference INV-1001."
  },
  aiMetadata: {
    extractionRoute: "parse_pdf_text",
    overallConfidence: 0.96,
    fieldConfidence: {
      "financialPayload.paidAmount.value": 0.98,
      "financialPayload.paymentDate": 0.98,
      "financialPayload.reference.raw": 0.98,
      "financialPayload.debtor.rawName": 0.94,
      "financialPayload.creditor.rawName": 0.94
    },
    evidenceSpans: [],
    requiresManualReview: false,
    warnings: []
  }
};

const inputBatch = {
  schemaVersion: "1.0.0",
  batchId: "batch_001",
  uploadedAt: "2026-05-23T18:32:00+08:00",
  files: [proofInput],
  expectedPayments: [expectedPayment],
  bankTransactions: [bankTransaction],
  paymentProofInputs: [proofInput],
  paymentProofExtractions: [proofExtraction],
  warnings: []
};

describe("input schemas", () => {
  it("validates expected payment, bank transaction, proof input, proof extraction, and input batch payloads", () => {
    expect(expectedPaymentRecordSchema.safeParse(expectedPayment).success).toBe(true);
    expect(bankStatementTransactionSchema.safeParse(bankTransaction).success).toBe(true);
    expect(paymentProofInputDescriptorSchema.safeParse(proofInput).success).toBe(true);
    expect(paymentProofExtractionOutputSchema.safeParse(proofExtraction).success).toBe(true);
    expect(inputBatchSchema.safeParse(inputBatch).success).toBe(true);
  });

  it("validates a general input file descriptor with storageRef", () => {
    const result = inputFileDescriptorSchema.safeParse(proofInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.storageRef?.kind).toBe("local_path");
    }
  });

  it("rejects lowercase and unsupported currencies", () => {
    expect(expectedPaymentRecordSchema.safeParse({ ...expectedPayment, invoiceCurrency: "usd" }).success).toBe(false);
    expect(expectedPaymentRecordSchema.safeParse({ ...expectedPayment, invoiceCurrency: "JPY" }).success).toBe(false);
  });

  it("rejects invalid dates and negative money", () => {
    expect(expectedPaymentRecordSchema.safeParse({ ...expectedPayment, issueDate: "2026-02-31" }).success).toBe(false);
    expect(
      expectedPaymentRecordSchema.safeParse({
        ...expectedPayment,
        amountDue: { value: "-10.00", currency: "USD" }
      }).success
    ).toBe(false);
  });

  it("does not allow embedded proof content in payment proof descriptors", () => {
    expect(paymentProofInputDescriptorSchema.safeParse({ ...proofInput, embeddedContent: { rawText: "sample" } }).success).toBe(false);
  });

  it("allows missing raw proof reference but keeps warning support", () => {
    const result = paymentProofExtractionOutputSchema.safeParse({
      ...proofExtraction,
      financialPayload: { ...proofExtraction.financialPayload, reference: { raw: null } },
      aiMetadata: {
        ...proofExtraction.aiMetadata,
        warnings: [{ code: "MISSING_PAYMENT_REFERENCE", message: "No payment reference was found.", field: "financialPayload.reference.raw" }]
      }
    });
    expect(result.success).toBe(true);
  });

  it("requires implied FX to include source and target amounts", () => {
    const result = paymentProofExtractionOutputSchema.safeParse({
      ...proofExtraction,
      financialPayload: {
        ...proofExtraction.financialPayload,
        sourceAmount: null,
        targetAmount: null,
        exchangeRateInformation: {
          unitCurrency: "USD",
          quotedCurrency: "MYR",
          exchangeRate: "4.2500",
          rateType: "IMPLIED",
          source: "computed_implied",
          contractId: null,
          evidenceText: "Computed from sourceAmount USD 10.00 and targetAmount MYR 42.50"
        }
      }
    });
    expect(result.success).toBe(false);
  });

  it("requires manual review when payment status is not settled", () => {
    const result = paymentProofExtractionOutputSchema.safeParse({
      ...proofExtraction,
      financialPayload: { ...proofExtraction.financialPayload, paymentStatus: "PNDG" },
      aiMetadata: { ...proofExtraction.aiMetadata, requiresManualReview: false }
    });
    expect(result.success).toBe(false);
  });

  it("keeps extraction proof fields raw before normalization", () => {
    const serialized = JSON.stringify(proofExtraction);
    expect(serialized).toContain("\"debtor\":{\"rawName\"");
    expect(serialized).toContain("\"reference\":{\"raw\"");
    expect(serialized).not.toContain("normalizedName");
    expect(serialized).not.toContain("\"normalized\"");
  });
});
