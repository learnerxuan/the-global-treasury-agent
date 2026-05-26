import { describe, expect, it } from "vitest";
import { evaluateAmountResidual, evaluateFeeHypothesis } from "./evaluate-residual";
import { DEFAULT_POLICY } from "./policy";
import type { AmountResidualResult, FxScenarioBasis, FxScenarioResult } from "./types";

function fx(basis: FxScenarioBasis, residualAmount: string, residualPercent: number, expectedLocal = "42500.00"): FxScenarioResult {
  return {
    scenarioId: `s-${basis}`,
    label: basis,
    basis,
    foreignAmount: { value: "10000", currency: "USD" },
    rate: "4.2500",
    rateDate: "2026-05-20",
    rateSource: "fixture_exact",
    fxSourceKind: "fixture_fallback",
    spreadMargin: 0,
    isFallback: false,
    expectedLocalAmount: { value: expectedLocal, currency: "MYR" },
    residualAmount,
    residualPercent
  };
}

describe("evaluateAmountResidual", () => {
  it("selects the scenario with the lowest residual percent", () => {
    const result = evaluateAmountResidual({
      fxScenarios: [fx("invoice_date", "500.00", 0.0118), fx("payment_date", "0.00", 0)],
      policy: DEFAULT_POLICY
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.bestScenario?.basis).toBe("payment_date");
    expect(result.data.band).toBe("WITHIN_TOLERANCE");
    expect(result.data.exceedsHardReviewThreshold).toBe(false);
  });

  it("bands a 1% residual as a small variance under the hard threshold", () => {
    const result = evaluateAmountResidual({
      fxScenarios: [fx("payment_date", "-425.00", 0.01)],
      policy: DEFAULT_POLICY
    });
    if (!result.ok) return;
    expect(result.data.band).toBe("SMALL_VARIANCE");
    expect(result.data.exceedsHardReviewThreshold).toBe(false);
  });

  it("bands a 3.5% short payment as significant and over the hard threshold", () => {
    const result = evaluateAmountResidual({
      fxScenarios: [fx("payment_date", "-1487.50", 0.035)],
      policy: DEFAULT_POLICY
    });
    if (!result.ok) return;
    expect(result.data.band).toBe("SIGNIFICANT_VARIANCE");
    expect(result.data.exceedsHardReviewThreshold).toBe(true);
  });

  it("uses SME percentage tolerance to allow a residual above the enterprise threshold", () => {
    const result = evaluateAmountResidual({
      fxScenarios: [fx("payment_date", "-1275.00", 0.03)],
      policy: {
        ...DEFAULT_POLICY,
        smeConfig: {
          mode: "percentage",
          percentageValue: 0.05,
          fixedValue: "0.00"
        }
      }
    });
    if (!result.ok) return;
    expect(result.data.band).toBe("SIGNIFICANT_VARIANCE");
    expect(result.data.exceedsHardReviewThreshold).toBe(false);
  });

  it("uses SME fixed tolerance when percentage tolerance is not selected", () => {
    const result = evaluateAmountResidual({
      fxScenarios: [fx("payment_date", "-200.00", 0.04, "5000.00")],
      policy: {
        ...DEFAULT_POLICY,
        smeConfig: {
          mode: "fixed",
          percentageValue: 0.02,
          fixedValue: "250.00"
        }
      }
    });
    if (!result.ok) return;
    expect(result.data.exceedsHardReviewThreshold).toBe(false);
  });

  it("uses the more forgiving threshold for SME hybrid tolerance", () => {
    const result = evaluateAmountResidual({
      fxScenarios: [fx("payment_date", "-300.00", 0.06, "5000.00")],
      policy: {
        ...DEFAULT_POLICY,
        smeConfig: {
          mode: "hybrid",
          percentageValue: 0.02,
          fixedValue: "350.00"
        }
      }
    });
    if (!result.ok) return;
    expect(result.data.exceedsHardReviewThreshold).toBe(false);
  });

  it("bands a >5% residual as unexplained", () => {
    const result = evaluateAmountResidual({
      fxScenarios: [fx("payment_date", "-3000.00", 0.07)],
      policy: DEFAULT_POLICY
    });
    if (!result.ok) return;
    expect(result.data.band).toBe("UNEXPLAINED");
    expect(result.data.exceedsHardReviewThreshold).toBe(true);
  });

  it("returns NO_SCENARIO when no FX scenario exists", () => {
    const result = evaluateAmountResidual({ fxScenarios: [], policy: DEFAULT_POLICY });
    if (!result.ok) return;
    expect(result.data.band).toBe("NO_SCENARIO");
    expect(result.data.bestScenario).toBeNull();
    expect(result.data.residualAmount).toBeNull();
    expect(result.data.exceedsHardReviewThreshold).toBe(true);
  });
});

function residual(band: AmountResidualResult["band"], residualAmount: string | null, residualPercent: number | null): AmountResidualResult {
  return {
    bestScenario: null,
    residualAmount,
    residualPercent,
    band,
    exceedsHardReviewThreshold: band === "SIGNIFICANT_VARIANCE" || band === "UNEXPLAINED" || band === "NO_SCENARIO",
    residualClassification:
      band === "WITHIN_TOLERANCE" ? "none" : residualAmount?.startsWith("-") ? "shortPayment" : residualAmount ? "overPayment" : "unexplained",
    absoluteCap: "250.00",
    exceedsAbsoluteCap: false
  };
}

describe("evaluateFeeHypothesis", () => {
  it("reports NONE when the residual is within tolerance", () => {
    const result = evaluateFeeHypothesis({
      residual: residual("WITHIN_TOLERANCE", "0.00", 0),
      policy: DEFAULT_POLICY
    });
    if (!result.ok) return;
    expect(result.data.direction).toBe("NONE");
    expect(result.data.amount).toBeNull();
    expect(result.data.hypotheses).toEqual([]);
  });

  it("flags a short payment as a possible fee or spread", () => {
    const result = evaluateFeeHypothesis({
      residual: residual("SIGNIFICANT_VARIANCE", "-1487.50", 0.035),
      policy: DEFAULT_POLICY
    });
    if (!result.ok) return;
    expect(result.data.direction).toBe("SHORT");
    expect(result.data.amount).toBe("1487.50");
    expect(result.data.hypotheses.length).toBeGreaterThan(0);
    expect(result.data.hypotheses.join(" ").toLowerCase()).toContain("possible");
  });

  it("flags an overpayment", () => {
    const result = evaluateFeeHypothesis({
      residual: residual("SIGNIFICANT_VARIANCE", "1487.50", 0.035),
      policy: DEFAULT_POLICY
    });
    if (!result.ok) return;
    expect(result.data.direction).toBe("OVER");
    expect(result.data.amount).toBe("1487.50");
    expect(result.data.hypotheses.join(" ").toLowerCase()).toContain("overpayment");
  });
});
