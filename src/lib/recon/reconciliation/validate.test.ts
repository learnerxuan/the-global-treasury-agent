import { describe, expect, it } from "vitest";
import type { NormalizedInputBatch } from "../types";
import { cleanNormalizedBatch } from "../fixtures/normalized/clean";
import { validateNormalizedBatch } from "./validate";

describe("validateNormalizedBatch", () => {
  it("accepts a well-formed batch and counts records", () => {
    const result = validateNormalizedBatch(cleanNormalizedBatch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.valid).toBe(true);
    expect(result.data.counts.expectedPayments).toBe(2);
    expect(result.data.counts.bankCredits).toBe(2);
    expect(result.data.issues).toEqual([]);
  });

  it("flags a batch with no bank transactions as invalid", () => {
    const batch: NormalizedInputBatch = { ...cleanNormalizedBatch, bankTransactions: [] };
    const result = validateNormalizedBatch(batch);
    if (!result.ok) return;
    expect(result.data.valid).toBe(false);
    expect(result.data.issues.join(" ")).toContain("bank");
  });

  it("flags a malformed money value", () => {
    const baseBank = cleanNormalizedBatch.bankTransactions[0]!;
    const badBank = { ...baseBank, amount: { value: "not-a-number", currency: "USD" as const } };
    const batch: NormalizedInputBatch = { ...cleanNormalizedBatch, bankTransactions: [badBank] };
    const result = validateNormalizedBatch(batch);
    if (!result.ok) return;
    expect(result.data.valid).toBe(false);
    expect(result.data.issues.join(" ").toLowerCase()).toContain("money");
  });
});
