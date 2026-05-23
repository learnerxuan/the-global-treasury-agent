import type { BankStatementTransaction, ExpectedPaymentRecord, InputBatch, PaymentProofExtractionOutput, PaymentProofInputDescriptor } from "../types.js";

export const expectedPaymentFixture: ExpectedPaymentRecord = {
  schemaVersion: "1.0.0",
  expectedPaymentId: "exp_001",
  invoiceNumber: "INV-1001",
  issueDate: "2026-05-19",
  dueDate: "2026-06-18",
  creditor: { name: "ReconPilot Sdn Bhd", normalizedName: "RECONPILOT" },
  debtor: { name: "Acme Pte Ltd", normalizedName: "ACME" },
  creditorAccount: { iban: null, swiftBic: null, localAccountId: "MYR_MAIN_ACCOUNT", maskedAccount: "****7788" },
  debtorAccount: { iban: null, swiftBic: null, localAccountId: null, maskedAccount: null },
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
  fieldConfidence: {
    invoiceNumber: 1,
    "amountDue.value": 1,
    "amountDue.currency": 1,
    "debtor.name": 1
  },
  evidenceSpans: [
    {
      field: "invoiceNumber",
      value: "INV-1001",
      originalValue: "INV-1001",
      normalizedValue: "INV1001",
      confidence: 1,
      source: "csv",
      evidenceText: "invoice_number=INV-1001",
      page: null,
      bbox: null,
      warnings: []
    }
  ],
  warnings: []
};

export const bankStatementFixture: BankStatementTransaction = {
  schemaVersion: "1.0.0",
  internalTxId: "txn_001",
  accountId: "MYR_MAIN_ACCOUNT",
  bookingDate: "2026-05-20",
  valueDate: "2026-05-20",
  creditDebitIndicator: "CRDT",
  amount: { value: "42.50", currency: "MYR" },
  acctSvcrRef: "BNK-9001",
  endToEndId: null,
  txId: null,
  debtorName: "ACME PTE LTD",
  debtorNormalizedName: "ACME",
  debtorAccount: { iban: null, swiftBic: null, localAccountId: null, maskedAccount: null },
  creditorName: "ReconPilot Sdn Bhd",
  creditorNormalizedName: "RECONPILOT",
  creditorAccount: { iban: null, swiftBic: null, localAccountId: "MYR_MAIN_ACCOUNT", maskedAccount: "****7788" },
  remittanceInformation: {
    raw: "Payment for INV-1001",
    structured: { invoiceNumber: "INV-1001" }
  },
  description: "Foreign inward remittance INV-1001 ACME",
  rawDescription: "Foreign inward remittance INV-1001 ACME",
  sourceFileId: "file_bank_001",
  sourceRowNumber: 4,
  warnings: []
};

export const paymentProofInputFixture: PaymentProofInputDescriptor = {
  schemaVersion: "1.0.0",
  fileId: "proof_file_001",
  fileName: "wise-transfer-inv-1001.pdf",
  mimeType: "application/pdf",
  inputKind: "payment_proof",
  sizeBytes: 248910,
  storageRef: {
    kind: "local_path",
    uri: "src/lib/recon/fixtures/proofs/wise-transfer-inv-1001.pdf",
    sha256: null
  },
  uploadedAt: "2026-05-23T18:31:00+08:00",
  parseStatus: "PENDING",
  textLayer: true,
  tableLikely: false,
  imageQuality: "high",
  demoFixture: {
    rawText:
      "Wise transfer receipt. Paid USD 10.00 to ReconPilot Sdn Bhd. Reference INV-1001. Exchange rate: 1 USD = 4.2500 MYR. Date 2026-05-20.",
    rawTable: null,
    rawOcr: null
  },
  warnings: []
};

export const paymentProofExtractionFixture: PaymentProofExtractionOutput = {
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
    debtorAccount: { iban: null, swiftBic: "WISEGB22", localAccountId: null, maskedAccount: "****1234" },
    creditorAccount: { iban: null, swiftBic: null, localAccountId: "MYR_MAIN_ACCOUNT", maskedAccount: "****7788" },
    paidAmount: { value: "10.00", currency: "USD" },
    paymentDate: "2026-05-20",
    valueDate: null,
    bookingDate: null,
    reference: { raw: "INV-1001" },
    providerTransactionId: "WISE-TRX-88291",
    providerOrBankName: "Wise",
    invoiceIds: ["INV-1001"],
    endToEndId: null,
    uetr: null,
    feeAmount: null,
    netAmount: null,
    sourceAmount: { value: "10.00", currency: "USD" },
    targetAmount: { value: "42.50", currency: "MYR" },
    exchangeRateInformation: {
      unitCurrency: "USD",
      quotedCurrency: "MYR",
      exchangeRate: "4.2500",
      rateType: "AGREED",
      source: "payment_proof",
      contractId: null,
      evidenceText: "Exchange rate: 1 USD = 4.2500 MYR"
    },
    remittanceInformation: {
      raw: "Payment for INV-1001",
      structured: { invoiceNumber: "INV-1001" }
    },
    rawText:
      "Wise transfer receipt. Paid USD 10.00 to ReconPilot Sdn Bhd. Reference INV-1001. Exchange rate: 1 USD = 4.2500 MYR. Date 2026-05-20."
  },
  aiMetadata: {
    extractionRoute: "parse_pdf_text",
    overallConfidence: 0.96,
    fieldConfidence: {
      "financialPayload.debtor.rawName": 0.94,
      "financialPayload.creditor.rawName": 0.96,
      "financialPayload.paidAmount.value": 0.99,
      "financialPayload.paidAmount.currency": 0.99,
      "financialPayload.paymentDate": 0.98,
      "financialPayload.reference.raw": 0.97,
      "financialPayload.exchangeRateInformation.exchangeRate": 0.95
    },
    evidenceSpans: [
      {
        field: "financialPayload.paidAmount.value",
        value: "10.00",
        originalValue: "USD 10.00",
        normalizedValue: "10.00",
        confidence: 0.99,
        source: "pdf_text",
        evidenceText: "Paid USD 10.00",
        page: 1,
        bbox: null,
        warnings: []
      }
    ],
    requiresManualReview: false,
    warnings: []
  }
};

export const inputBatchFixture: InputBatch = {
  schemaVersion: "1.0.0",
  batchId: "batch_001",
  uploadedAt: "2026-05-23T18:32:00+08:00",
  files: [
    {
      schemaVersion: "1.0.0",
      fileId: "file_expected_001",
      fileName: "expected-payments.csv",
      mimeType: "text/csv",
      inputKind: "expected_payment_records",
      sizeBytes: 12240,
      storageRef: {
        kind: "local_path",
        uri: "src/lib/recon/fixtures/expected-payments.csv",
        sha256: null
      },
      uploadedAt: "2026-05-23T18:30:00+08:00",
      parseStatus: "PARSED",
      warnings: []
    }
  ],
  expectedPayments: [expectedPaymentFixture],
  bankTransactions: [bankStatementFixture],
  paymentProofInputs: [paymentProofInputFixture],
  paymentProofExtractions: [paymentProofExtractionFixture],
  warnings: []
};
