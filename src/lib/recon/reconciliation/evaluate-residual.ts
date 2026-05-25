import { absMoney, isNegativeMoney } from "./money";
import type { ReconciliationPolicy } from "./policy";
import type {
  AmountResidualResult,
  FeeHypothesisResult,
  FxScenarioResult,
  ResidualBand,
  ToolResult
} from "./types";

const RESIDUAL_TOOL = "evaluateAmountResidual";
const FEE_TOOL = "evaluateFeeHypothesis";

function bandFor(residualPercent: number, policy: ReconciliationPolicy): ResidualBand {
  const r = policy.residual;
  if (residualPercent <= r.withinTolerance) return "WITHIN_TOLERANCE";
  if (residualPercent <= r.smallVariance) return "SMALL_VARIANCE";
  if (residualPercent <= r.significantVariance) return "SIGNIFICANT_VARIANCE";
  return "UNEXPLAINED";
}

export function evaluateAmountResidual(input: {
  fxScenarios: FxScenarioResult[];
  policy: ReconciliationPolicy;
}): ToolResult<AmountResidualResult> {
  const { fxScenarios, policy } = input;

  if (fxScenarios.length === 0) {
    return {
      ok: true,
      toolName: RESIDUAL_TOOL,
      data: {
        bestScenario: null,
        residualAmount: null,
        residualPercent: null,
        band: "NO_SCENARIO",
        exceedsHardReviewThreshold: true
      },
      summary: "No usable FX scenario; residual cannot be explained."
    };
  }

  // Lowest absolute residual percent wins; ties keep the earlier scenario.
  let best = fxScenarios[0]!;
  for (const scenario of fxScenarios) {
    if (Math.abs(scenario.residualPercent) < Math.abs(best.residualPercent)) {
      best = scenario;
    }
  }

  const residualPercent = Math.abs(best.residualPercent);
  const band = bandFor(residualPercent, policy);
  const exceedsHardReviewThreshold = residualPercent > policy.residual.hardReviewThreshold;

  return {
    ok: true,
    toolName: RESIDUAL_TOOL,
    data: {
      bestScenario: best,
      residualAmount: best.residualAmount,
      residualPercent,
      band,
      exceedsHardReviewThreshold
    },
    summary: `${best.label} best explains the amount with ${(residualPercent * 100).toFixed(2)}% residual (${band}).`
  };
}

export function evaluateFeeHypothesis(input: {
  residual: AmountResidualResult;
  policy: ReconciliationPolicy;
}): ToolResult<FeeHypothesisResult> {
  const { residual } = input;

  // No residual amount, or residual already within tolerance => nothing to explain.
  if (
    residual.residualAmount === null ||
    residual.band === "WITHIN_TOLERANCE" ||
    residual.band === "NO_SCENARIO"
  ) {
    return {
      ok: true,
      toolName: FEE_TOOL,
      data: { direction: "NONE", hypotheses: [], amount: null },
      summary: "Residual within tolerance; no fee hypothesis required."
    };
  }

  const amount = absMoney(residual.residualAmount);

  if (isNegativeMoney(residual.residualAmount)) {
    // Bank received less than expected.
    return {
      ok: true,
      toolName: FEE_TOOL,
      data: {
        direction: "SHORT",
        amount,
        hypotheses: [
          "Possible intermediary or bank fee deducted",
          "Possible FX spread between reference and settlement rate",
          "Possible partial or short payment"
        ]
      },
      summary: `Bank credit is ${amount} below the best FX explanation (possible fee/spread/short payment).`
    };
  }

  // Bank received more than expected.
  return {
    ok: true,
    toolName: FEE_TOOL,
    data: {
      direction: "OVER",
      amount,
      hypotheses: ["Possible overpayment", "Possible batch payment covering multiple invoices"]
    },
    summary: `Bank credit is ${amount} above the best FX explanation (possible overpayment/batch payment).`
  };
}
