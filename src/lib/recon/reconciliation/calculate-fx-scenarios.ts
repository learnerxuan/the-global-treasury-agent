import type { MoneyAmount } from "../types";
import { lookupFxRate } from "./fx-table";
import { divideToRate, multiplyMoneyByRate, residualPercent, subtractMoney } from "./money";
import type { ReconciliationPolicy } from "./policy";
import type { FxScenarioBasis, FxScenarioResult, MatchCandidate, ToolResult } from "./types";

const TOOL_NAME = "calculateFxScenarios";

const BASIS_LABEL: Record<FxScenarioBasis, string> = {
  proof_rate: "Proof-extracted FX rate",
  bank_statement: "Bank-recorded FX rate",
  invoice_date: "Invoice issue-date FX",
  payment_date: "Payment-date FX",
  bank_date: "Bank booking-date FX",
  fallback: "Fallback fixture FX"
};

function selectFxSourceAmount(candidate: MatchCandidate, targetCurrency: MoneyAmount["currency"]): MoneyAmount | null {
  const expectedAmount = candidate.expectedPayment?.amountDue ?? null;
  const proofSourceAmount = candidate.proof?.financialPayload.sourceAmount ?? null;
  const proofPaidAmount = candidate.proof?.financialPayload.paidAmount ?? null;

  if (expectedAmount && expectedAmount.currency !== targetCurrency) return expectedAmount;
  if (proofSourceAmount && proofSourceAmount.currency !== targetCurrency) return proofSourceAmount;
  if (proofPaidAmount && proofPaidAmount.currency !== targetCurrency) return proofPaidAmount;

  return expectedAmount ?? proofSourceAmount ?? proofPaidAmount;
}

export function calculateFxScenarios(input: {
  candidate: MatchCandidate;
  policy: ReconciliationPolicy;
}): ToolResult<FxScenarioResult[]> {
  const { candidate } = input;
  const { bankTransaction, proof, expectedPayment } = candidate;

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

  // 1. Explicit proof FX rate, when present and oriented foreign -> target.
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
        isFallback: false
      })
    );
  }

  // 2. Bank-recorded FX. For a cross-border credit the receiving bank states the
  // foreign source amount and (often) the applied rate — authoritative ground
  // truth. When the rate is absent we derive it from amount / sourceAmount.
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
        isFallback: false
      })
    );
  }

  // 3-5. Date-based reference scenarios.
  const datedBases: { basis: FxScenarioBasis; date: string | null | undefined }[] = [
    { basis: "invoice_date", date: expectedPayment?.issueDate },
    { basis: "payment_date", date: proof?.financialPayload.paymentDate },
    { basis: "bank_date", date: bankTransaction.bookingDate }
  ];

  for (const { basis, date } of datedBases) {
    if (!date) continue;
    const lookup = lookupFxRate({ base: foreignCurrency, quote: targetCurrency, date });
    if (!lookup) continue;
    scenarios.push(
      finalize({
        scenarioId: `${candidate.candidateId}-FX-${basis}`,
        label: BASIS_LABEL[basis],
        basis,
        foreignAmount,
        rate: lookup.rate,
        rateDate: lookup.rateDate,
        rateSource: lookup.source,
        isFallback: lookup.isFallback
      })
    );
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
