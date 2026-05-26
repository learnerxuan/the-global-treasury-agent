import type { CurrencyCode } from "../types";

// Single source of truth for every tunable reconciliation threshold. Tools
// receive a ReconciliationPolicy so behaviour is explicit and testable, never
// hidden in magic numbers scattered across the codebase.

export type SmeToleranceMode = "percentage" | "fixed" | "hybrid";

export type SmeToleranceConfig = {
  mode: SmeToleranceMode;
  percentageValue: number;
  fixedValue: string;
};

export type ReconciliationPolicy = {
  version: string;
  fx: {
    spreadMargins: number[];
    providerMode: "fixture" | "optional_live";
  };
  // Residual bands, as fractions (0.005 == 0.5%).
  residual: {
    withinTolerance: number; // <= this => strong amount match
    smallVariance: number; // <= this => plausible FX spread / small fee
    significantVariance: number; // <= this => risky discrepancy
    hardReviewThreshold: number; // > this => hard review override
    absoluteCaps: Partial<Record<CurrencyCode, string>>;
  };
  fees: {
    flatFeeHypotheses: string[];
  };
  reference: {
    ignoredYears: string[];
    genericTokens: string[];
  };
  autoMatch: {
    allowBalancedPartialReference: boolean;
    requireStrongAmountAndPartyForPartialReference: boolean;
  };
  batch: {
    maxInvoicesPerGroup: number;
    maxInvoicesPerCandidate: number;
  };
  // Scoring maxima per signal.
  score: {
    referenceExact: number;
    referencePartial: number;
    amountFxMax: number;
    dateMax: number;
    nameMax: number;
    confidenceMax: number;
    competitionPenalty: number;
  };
  // Date proximity bands, in days.
  dateProximity: {
    close: number; // <= close days => full date points
    near: number; // <= near days => partial
    plausible: number; // <= plausible days => low
  };
  // Classification score thresholds.
  classification: {
    autoMatched: number; // >= => AUTO_MATCHED
    likelyMatched: number; // >= => LIKELY_MATCHED
    needsReview: number; // >= => NEEDS_REVIEW, else UNMATCHED
  };
  // Competing-candidate score gap (points). Top two within this => competition.
  competitionGap: number;
  // Critical extraction-confidence floor. Below => hard review.
  confidenceFloor: number;
  // Settlement currency assumed for local bank deposits when not otherwise known.
  defaultLocalCurrency: CurrencyCode;
  // Agent loop limits.
  limits: {
    maxAgentSteps: number;
    maxToolRetries: number;
    maxClarificationsPerCase: number;
  };
  smeConfig?: SmeToleranceConfig;
};

const SME_TOLERANCE_MODES = new Set<SmeToleranceMode>(["percentage", "fixed", "hybrid"]);

function assertMoneyString(value: unknown): string {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new Error("smeConfig.fixedValue must be a non-negative decimal amount.");
  }
  return value.trim();
}

export function parseSmeToleranceConfig(value: unknown): SmeToleranceConfig | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") {
    throw new Error("smeConfig must be an object.");
  }

  const candidate = value as Partial<SmeToleranceConfig>;
  if (!SME_TOLERANCE_MODES.has(candidate.mode as SmeToleranceMode)) {
    throw new Error("smeConfig.mode must be percentage, fixed, or hybrid.");
  }
  if (typeof candidate.percentageValue !== "number" || !Number.isFinite(candidate.percentageValue) || candidate.percentageValue < 0 || candidate.percentageValue > 1) {
    throw new Error("smeConfig.percentageValue must be a decimal fraction between 0 and 1.");
  }

  return {
    mode: candidate.mode as SmeToleranceMode,
    percentageValue: candidate.percentageValue,
    fixedValue: assertMoneyString(candidate.fixedValue)
  };
}

export const DEFAULT_POLICY: ReconciliationPolicy = {
  version: "enterprise-v1-local",
  fx: {
    spreadMargins: [0, 0.01, 0.015, 0.02],
    providerMode: "fixture"
  },
  residual: {
    withinTolerance: 0.005,
    smallVariance: 0.02,
    significantVariance: 0.05,
    hardReviewThreshold: 0.02,
    absoluteCaps: {
      MYR: "250.00",
      USD: "50.00",
      SGD: "70.00",
      EUR: "50.00"
    }
  },
  fees: {
    flatFeeHypotheses: ["15.00", "25.00", "35.00", "50.00"]
  },
  reference: {
    ignoredYears: Array.from({ length: 16 }, (_, index) => String(2020 + index)),
    genericTokens: ["PAY", "PAYMENT", "TRX", "TXN", "REF", "BANK", "TRANSFER", "REMIT", "TT"]
  },
  autoMatch: {
    allowBalancedPartialReference: true,
    requireStrongAmountAndPartyForPartialReference: true
  },
  batch: {
    maxInvoicesPerGroup: 12,
    maxInvoicesPerCandidate: 5
  },
  score: {
    referenceExact: 35,
    referencePartial: 20,
    amountFxMax: 30,
    dateMax: 15,
    nameMax: 15,
    confidenceMax: 5,
    competitionPenalty: 20
  },
  dateProximity: {
    close: 1,
    near: 3,
    plausible: 7
  },
  classification: {
    autoMatched: 95,
    likelyMatched: 80,
    needsReview: 60
  },
  competitionGap: 10,
  confidenceFloor: 0.8,
  defaultLocalCurrency: "MYR",
  limits: {
    maxAgentSteps: 14,
    maxToolRetries: 1,
    maxClarificationsPerCase: 1
  }
};
