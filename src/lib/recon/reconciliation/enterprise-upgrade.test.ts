import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
import { BnmFxRateProvider, CachedFxRateProvider, FixtureFxRateProvider, LocalJsonFxRateCache, type FxRateProvider } from "./fx-provider";
import { InMemoryPaymentApplicationStore, LocalCounterpartyIdentityStore } from "./stores";
import type { CandidateSet, MatchCandidate, ToolResult } from "./types";

function unwrap<T>(result: ToolResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function firstCandidate(set: CandidateSet, bankId = "txn_enterprise"): MatchCandidate {
  const candidate = set.candidatesByBankTx[bankId]?.[0];
  if (!candidate) throw new Error(`no candidate generated for ${bankId}`);
  return candidate;
}

const baseBank = cleanNormalizedBatch.bankTransactions[0]!;
const baseProof = cleanNormalizedBatch.paymentProofs[0]!;
const baseExpected = cleanNormalizedBatch.expectedPayments[0]!;

function batchOf(input: {
  bank: Partial<BankStatementTransaction>;
  proof: Partial<NormalizedPaymentProofRecord["financialPayload"]>;
  expected: Partial<ExpectedPaymentRecord>;
  expectedPayments?: ExpectedPaymentRecord[];
}): NormalizedInputBatch {
  const expected = {
    ...baseExpected,
    expectedPaymentId: "exp_enterprise",
    invoiceNumber: "INV-ENTERPRISE",
    amountDue: { value: "1000.00", currency: "MYR" },
    invoiceCurrency: "MYR",
    expectedSettlementCurrency: "MYR",
    paymentReference: { raw: "INV-ENTERPRISE", normalized: "INVENTERPRISE" },
    debtor: { name: "ACME", normalizedName: "ACME" },
    outstandingAmount: null,
    ...input.expected
  } as ExpectedPaymentRecord;

  const bank = {
    ...baseBank,
    internalTxId: "txn_enterprise",
    amount: { value: "1000.00", currency: "MYR" },
    sourceAmount: null,
    exchangeRateApplied: null,
    bookingDate: "2026-05-20",
    normalizedReference: expected.paymentReference.normalized,
    debtorNormalizedName: "ACME",
    remittanceInformation: { raw: expected.invoiceNumber, structured: { invoiceNumber: expected.invoiceNumber } },
    ...input.bank
  } as BankStatementTransaction;

  const proof = {
    ...baseProof,
    proofId: "proof_enterprise",
    financialPayload: {
      ...baseProof.financialPayload,
      paidAmount: expected.amountDue,
      paymentDate: "2026-05-20",
      paymentStatus: "ACSC",
      reference: expected.paymentReference,
      debtor: { name: "ACME", normalizedName: "ACME" },
      invoiceIds: [],
      remittanceLineItems: [],
      ...input.proof
    }
  } as NormalizedPaymentProofRecord;

  return {
    schemaVersion: "1.0.0",
    batchId: "enterprise",
    uploadedAt: "2026-05-20T00:00:00.000Z",
    expectedPayments: input.expectedPayments ?? [expected],
    bankTransactions: [bank],
    paymentProofs: [proof],
    warnings: [],
    timelines: []
  };
}

describe("enterprise reconciliation upgrades", () => {
  it("does not link unrelated references only because both contain a calendar year", () => {
    const batch = batchOf({
      expected: {
        paymentReference: { raw: "INV-2026", normalized: "INV2026" },
        invoiceNumber: "INV-2026"
      },
      proof: {
        reference: { raw: "TRX-2026-PAY", normalized: "TRX2026PAY" },
        paidAmount: { value: "1000.00", currency: "MYR" }
      },
      bank: {
        normalizedReference: "BANK20260521001",
        remittanceInformation: { raw: "TRX-2026-PAY", structured: null }
      }
    });

    const candidate = firstCandidate(unwrap(generateBankAnchoredCandidates({ batch, policy: DEFAULT_POLICY })));
    expect(candidate.candidateKind).toBe("proof_only");
    expect(candidate.expectedPaymentId).toBeUndefined();
    expect(candidate.signals.map((signal) => signal.code)).not.toContain("PARTIAL_REFERENCE_MATCH");
  });

  it("still links a real invoice core when a year is embedded in a longer invoice reference", () => {
    const batch = batchOf({
      expected: {
        paymentReference: { raw: "INV-2026-1007", normalized: "INV20261007" },
        invoiceNumber: "INV-2026-1007"
      },
      proof: {
        reference: { raw: "INV-1007", normalized: "INV1007" }
      },
      bank: {
        normalizedReference: "SCX001",
        remittanceInformation: { raw: "provider transfer", structured: null }
      }
    });

    const candidate = firstCandidate(unwrap(generateBankAnchoredCandidates({ batch, policy: DEFAULT_POLICY })));
    expect(candidate.expectedPaymentId).toBe("exp_enterprise");
    expect(candidate.signals.map((signal) => signal.code)).toContain("PARTIAL_REFERENCE_MATCH");
  });

  it("forces review for a large percentage-tolerated short payment above the absolute residual cap", () => {
    const batch = batchOf({
      expected: {
        amountDue: { value: "4000000.00", currency: "MYR" },
        invoiceCurrency: "MYR",
        expectedSettlementCurrency: "MYR"
      },
      proof: {
        paidAmount: { value: "4000000.00", currency: "MYR" }
      },
      bank: {
        amount: { value: "3960000.00", currency: "MYR" }
      }
    });

    const output = runReconciliationOrchestrator(batch);
    const result = output.results[0]!;
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.hardReviewFlags).toContain("UNEXPLAINED_RESIDUAL_ABOVE_CAP");
    expect(result.residual?.residualClassification).toBe("shortPayment");
  });

  it("classifies an allowed flat wire fee separately from FX variance", () => {
    const batch = batchOf({
      expected: {},
      proof: {},
      bank: {
        amount: { value: "965.00", currency: "MYR" }
      }
    });

    const output = runReconciliationOrchestrator(batch);
    const result = output.results[0]!;
    expect(result.reasonCodes).toContain("FLAT_FEE_EXPLAINS_RESIDUAL");
    expect(result.residual?.residualClassification).toBe("flatFee");
    expect(result.hardReviewFlags).not.toContain("UNEXPLAINED_RESIDUAL_ABOVE_CAP");
  });

  it("uses a local cache before calling the underlying FX provider again", async () => {
    const dir = await mkdtemp(join(tmpdir(), "recon-fx-cache-"));
    let calls = 0;
    const provider: FxRateProvider = {
      providerId: "counting",
      lookup(input) {
        calls += 1;
        return {
          base: input.base,
          quote: input.quote,
          rate: "4.2000",
          rateDate: input.date.slice(0, 10),
          source: "market_cached",
          providerId: "counting",
          isFallback: false
        };
      }
    };

    try {
      const cached = new CachedFxRateProvider(provider, new LocalJsonFxRateCache(join(dir, "fx-cache")));
      const batch = batchOf({
        expected: {
          amountDue: { value: "100.00", currency: "USD" },
          invoiceCurrency: "USD",
          expectedSettlementCurrency: "MYR",
          issueDate: "2026-05-20"
        },
        proof: {
          paidAmount: { value: "100.00", currency: "USD" },
          sourceAmount: { value: "100.00", currency: "USD" }
        },
        bank: {
          amount: { value: "420.00", currency: "MYR" },
          sourceAmount: null,
          exchangeRateApplied: null
        }
      });
      const candidate = firstCandidate(unwrap(generateBankAnchoredCandidates({ batch, policy: DEFAULT_POLICY })));

      unwrap(calculateFxScenarios({ candidate, policy: DEFAULT_POLICY, fxProvider: cached }));
      unwrap(calculateFxScenarios({ candidate, policy: DEFAULT_POLICY, fxProvider: cached }));

      expect(calls).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("hydrates and caches historical FX rates from the BNM exchange-rate API", async () => {
    const dir = await mkdtemp(join(tmpdir(), "recon-bnm-cache-"));
    const calls: string[] = [];
    const fetchFn = async (url: string, init: { headers: Record<string, string> }) => {
      calls.push(url);
      expect(init.headers.Accept).toBe("application/vnd.BNM.API.v1+json");
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            data: {
              currency_code: "USD",
              unit: 1,
              rate: {
                date: "2026-05-20",
                buying_rate: 4.24,
                selling_rate: 4.26,
                middle_rate: 4.25
              }
            }
          };
        }
      };
    };

    try {
      const provider = new BnmFxRateProvider(new LocalJsonFxRateCache(join(dir, "fx-cache")), fetchFn);
      const input = { base: "USD" as const, quote: "MYR" as const, date: "2026-05-20" };
      const first = await provider.hydrate(input);
      const second = await provider.hydrate(input);

      expect(calls).toEqual(["https://api.bnm.gov.my/public/exchange-rate/USD/date/2026-05-20?session=1700&quote=rm"]);
      expect(first).toMatchObject({
        base: "USD",
        quote: "MYR",
        rate: "4.25",
        rateDate: "2026-05-20",
        source: "live_api",
        providerId: "bnm",
        isFallback: false
      });
      expect(second?.rate).toBe("4.25");
      expect(provider.lookup(input)?.providerId).toBe("bnm");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("labels BNM-hydrated rates on generated FX scenarios", async () => {
    const dir = await mkdtemp(join(tmpdir(), "recon-bnm-scenario-"));
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          data: {
            currency_code: "USD",
            unit: 1,
            rate: {
              date: "2026-05-20",
              buying_rate: null,
              selling_rate: null,
              middle_rate: 4.25
            }
          }
        };
      }
    });

    try {
      const provider = new BnmFxRateProvider(new LocalJsonFxRateCache(join(dir, "fx-cache")), fetchFn);
      await provider.hydrate({ base: "USD", quote: "MYR", date: "2026-05-20" });
      const batch = batchOf({
        expected: {
          amountDue: { value: "100.00", currency: "USD" },
          invoiceCurrency: "USD",
          expectedSettlementCurrency: "MYR",
          issueDate: "2026-05-20"
        },
        proof: {
          paidAmount: { value: "100.00", currency: "USD" },
          sourceAmount: { value: "100.00", currency: "USD" },
          paymentDate: "2026-05-20"
        },
        bank: {
          amount: { value: "425.00", currency: "MYR" },
          sourceAmount: null,
          exchangeRateApplied: null,
          bookingDate: "2026-05-20"
        }
      });
      const candidate = firstCandidate(unwrap(generateBankAnchoredCandidates({ batch, policy: DEFAULT_POLICY })));
      const scenarios = unwrap(calculateFxScenarios({ candidate, policy: DEFAULT_POLICY, fxProvider: provider }));

      expect(scenarios.some((scenario) => scenario.providerId === "bnm" && scenario.rateSource === "live_api")).toBe(true);
      expect(scenarios.some((scenario) => scenario.providerId === "bnm" && scenario.fxSourceKind === "spread_adjusted")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates a batch candidate and allocations from remittance invoice ids", () => {
    const invoices = ["INV-B1", "INV-B2", "INV-B3"].map((invoiceNumber, index) => ({
      ...baseExpected,
      expectedPaymentId: `exp_batch_${index + 1}`,
      invoiceNumber,
      paymentReference: { raw: invoiceNumber, normalized: invoiceNumber.replace(/-/g, "") },
      amountDue: { value: ["100.00", "200.00", "300.00"][index]!, currency: "MYR" },
      invoiceCurrency: "MYR",
      expectedSettlementCurrency: "MYR",
      debtor: { name: "BATCHCO", normalizedName: "BATCHCO" },
      outstandingAmount: null
    })) as ExpectedPaymentRecord[];

    const batch = batchOf({
      expected: {},
      expectedPayments: invoices,
      proof: {
        paidAmount: { value: "600.00", currency: "MYR" },
        reference: { raw: "BATCH-REMIT", normalized: "BATCHREMIT" },
        debtor: { name: "BATCHCO", normalizedName: "BATCHCO" },
        invoiceIds: ["INV-B1", "INV-B2", "INV-B3"],
        remittanceLineItems: []
      },
      bank: {
        amount: { value: "600.00", currency: "MYR" },
        normalizedReference: "BATCHREMIT",
        debtorNormalizedName: "BATCHCO",
        remittanceInformation: { raw: "BATCH-REMIT", structured: null }
      }
    });

    const output = runReconciliationOrchestrator(batch);
    const result = output.results[0]!;
    expect(result.status).toBe("AUTO_MATCHED");
    expect(result.candidateKind).toBe("batch_invoices");
    expect(result.allocations).toHaveLength(3);
    expect(result.expectedPaymentIds).toEqual(["exp_batch_1", "exp_batch_2", "exp_batch_3"]);
  });

  it("does not create duplicate applications when the same bank transaction is reconciled again", () => {
    const store = new InMemoryPaymentApplicationStore();
    const batch = batchOf({ expected: {}, proof: {}, bank: {} });

    const first = runReconciliationOrchestrator(batch, { paymentApplicationStore: store });
    const second = runReconciliationOrchestrator(batch, { paymentApplicationStore: store });

    expect(first.summary.autoMatched).toBe(1);
    expect(store.listApplications()).toHaveLength(1);
    expect(second.results).toHaveLength(0);
    expect(store.listApplications()).toHaveLength(1);
  });

  it("forces review for duplicate bank statement rows instead of auto-consuming them", () => {
    const batch = batchOf({ expected: {}, proof: {}, bank: {} });
    batch.bankTransactions = [
      batch.bankTransactions[0]!,
      {
        ...batch.bankTransactions[0]!,
        internalTxId: "txn_enterprise_duplicate",
        sourceRowNumber: 2
      }
    ];

    const output = runReconciliationOrchestrator(batch);
    expect(output.results).toHaveLength(2);
    expect(output.results.every((result) => result.status === "NEEDS_REVIEW")).toBe(true);
    expect(output.results.every((result) => result.hardReviewFlags.includes("DUPLICATE_BANK_TRANSACTION"))).toBe(true);
  });

  it("forces review when a bank row appears reversed or corrected", () => {
    const batch = batchOf({ expected: {}, proof: {}, bank: {} });
    batch.bankTransactions = [
      batch.bankTransactions[0]!,
      {
        ...batch.bankTransactions[0]!,
        internalTxId: "txn_enterprise_reversal",
        creditDebitIndicator: "DBIT",
        description: "REVERSAL of INV-ENTERPRISE settlement",
        rawDescription: "REVERSAL of INV-ENTERPRISE settlement"
      }
    ];

    const output = runReconciliationOrchestrator(batch);
    expect(output.results.some((result) => result.hardReviewFlags.includes("POSSIBLE_REVERSAL"))).toBe(true);
    expect(output.results.filter((result) => result.hardReviewFlags.includes("POSSIBLE_REVERSAL")).every((result) => result.status === "NEEDS_REVIEW")).toBe(true);
  });

  it("applies the allocation ledger before matching a partially paid invoice again", () => {
    const store = new InMemoryPaymentApplicationStore();
    store.saveApplication({
      applicationId: "app_prior_partial",
      createdAt: "2026-05-19T00:00:00.000Z",
      policyVersion: DEFAULT_POLICY.version,
      bankTransactionId: "txn_prior_partial",
      proofId: "proof_prior_partial",
      selectedCandidateId: "cand_prior_partial",
      expectedPaymentIds: ["exp_enterprise"],
      allocations: [
        {
          expectedPaymentId: "exp_enterprise",
          invoiceNumber: "INV-ENTERPRISE",
          appliedAmount: { value: "400.00", currency: "MYR" },
          remainingAmount: { value: "600.00", currency: "MYR" },
          reason: "partial_payment"
        }
      ],
      status: "AUTO_MATCHED"
    });
    const batch = batchOf({
      expected: {
        amountDue: { value: "1000.00", currency: "MYR" },
        outstandingAmount: null
      },
      proof: {
        paidAmount: { value: "600.00", currency: "MYR" }
      },
      bank: {
        amount: { value: "600.00", currency: "MYR" }
      }
    });

    const output = runReconciliationOrchestrator(batch, { paymentApplicationStore: store });
    const result = output.results[0]!;
    expect(result.status).toBe("AUTO_MATCHED");
    expect(result.allocations?.[0]?.appliedAmount).toEqual({ value: "600.00", currency: "MYR" });
    expect(store.listApplications()).toHaveLength(2);
  });

  it("uses the counterparty identity store to match known aliases", () => {
    const identityStore = new LocalCounterpartyIdentityStore([
      {
        canonicalName: "ACME GROUP",
        aliases: ["ACME"],
        payerNames: ["ACME MALAYSIA"],
        debtorAccounts: []
      }
    ]);
    const batch = batchOf({
      expected: {
        debtor: { name: "Acme Pte Ltd", normalizedName: "ACME" }
      },
      proof: {
        debtor: { name: "Acme Malaysia", normalizedName: "ACME MALAYSIA" }
      },
      bank: {
        debtorName: "ACME MALAYSIA",
        debtorNormalizedName: "ACME MALAYSIA"
      }
    });

    const output = runReconciliationOrchestrator(batch, { counterpartyIdentityStore: identityStore });
    const result = output.results[0]!;
    expect(result.reasonCodes).toContain("COUNTERPARTY_ALIAS_MATCH");
    expect(result.status).toBe("AUTO_MATCHED");
  });

  it("blocks auto-match when a critical proof field has low confidence", () => {
    const batch = batchOf({
      expected: {},
      proof: {},
      bank: {}
    });
    batch.paymentProofs[0] = {
      ...batch.paymentProofs[0]!,
      aiMetadata: {
        ...batch.paymentProofs[0]!.aiMetadata,
        overallConfidence: 0.95,
        fieldConfidence: {
          ...batch.paymentProofs[0]!.aiMetadata.fieldConfidence,
          // Debtor (payer) identity IS a critical field — low confidence here must gate.
          "debtor.rawName": 0.4
        }
      }
    };

    const output = runReconciliationOrchestrator(batch);
    const result = output.results[0]!;
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.hardReviewFlags).toContain("LOW_CONFIDENCE_CRITICAL_FIELD");
    expect(result.evidenceTrust?.issues.some((issue) => issue.field === "financialPayload.debtor.name")).toBe(true);
  });

  it("does NOT block auto-match when only the creditor name is low confidence", () => {
    const batch = batchOf({ expected: {}, proof: {}, bank: {} });
    batch.paymentProofs[0] = {
      ...batch.paymentProofs[0]!,
      aiMetadata: {
        ...batch.paymentProofs[0]!.aiMetadata,
        overallConfidence: 0.95,
        fieldConfidence: {
          ...batch.paymentProofs[0]!.aiMetadata.fieldConfidence,
          // The creditor on a proof is the SME itself — never a match blocker.
          "creditor.rawName": 0
        }
      }
    };

    const output = runReconciliationOrchestrator(batch);
    const result = output.results[0]!;
    expect(result.status).toBe("AUTO_MATCHED");
    expect(result.hardReviewFlags).not.toContain("LOW_CONFIDENCE_CRITICAL_FIELD");
  });

  it("returns UI-ready audit and review payloads on every result", () => {
    const batch = batchOf({ expected: {}, proof: {}, bank: {} });
    const output = runReconciliationOrchestrator(batch);
    const result = output.results[0]!;

    expect(result.auditTrail).toMatchObject({
      policyVersion: DEFAULT_POLICY.version,
      selectedCandidateId: result.selectedCandidateId,
      candidateKind: result.candidateKind
    });
    expect(result.auditTrail?.evidenceRefs.map((ref) => ref.kind)).toEqual([
      "bank_transaction",
      "payment_proof",
      "expected_payment"
    ]);
    expect(result.reviewPayload).toMatchObject({ required: false, blockers: [] });
  });

  it("keeps fixture FX as an explicit fallback source when no provider is supplied", () => {
    const batch = batchOf({
      expected: {
        amountDue: { value: "100.00", currency: "USD" },
        invoiceCurrency: "USD",
        expectedSettlementCurrency: "MYR"
      },
      proof: {
        paidAmount: { value: "100.00", currency: "USD" },
        sourceAmount: { value: "100.00", currency: "USD" }
      },
      bank: {
        amount: { value: "425.00", currency: "MYR" },
        sourceAmount: null,
        exchangeRateApplied: null
      }
    });
    const candidate = firstCandidate(unwrap(generateBankAnchoredCandidates({ batch, policy: DEFAULT_POLICY })));

    const scenarios = unwrap(calculateFxScenarios({ candidate, policy: DEFAULT_POLICY, fxProvider: new FixtureFxRateProvider() }));
    expect(scenarios.some((scenario) => scenario.fxSourceKind === "fixture_fallback" || scenario.fxSourceKind === "market_cached")).toBe(true);
  });
});
