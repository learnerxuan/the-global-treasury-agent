import { describe, expect, it } from "vitest";
import { USD_MYR_RATES, lookupFxRate } from "./fx-table";

describe("lookupFxRate", () => {
  it("returns rate 1 for same-currency pairs without a fallback flag", () => {
    const result = lookupFxRate({ base: "USD", quote: "USD", date: "2026-05-20" });
    expect(result).not.toBeNull();
    expect(result?.rate).toBe("1");
    expect(result?.source).toBe("same_currency");
    expect(result?.isFallback).toBe(false);
  });

  it("returns an exact fixture rate when the date is present", () => {
    const result = lookupFxRate({ base: "USD", quote: "MYR", date: "2026-05-20" });
    expect(result?.rate).toBe("4.2500");
    expect(result?.rateDate).toBe("2026-05-20");
    expect(result?.source).toBe("fixture_exact");
    expect(result?.isFallback).toBe(false);
  });

  it("falls back to the nearest dated rate when the exact date is missing", () => {
    // 2026-05-19 is not in the table; nearest is 2026-05-18 (1 day) vs 2026-05-20 (1 day).
    // Ties resolve to the earlier date.
    const result = lookupFxRate({ base: "USD", quote: "MYR", date: "2026-05-19" });
    expect(result?.source).toBe("fixture_nearest");
    expect(result?.isFallback).toBe(true);
    expect(result?.rateDate).toBe("2026-05-18");
  });

  it("accepts an ISO datetime and matches on the date portion", () => {
    const result = lookupFxRate({ base: "USD", quote: "MYR", date: "2026-05-21T09:30:00+08:00" });
    expect(result?.rate).toBe("4.2400");
    expect(result?.source).toBe("fixture_exact");
  });

  it("returns null for an unsupported currency pair", () => {
    const result = lookupFxRate({ base: "EUR", quote: "SGD", date: "2026-05-20" });
    expect(result).toBeNull();
  });

  it("exposes a sorted, non-empty USD->MYR fixture", () => {
    expect(USD_MYR_RATES.length).toBeGreaterThan(0);
    const dates = USD_MYR_RATES.map((entry) => entry.date);
    expect([...dates].sort()).toEqual(dates);
  });
});
