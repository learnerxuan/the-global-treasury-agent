import type {
  BankStatementTransaction,
  ExpectedPaymentRecord,
  NormalizedInputBatch,
  NormalizedPaymentProofRecord
} from "../types";
import { cleanNormalizedBatch } from "../fixtures/normalized/clean";

// Agent 2 acceptance fixtures. Each is derived from the real cleanNormalizedBatch
// so they stay aligned with what the Code Tools layer actually emits.

const baseBank = cleanNormalizedBatch.bankTransactions[0]!;
const baseProof = cleanNormalizedBatch.paymentProofs[0]!;
const baseExpected = cleanNormalizedBatch.expectedPayments[0]!;

function bank(overrides: Partial<BankStatementTransaction>): BankStatementTransaction {
  return { ...baseBank, ...overrides };
}

function proof(overrides: {
  proofId?: string;
  paidAmount?: BankStatementTransaction["amount"];
  paymentDate?: string;
  status?: NormalizedPaymentProofRecord["financialPayload"]["paymentStatus"];
  referenceNormalized?: string;
  requiresManualReview?: boolean;
}): NormalizedPaymentProofRecord {
  return {
    ...baseProof,
    ...(overrides.proofId ? { proofId: overrides.proofId } : {}),
    financialPayload: {
      ...baseProof.financialPayload,
      ...(overrides.paidAmount ? { paidAmount: overrides.paidAmount } : {}),
      ...(overrides.paymentDate ? { paymentDate: overrides.paymentDate } : {}),
      ...(overrides.status ? { paymentStatus: overrides.status } : {}),
      reference: {
        raw: baseProof.financialPayload.reference.raw,
        normalized: overrides.referenceNormalized ?? baseProof.financialPayload.reference.normalized
      }
    },
    aiMetadata: {
      ...baseProof.aiMetadata,
      requiresManualReview: overrides.requiresManualReview ?? baseProof.aiMetadata.requiresManualReview
    }
  };
}

function expected(overrides: {
  expectedPaymentId?: string;
  issueDate?: string;
  amountDue?: ExpectedPaymentRecord["amountDue"];
  referenceNormalized?: string;
}): ExpectedPaymentRecord {
  return {
    ...baseExpected,
    ...(overrides.expectedPaymentId ? { expectedPaymentId: overrides.expectedPaymentId } : {}),
    ...(overrides.issueDate ? { issueDate: overrides.issueDate } : {}),
    ...(overrides.amountDue ? { amountDue: overrides.amountDue } : {}),
    paymentReference: {
      raw: baseExpected.paymentReference.raw,
      normalized: overrides.referenceNormalized ?? baseExpected.paymentReference.normalized
    }
  };
}

function batchOf(input: {
  bankTransactions: BankStatementTransaction[];
  paymentProofs: NormalizedPaymentProofRecord[];
  expectedPayments: ExpectedPaymentRecord[];
  batchId: string;
}): NormalizedInputBatch {
  return {
    schemaVersion: "1.0.0",
    batchId: input.batchId,
    uploadedAt: cleanNormalizedBatch.uploadedAt,
    expectedPayments: input.expectedPayments,
    bankTransactions: input.bankTransactions,
    paymentProofs: input.paymentProofs,
    warnings: [],
    timelines: []
  };
}

// FX date variance: proof USD 10,000 settles as MYR 42,500. Payment-date FX
// (4.2500) explains the credit exactly; invoice-date and bank-date do not.
export const fxVarianceBatch: NormalizedInputBatch = batchOf({
  batchId: "batch_fx_variance",
  bankTransactions: [
    bank({
      internalTxId: "txn_fx",
      amount: { value: "42500.00", currency: "MYR" },
      bookingDate: "2026-05-21"
    })
  ],
  paymentProofs: [proof({ paidAmount: { value: "10000.00", currency: "USD" }, paymentDate: "2026-05-20" })],
  expectedPayments: [expected({ issueDate: "2026-05-01", amountDue: { value: "10000.00", currency: "USD" } })]
});

// Short payment: expected MYR 42,500 but only MYR 41,000 received (~3.5% short).
export const shortPaymentBatch: NormalizedInputBatch = batchOf({
  batchId: "batch_short_payment",
  bankTransactions: [
    bank({
      internalTxId: "txn_short",
      amount: { value: "41000.00", currency: "MYR" },
      bookingDate: "2026-05-20"
    })
  ],
  paymentProofs: [proof({ paidAmount: { value: "10000.00", currency: "USD" }, paymentDate: "2026-05-20" })],
  expectedPayments: [expected({ issueDate: "2026-05-01", amountDue: { value: "10000.00", currency: "USD" } })]
});

// No candidate: a bank credit nothing matches.
export const noCandidateBatch: NormalizedInputBatch = batchOf({
  batchId: "batch_no_candidate",
  bankTransactions: [
    bank({
      internalTxId: "txn_orphan",
      amount: { value: "9999.99", currency: "USD" },
      normalizedReference: "ZZZNOMATCH",
      debtorNormalizedName: "NOBODY",
      remittanceInformation: { raw: "Unknown inward deposit", structured: null },
      description: "Unknown inward deposit",
      rawDescription: "Unknown inward deposit"
    })
  ],
  paymentProofs: [],
  expectedPayments: []
});

// Competing candidates: one ambiguous USD 250 credit (no invoice reference) that
// could settle either INV-2001 or INV-2002 — same payer, same amount.
export const competingBatch: NormalizedInputBatch = batchOf({
  batchId: "batch_competing",
  bankTransactions: [
    bank({
      internalTxId: "txn_competing",
      amount: { value: "250.00", currency: "USD" },
      normalizedReference: "RANDOMREF",
      remittanceInformation: { raw: "Inward remittance ACME PTE LTD", structured: null },
      description: "Inward remittance ACME PTE LTD",
      rawDescription: "Inward remittance ACME PTE LTD"
    })
  ],
  paymentProofs: [
    proof({ proofId: "proof_2001", referenceNormalized: "INV2001", paymentDate: "2026-05-20" }),
    proof({ proofId: "proof_2002", referenceNormalized: "INV2002", paymentDate: "2026-05-20" })
  ],
  expectedPayments: [
    expected({ expectedPaymentId: "exp_2001", referenceNormalized: "INV2001" }),
    expected({ expectedPaymentId: "exp_2002", referenceNormalized: "INV2002" })
  ]
});

// Pending proof: clean references but the proof is not settled (PNDG).
export const pendingProofBatch: NormalizedInputBatch = batchOf({
  batchId: "batch_pending_proof",
  bankTransactions: [bank({ internalTxId: "txn_pending" })],
  paymentProofs: [proof({ status: "PNDG", requiresManualReview: true })],
  expectedPayments: [expected({})]
});
