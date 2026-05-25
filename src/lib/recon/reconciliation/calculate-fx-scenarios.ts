import type { ExpectedPaymentRecord, MoneyAmount } from "../types";
import { defaultFxRateProvider, type FxProviderRate, type FxRateProvider } from "./fx-provider";
import { compareMoney, divideToRate, multiplyMoneyByRate, residualPercent, subtractMoney, sumMoney } from "./money";
import type { ReconciliationPolicy } from "./policy";
import type { FxScenarioBasis, FxScenarioResult, FxSourceKind, MatchCandidate, ToolResult } from "./types";

const TOOL_NAME = "calculateFxScenarios";

const BASIS_LABEL: Record<FxScenarioBasis, string> = {
  proof_rate: "Proof-extracted FX rate",
  bank_statement: "Bank-recorded FX rate",
  invoice_date: "Invoice issue-date FX",
  payment_date: "Payment-date FX",
  bank_date: "Bank booking-date FX",
  fallback: "Fallback fixture FX"
};

function effectiveExpectedAmount(expected: ExpectedPaymentRecord): MoneyAmount {
  if (
    expected.outstandingAmount &&
    expected.outstandingAmount.currency === expected.amountDue.currency &&
    (expected.reconciliationStatus === "PARTIALLY_MATCHED" || compareMoney(expected.outstandingAmount.value, expected.amountDue.value) === 0)
  ) {
    return expected.outstandingAmount;
  }
  return expected.amountDue;
}

function selectFxSourceAmount(candidate: MatchCandidate, targetCurrency: MoneyAmount["currency"]): MoneyAmount | null {
  const expectedPayments = candidate.expectedPayments ?? [];
  if (expectedPayments.length > 1) {
    const currency = effectiveExpectedAmount(expectedPayments[0]!).currency;
    if (currency && expectedPayments.every((expected) => effectiveExpectedAmount(expected).currency === currency)) {
      return {
        value: sumMoney(expectedPayments.map((expected) => effectiveExpectedAmount(expected).value)),
        currency
      };
    }
  }

  const expectedAmount = candidate.expectedPayment
    ? effectiveExpectedAmount(candidate.expectedPayment)
    : null;
  const proofSourceAmount = candidate.proof?.financialPayload.sourceAmount ?? null;
  const proofPaidAmount = candidate.proof?.financialPayload.paidAmount ?? null;

  if (expectedAmount && expectedAmount.currency !== targetCurrency) return expectedAmount;
  if (proofSourceAmount && proofSourceAmount.currency !== targetCurrency) return proofSourceAmount;
  if (proofPaidAmount && proofPaidAmount.currency !== targetCurrency) return proofPaidAmount;

  return expectedAmount ?? proofSourceAmount ?? proofPaidAmount;
}

function sourceKindForRate(rate: FxProviderRate): FxSourceKind {
  if (rate.source === "same_currency" || rate.source === "market_cached" || rate.source === "live_api") return "market_cached";
  return "fixture_fallback";
}

function applyRateSpread(rate: string, margin: number, direction: "up" | "down"): string {
  if (margin === 0) return rate;
  const multiplier = direction === "up" ? 1 + margin : 1 - margin;
  return (Number(rate) * multiplier).toFixed(6);
}

export function calculateFxScenarios(input: {
  candidate: MatchCandidate;
  policy: ReconciliationPolicy;
  fxProvider?: FxRateProvider;
}): ToolResult<FxScenarioResult[]> {
  const { candidate, policy } = input;
  const { bankTransaction, proof, expectedPayment } = candidate;
  const fxProvider = input.fxProvider ?? defaultFxRateProvider;

  const bankAmount = bankTransaction.amount;
  const targetCurrency = bankAmount.currency;
  const foreignAmount = selectFxSourceAmount(candidate, targetCurrency);

  if (!foreignAmount) {
    return {
      ok: true,
      toolName: TOOL_NAME,
      data: [],
      summary: "No foreign amount available to build FX scenarios."
    };
  }

  const foreignCurrency = foreignAmount.currency;
  const scenarios: FxScenarioResult[] = [];

  const finalize = (partial: Omit<FxScenarioResult, "expectedLocalAmount" | "residualAmount" | "residualPercent">): FxScenarioResult => {
    const expectedValue = multiplyMoneyByRate(foreignAmount.value, partial.rate);
    const residual = subtractMoney(bankAmount.value, expectedValue);
    return {
      ...partial,
      expectedLocalAmount: { value: expectedValue, currency: targetCurrency },
      residualAmount: residual,
      residualPercent: residualPercent(residual, expectedValue)
    };
  };

  const bankSource = bankTransaction.sourceAmount;
  if (bankSource && bankSource.currency === foreignCurrency && Number(bankSource.value) !== 0) {
    const bankRate = bankTransaction.exchangeRateApplied ?? divideToRate(bankAmount.value, bankSource.value);
    scenarios.push(
      finalize({
        scenarioId: `${candidate.candidateId}-FX-bank_statement`,
        label: BASIS_LABEL.bank_statement,
        basis: "bank_statement",
        foreignAmount,
        rate: bankRate,
        rateDate: bankTransaction.bookingDate,
        rateSource: "bank",
        fxSourceKind: "bank_actual",
        spreadMargin: 0,
        isFallback: false
      })
    );
  }
  if (
    !bankSource &&
    bankTransaction.creditDebitIndicator === "DBIT" &&
    foreignCurrency !== targetCurrency &&
    Number(foreignAmount.value) !== 0 &&
    candidate.signals.some((signal) => signal.code === "EXACT_REFERENCE_MATCH")
  ) {
    scenarios.push(
      finalize({
        scenarioId: `${candidate.candidateId}-FX-bank_statement_implied`,
        label: BASIS_LABEL.bank_statement,
        basis: "bank_statement",
        foreignAmount,
        rate: divideToRate(bankAmount.value, foreignAmount.value),
        rateDate: bankTransaction.bookingDate,
        rateSource: "bank",
        fxSourceKind: "bank_actual",
        spreadMargin: 0,
        isFallback: false
      })
    );
  }

  const proofFx = proof?.financialPayload.exchangeRateInformation ?? null;
  if (
    proofFx?.exchangeRate &&
    proofFx.unitCurrency === foreignCurrency &&
    proofFx.quotedCurrency === targetCurrency
  ) {
    scenarios.push(
      finalize({
        scenarioId: `${candidate.candidateId}-FX-proof_rate`,
        label: BASIS_LABEL.proof_rate,
        basis: "proof_rate",
        foreignAmount,
        rate: proofFx.exchangeRate,
        rateDate: null,
        rateSource: "proof",
        fxSourceKind: "proof_declared",
        spreadMargin: 0,
        isFallback: false
      })
    );
  }

  const datedBases: { basis: FxScenarioBasis; date: string | null | undefined }[] = [
    { basis: "invoice_date", date: expectedPayment?.issueDate ?? candidate.expectedPayments?.[0]?.issueDate },
    { basis: "payment_date", date: proof?.financialPayload.paymentDate },
    { basis: "bank_date", date: bankTransaction.bookingDate }
  ];

  for (const { basis, date } of datedBases) {
    if (!date) continue;
    const lookup = fxProvider.lookup({ base: foreignCurrency, quote: targetCurrency, date });
    if (!lookup) continue;
    const fxSourceKind = sourceKindForRate(lookup);
    const base = finalize({
      scenarioId: `${candidate.candidateId}-FX-${basis}`,
      label: BASIS_LABEL[basis],
      basis,
      foreignAmount,
      rate: lookup.rate,
      rateDate: lookup.rateDate,
      rateSource: lookup.source,
      providerId: lookup.providerId,
      fxSourceKind,
      spreadMargin: 0,
      isFallback: lookup.isFallback
    });
    scenarios.push(base);

    if (foreignCurrency === targetCurrency || fxSourceKind !== "market_cached") continue;
    for (const margin of policy.fx.spreadMargins.filter((value) => value > 0)) {
      for (const direction of ["up", "down"] as const) {
        scenarios.push(
          finalize({
            ...base,
            scenarioId: `${candidate.candidateId}-FX-${basis}-spread-${direction}-${margin}`,
            label: `${BASIS_LABEL[basis]} ${(margin * 100).toFixed(1)}% spread ${direction}`,
            rate: applyRateSpread(lookup.rate, margin, direction),
            fxSourceKind: "spread_adjusted",
            spreadMargin: direction === "up" ? margin : -margin
          })
        );
      }
    }
  }

  return {
    ok: true,
    toolName: TOOL_NAME,
    data: scenarios,
    summary:
      scenarios.length === 0
        ? `No FX scenario available for ${foreignCurrency}->${targetCurrency}.`
        : `Built ${scenarios.length} FX scenario(s) for ${foreignCurrency}->${targetCurrency}.`
  };
}
