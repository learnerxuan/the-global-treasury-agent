import { describe, expect, it } from "vitest";
import {
  absMoney,
  compareMoney,
  isNegativeMoney,
  multiplyMoneyByRate,
  residualPercent,
  subtractMoney
} from "./money";

describe("multiplyMoneyByRate", () => {
  it("converts foreign amount to local using an FX rate, rounded to 2dp", () => {
    // USD 10000 at 4.2500 MYR/USD = MYR 42500.00
    expect(multiplyMoneyByRate("10000", "4.2500")).toBe("42500.00");
  });

  it("rounds half away from zero at the cent", () => {
    // 100 * 1.005 = 100.5 -> 100.50; 100 * 1.0049 = 100.49
    expect(multiplyMoneyByRate("100", "1.005")).toBe("100.50");
    expect(multiplyMoneyByRate("100", "1.0049")).toBe("100.49");
  });

  it("handles decimal foreign amounts without float drift", () => {
    // 0.1 + 0.2 style hazard: 1234.56 * 4.25 = 5246.88
    expect(multiplyMoneyByRate("1234.56", "4.25")).toBe("5246.88");
  });
});

describe("subtractMoney", () => {
  it("returns the signed difference as a decimal string", () => {
    expect(subtractMoney("42500.00", "42500.00")).toBe("0.00");
    expect(subtractMoney("42000.00", "42500.00")).toBe("-500.00");
    expect(subtractMoney("42600.00", "42500.00")).toBe("100.00");
  });

  it("does not introduce float error", () => {
    expect(subtractMoney("0.30", "0.10")).toBe("0.20");
  });
});

describe("absMoney", () => {
  it("strips the sign", () => {
    expect(absMoney("-500.00")).toBe("500.00");
    expect(absMoney("500.00")).toBe("500.00");
    expect(absMoney("0.00")).toBe("0.00");
  });
});

describe("isNegativeMoney", () => {
  it("detects short payments", () => {
    expect(isNegativeMoney("-500.00")).toBe(true);
    expect(isNegativeMoney("0.00")).toBe(false);
    expect(isNegativeMoney("500.00")).toBe(false);
  });
});

describe("compareMoney", () => {
  it("orders two decimal money strings", () => {
    expect(compareMoney("100.00", "99.99")).toBe(1);
    expect(compareMoney("99.99", "100.00")).toBe(-1);
    expect(compareMoney("100.0", "100.00")).toBe(0);
  });
});

describe("residualPercent", () => {
  it("returns abs(residual)/expectedLocal as a fraction", () => {
    // residual 500 on expected 42500 = ~0.011764 (1.18%)
    expect(residualPercent("-500.00", "42500.00")).toBeCloseTo(0.0117647, 6);
  });

  it("is zero when residual is zero", () => {
    expect(residualPercent("0.00", "42500.00")).toBe(0);
  });

  it("returns Infinity when expected local is zero (no usable scenario)", () => {
    expect(residualPercent("100.00", "0")).toBe(Number.POSITIVE_INFINITY);
  });
});
