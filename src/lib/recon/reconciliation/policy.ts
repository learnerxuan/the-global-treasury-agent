import type { CurrencyCode } from "../types";

// Single source of truth for every tunable reconciliation threshold. Tools
// receive a ReconciliationPolicy so behaviour is explicit and testable, never
// hidden in magic numbers scattered across the codebase.

export type ReconciliationPolicy = {
  // Residual bands, as fractions (0.005 == 0.5%).
  residual: {
    withinTolerance: number; // <= this => strong amount match
    smallVariance: number; // <= this => plausible FX spread / small fee
    significantVariance: number; // <= this => risky discrepancy
    hardReviewThreshold: number; // > this => hard review override
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
};

export const DEFAULT_POLICY: ReconciliationPolicy = {
  residual: {
    withinTolerance: 0.005,
    smallVariance: 0.02,
    significantVariance: 0.05,
    hardReviewThreshold: 0.02
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
