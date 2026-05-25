import { describe, expect, it } from "vitest";
import type { NormalizedInputBatch } from "../types";
import { cleanNormalizedBatch } from "../fixtures/normalized/clean";
import { generateBankAnchoredCandidates } from "./generate-candidates";
import { DEFAULT_POLICY } from "./policy";

describe("generateBankAnchoredCandidates", () => {
  it("links each bank credit to its proof and expected payment by exact reference", () => {
    const result = generateBankAnchoredCandidates({ batch: cleanNormalizedBatch, policy: DEFAULT_POLICY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const bank1 = "txn_bank_001_row002"; // INV-1001
    const candidates = result.data.candidatesByBankTx[bank1] ?? [];
    expect(candidates.length).toBe(1);

    const candidate = candidates[0]!;
    expect(candidate.proofId).toBe("proof_001");
    expect(candidate.expectedPaymentId).toBe("exp_file_001_row002");
    expect(candidate.signals.some((s) => s.code === "EXACT_REFERENCE_MATCH" && s.strength === "STRONG")).toBe(true);

    expect(result.data.unmatchedBankTxIds).toEqual([]);
  });

  it("does not cross-link a proof to an unrelated invoice", () => {
    const result = generateBankAnchoredCandidates({ batch: cleanNormalizedBatch, policy: DEFAULT_POLICY });
    if (!result.ok) return;
    const all = Object.values(result.data.candidatesByBankTx).flat();
    // proof_001 must never be paired with INV-1002, nor proof_002 with INV-1001.
    expect(all.some((c) => c.proofId === "proof_001" && c.expectedPaymentId === "exp_file_001_row003")).toBe(false);
    expect(all.some((c) => c.proofId === "proof_002" && c.expectedPaymentId === "exp_file_001_row002")).toBe(false);
  });

  it("reports a bank credit with no plausible match as unmatched", () => {
    const baseBank = cleanNormalizedBatch.bankTransactions[0]!;
    const orphanBank = {
      ...baseBank,
      internalTxId: "txn_orphan",
      normalizedReference: "ZZZNOMATCH",
      debtorNormalizedName: "NOBODY",
      amount: { value: "999.99", currency: "USD" as const },
      remittanceInformation: { raw: "Unknown deposit", structured: null },
      description: "Unknown deposit",
      rawDescription: "Unknown deposit"
    };
    const batch: NormalizedInputBatch = { ...cleanNormalizedBatch, bankTransactions: [orphanBank] };

    const result = generateBankAnchoredCandidates({ batch, policy: DEFAULT_POLICY });
    if (!result.ok) return;
    expect(result.data.unmatchedBankTxIds).toContain("txn_orphan");
    expect(result.data.candidatesByBankTx["txn_orphan"]).toBeUndefined();
  });

  it("skips bank debits entirely", () => {
    const baseBank = cleanNormalizedBatch.bankTransactions[0]!;
    const debit = { ...baseBank, internalTxId: "txn_debit", creditDebitIndicator: "DBIT" as const };
    const batch: NormalizedInputBatch = { ...cleanNormalizedBatch, bankTransactions: [debit] };

    const result = generateBankAnchoredCandidates({ batch, policy: DEFAULT_POLICY });
    if (!result.ok) return;
    expect(result.data.candidatesByBankTx["txn_debit"]).toBeUndefined();
    expect(result.data.unmatchedBankTxIds).not.toContain("txn_debit");
  });
});
