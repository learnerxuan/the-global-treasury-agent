import { describe, expect, it } from "vitest";
import { cleanNormalizedBatch } from "../../lib/recon/fixtures/normalized/clean";
import type { ReconciliationResult } from "../../lib/recon/reconciliation/types";
import { buildRecordIndex, formatMoney, pickDefaultCaseId } from "./helpers";

function result(caseId: string, status: ReconciliationResult["status"]): ReconciliationResult {
  return { caseId, status, score: 0, reasonCodes: [], hardReviewFlags: [], explanation: "" };
}

describe("buildRecordIndex", () => {
  it("indexes expected payments, bank transactions, and proofs by id", () => {
    const index = buildRecordIndex(cleanNormalizedBatch);
    expect(index.expectedById.get("exp_file_001_row002")?.invoiceNumber).toBe("INV-1001");
    expect(index.bankById.get("txn_bank_001_row002")?.creditDebitIndicator).toBe("CRDT");
    expect(index.proofById.get("proof_001")?.proofId).toBe("proof_001");
  });
});

describe("pickDefaultCaseId", () => {
  it("prefers the first NEEDS_REVIEW case", () => {
    const results = [result("A", "AUTO_MATCHED"), result("B", "NEEDS_REVIEW"), result("C", "UNMATCHED")];
    expect(pickDefaultCaseId(results)).toBe("B");
  });

  it("falls back to the first UNMATCHED case", () => {
    const results = [result("A", "AUTO_MATCHED"), result("C", "UNMATCHED")];
    expect(pickDefaultCaseId(results)).toBe("C");
  });

  it("falls back to the first result", () => {
    const results = [result("A", "AUTO_MATCHED"), result("D", "LIKELY_MATCHED")];
    expect(pickDefaultCaseId(results)).toBe("A");
  });

  it("returns null for an empty list", () => {
    expect(pickDefaultCaseId([])).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats a money amount", () => {
    expect(formatMoney({ value: "42500.00", currency: "MYR" })).toBe("MYR 42,500.00");
  });

  it("handles missing amounts", () => {
    expect(formatMoney(null)).toBe("—");
  });
});
