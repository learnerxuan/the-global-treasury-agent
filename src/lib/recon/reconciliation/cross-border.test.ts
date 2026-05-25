import { describe, expect, it } from "vitest";
import { cleanNormalizedBatch } from "../fixtures/normalized/clean";
import type {
  BankStatementTransaction,
  ExpectedPaymentRecord,
  NormalizedInputBatch,
  NormalizedPaymentProofRecord
} from "../types";
import { calculateFxScenarios } from "./calculate-fx-scenarios";
import { generateBankAnchoredCandidates } from "./generate-candidates";
import { runReconciliationOrchestrator } from "./orchestrator";
import { DEFAULT_POLICY } from "./policy";
import type { CandidateSet, FxScenarioResult, MatchCandidate, ToolResult } from "./types";

function unwrap<T>(result: ToolResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function firstCandidate(set: CandidateSet): MatchCandidate {
  const candidate = set.candidatesByBankTx["txn_cb"]?.[0];
  if (!candidate) throw new Error("no candidate generated for txn_cb");
  return candidate;
}

const baseBank = cleanNormalizedBatch.bankTransactions[0]!;
const baseProof = cleanNormalizedBatch.paymentProofs[0]!;
const baseExpected = cleanNormalizedBatch.expectedPayments[0]!;

// A cross-border credit: invoice + proof are in AUD (no FX fixture exists), and
// the MYR bank credit records its own sourceAmount + exchangeRateApplied.
function crossBorderBatch(opts: {
  proofRef: string;
  invoiceRef: string;
  bankRef: string;
  status?: NormalizedPaymentProofRecord["financialPayload"]["paymentStatus"];
  bankRate?: string | null;
}): NormalizedInputBatch {
  const bank = {
    ...baseBank,
    internalTxId: "txn_cb",
    creditDebitIndicator: "CRDT",
    amount: { value: "39260.00", currency: "MYR" },
    sourceAmount: { value: "13500.00", currency: "AUD" },
    exchangeRateApplied: opts.bankRate === undefined ? "2.9100" : opts.bankRate,
    netCreditAmount: { value: "39260.00", currency: "MYR" },
    normalizedReference: opts.bankRef,
    debtorNormalizedName: null,
    bookingDate: "2026-05-18",
    remittanceInformation: { raw: opts.bankRef, structured: { invoiceNumber: opts.bankRef, creditorReference: opts.bankRef, additionalInfo: null } }
  } as BankStatementTransaction;

  const proof = {
    ...baseProof,
    proofId: "proof_cb",
    financialPayload: {
      ...baseProof.financialPayload,
      paidAmount: { value: "13500.00", currency: "AUD" },
      paymentDate: "2026-05-18",
      paymentStatus: opts.status ?? "ACSC",
      reference: { raw: opts.proofRef, normalized: opts.proofRef },
      debtor: { name: "PACIFIC CLOUD", normalizedName: "PACIFIC CLOUD" }
    }
  } as NormalizedPaymentProofRecord;

  const expected = {
    ...baseExpected,
    expectedPaymentId: "exp_cb",
    invoiceNumber: "RCN-1010",
    issueDate: "2026-05-10",
    amountDue: { value: "13500.00", currency: "AUD" },
    invoiceCurrency: "AUD",
    paymentReference: { raw: opts.invoiceRef, normalized: opts.invoiceRef },
    debtor: { name: "PACIFIC CLOUD", normalizedName: "PACIFIC CLOUD" }
  } as ExpectedPaymentRecord;

  return {
    schemaVersion: "1.0.0",
    batchId: "cb",
    uploadedAt: new Date().toISOString(),
    expectedPayments: [expected],
    bankTransactions: [bank],
    paymentProofs: [proof],
    warnings: [],
    timelines: []
  };
}

describe("cross-border reconciliation (regression)", () => {
  it("builds a bank-recorded FX scenario for a currency with no fixture (AUD)", () => {
    const batch = crossBorderBatch({ proofRef: "RCN1010", invoiceRef: "RCN1010", bankRef: "RCN1010" });
    const candidate = firstCandidate(unwrap(generateBankAnchoredCandidates({ batch, policy: DEFAULT_POLICY })));

    const scenarios = unwrap(calculateFxScenarios({ candidate, policy: DEFAULT_POLICY }));
    const bankScenario = scenarios.find((s: FxScenarioResult) => s.basis === "bank_statement");
    expect(bankScenario).toBeDefined();
    expect(bankScenario?.rateSource).toBe("bank");
    // 13500 AUD * 2.9100 = 39285 vs 39260 credit -> tiny residual.
    expect(bankScenario?.residualPercent).toBeLessThan(0.005);
  });

  it("matches a foreign proof to a bank credit via bank.sourceAmount (not local amount)", () => {
    const batch = crossBorderBatch({ proofRef: "PPREF999", invoiceRef: "RCN1010", bankRef: "WISE12345" });
    // The proof is 13500 AUD; bank credit is 39260 MYR with sourceAmount 13500 AUD.
    // Without the sourceAmount bridge no candidate would form.
    const candidate = firstCandidate(unwrap(generateBankAnchoredCandidates({ batch, policy: DEFAULT_POLICY })));
    expect(candidate.signals.map((s) => s.code)).toContain("AMOUNT_EQUALS_BANK");
  });

  it("detects partial reference matches (RP1005 vs RP20261005)", () => {
    const batch = crossBorderBatch({ proofRef: "RP1005", invoiceRef: "RP20261005", bankRef: "SCX001" });
    const candidate = firstCandidate(unwrap(generateBankAnchoredCandidates({ batch, policy: DEFAULT_POLICY })));
    expect(candidate.signals.map((s) => s.code)).toContain("PARTIAL_REFERENCE_MATCH");
  });

  it("AUTO_MATCHES a clean settled cross-border case", () => {
    const batch = crossBorderBatch({ proofRef: "RCN1010", invoiceRef: "RCN1010", bankRef: "RCN1010", status: "ACSC" });
    const out = runReconciliationOrchestrator(batch);
    const result = out.results.find((r) => r.proofId === "proof_cb");
    expect(result?.status).toBe("AUTO_MATCHED");
    expect(result?.expectedPaymentId).toBe("exp_cb");
  });

  it("still AUTO_MATCHES when proof status is UNKNOWN (settlement is proven by the bank credit, not the status word)", () => {
    const batch = crossBorderBatch({ proofRef: "RCN1010", invoiceRef: "RCN1010", bankRef: "RCN1010", status: "UNKNOWN" });
    const out = runReconciliationOrchestrator(batch);
    const result = out.results.find((r) => r.proofId === "proof_cb");
    expect(result?.status).toBe("AUTO_MATCHED");
  });
});
