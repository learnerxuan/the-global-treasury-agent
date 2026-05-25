import { describe, expect, it } from "vitest";
import type {
  BankStatementTransaction,
  ExchangeRateInformation,
  NormalizedPaymentProofRecord
} from "../types";
import { cleanNormalizedBatch } from "../fixtures/normalized/clean";
import { calculateFxScenarios } from "./calculate-fx-scenarios";
import { DEFAULT_POLICY } from "./policy";
import type { MatchCandidate } from "./types";

// Build a candidate by overriding fields on real normalized fixture records.
function buildCandidate(overrides: {
  paidAmount?: { value: string; currency: "MYR" | "USD" | "SGD" | "EUR" };
  expectedAmount?: { value: string; currency: "MYR" | "USD" | "SGD" | "EUR" };
  paymentDate?: string;
  bankAmount?: { value: string; currency: "MYR" | "USD" | "SGD" | "EUR" };
  bankDate?: string;
  issueDate?: string;
  proofRate?: ExchangeRateInformation | null;
  includeExpected?: boolean;
}): MatchCandidate {
  const baseProof = cleanNormalizedBatch.paymentProofs[0]!;
  const baseBank = cleanNormalizedBatch.bankTransactions[0]!;
  const baseExpected = cleanNormalizedBatch.expectedPayments[0]!;

  const proof: NormalizedPaymentProofRecord = {
    ...baseProof,
    financialPayload: {
      ...baseProof.financialPayload,
      paidAmount: overrides.paidAmount ?? baseProof.financialPayload.paidAmount,
      paymentDate: overrides.paymentDate ?? baseProof.financialPayload.paymentDate,
      exchangeRateInformation:
        overrides.proofRate === undefined
          ? baseProof.financialPayload.exchangeRateInformation
          : overrides.proofRate
    }
  };

  const bankTransaction: BankStatementTransaction = {
    ...baseBank,
    amount: overrides.bankAmount ?? baseBank.amount,
    bookingDate: overrides.bankDate ?? baseBank.bookingDate
  };

  const expectedPayment = overrides.includeExpected === false
    ? undefined
    : {
        ...baseExpected,
        issueDate: overrides.issueDate ?? baseExpected.issueDate,
        amountDue: overrides.expectedAmount ?? baseExpected.amountDue,
        invoiceCurrency: (overrides.expectedAmount ?? baseExpected.amountDue).currency
      };

  return {
    candidateId: "CAND-001",
    candidateKind: expectedPayment ? "single_invoice" : "proof_only",
    bankTransactionId: bankTransaction.internalTxId,
    proofId: proof.proofId,
    ...(expectedPayment ? { expectedPaymentId: expectedPayment.expectedPaymentId } : {}),
    signals: [],
    bankTransaction,
    proof,
    ...(expectedPayment ? { expectedPayment } : {})
  };
}

describe("calculateFxScenarios", () => {
  it("evaluates invoice/payment/bank-date scenarios and finds the lowest residual", () => {
    const candidate = buildCandidate({
      expectedAmount: { value: "10000", currency: "USD" },
      paidAmount: { value: "10000", currency: "USD" },
      paymentDate: "2026-05-20", // USD/MYR 4.2500 -> 42500.00 (residual 0)
      bankAmount: { value: "42500.00", currency: "MYR" },
      bankDate: "2026-05-21", // USD/MYR 4.2400 -> 42400.00 (residual 100)
      issueDate: "2026-05-01", // USD/MYR 4.2000 -> 42000.00 (residual 500)
      proofRate: null
    });

    const result = calculateFxScenarios({ candidate, policy: DEFAULT_POLICY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const byBasis = Object.fromEntries(result.data.map((s) => [s.basis, s]));
    expect(byBasis.invoice_date?.expectedLocalAmount.value).toBe("42000.00");
    expect(byBasis.payment_date?.expectedLocalAmount.value).toBe("42500.00");
    expect(byBasis.bank_date?.expectedLocalAmount.value).toBe("42400.00");

    expect(byBasis.payment_date?.residualAmount).toBe("0.00");
    expect(byBasis.payment_date?.residualPercent).toBe(0);

    const lowest = [...result.data].sort((a, b) => Math.abs(a.residualPercent) - Math.abs(b.residualPercent))[0];
    expect(lowest?.basis).toBe("payment_date");
  });

  it("prefers an explicit proof FX rate as its own scenario", () => {
    const candidate = buildCandidate({
      expectedAmount: { value: "10000", currency: "USD" },
      paidAmount: { value: "10000", currency: "USD" },
      paymentDate: "2026-05-20",
      bankAmount: { value: "42500.00", currency: "MYR" },
      bankDate: "2026-05-21",
      proofRate: {
        unitCurrency: "USD",
        quotedCurrency: "MYR",
        exchangeRate: "4.2500",
        rateType: "AGREED",
        source: "payment_proof",
        contractId: null,
        evidenceText: null
      }
    });

    const result = calculateFxScenarios({ candidate, policy: DEFAULT_POLICY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const proofScenario = result.data.find((s) => s.basis === "proof_rate");
    expect(proofScenario).toBeDefined();
    expect(proofScenario?.rate).toBe("4.2500");
    expect(proofScenario?.rateSource).toBe("proof");
    expect(proofScenario?.expectedLocalAmount.value).toBe("42500.00");
    expect(proofScenario?.residualAmount).toBe("0.00");
  });

  it("uses the invoice foreign amount when the proof paid amount is already local currency", () => {
    const candidate = buildCandidate({
      expectedAmount: { value: "10000", currency: "USD" },
      paidAmount: { value: "42500", currency: "MYR" },
      paymentDate: "2026-05-21",
      bankAmount: { value: "42500", currency: "MYR" },
      bankDate: "2026-05-21",
      issueDate: "2026-05-20",
      proofRate: {
        unitCurrency: "USD",
        quotedCurrency: "MYR",
        exchangeRate: "4.2500",
        rateType: "AGREED",
        source: "payment_proof",
        contractId: null,
        evidenceText: "1 USD = 4.2500 MYR"
      }
    });

    const result = calculateFxScenarios({ candidate, policy: DEFAULT_POLICY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const proofScenario = result.data.find((s) => s.basis === "proof_rate");
    expect(proofScenario?.foreignAmount).toEqual({ value: "10000", currency: "USD" });
    expect(proofScenario?.expectedLocalAmount).toEqual({ value: "42500.00", currency: "MYR" });
    expect(proofScenario?.residualAmount).toBe("0.00");
    expect(result.data.some((s) => s.rateSource === "same_currency")).toBe(false);
  });

  it("handles same-currency candidates with a zero residual", () => {
    // Clean fixture: proof USD 250.00, bank USD 250.00.
    const candidate = buildCandidate({});
    const result = calculateFxScenarios({ candidate, policy: DEFAULT_POLICY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.length).toBeGreaterThan(0);
    for (const scenario of result.data) {
      expect(scenario.expectedLocalAmount.currency).toBe("USD");
      expect(scenario.residualAmount).toBe("0.00");
      expect(scenario.residualPercent).toBe(0);
    }
  });

  it("returns an empty scenario list for an unsupported currency pair", () => {
    const candidate = buildCandidate({
      paidAmount: { value: "100", currency: "EUR" },
      bankAmount: { value: "150.00", currency: "SGD" }, // EUR->SGD not in fixture
      proofRate: null,
      includeExpected: false
    });

    const result = calculateFxScenarios({ candidate, policy: DEFAULT_POLICY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([]);
  });
});
