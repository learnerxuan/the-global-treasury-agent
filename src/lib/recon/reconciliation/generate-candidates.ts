import { normalize_reference } from "../normalizers";
import type {
  BankStatementTransaction,
  ExpectedPaymentRecord,
  MoneyAmount,
  NormalizedInputBatch,
  NormalizedPaymentProofRecord
} from "../types";
import { compareMoney, sumMoney } from "./money";
import type { ReconciliationPolicy } from "./policy";
import { LocalCounterpartyIdentityStore, type CounterpartyIdentityStore } from "./stores";
import type { AllocationReason, CandidateSet, CandidateSignal, MatchCandidate, PaymentAllocation, ToolResult } from "./types";

const TOOL_NAME = "generateBankAnchoredCandidates";
const REJECTED_STATUSES = new Set(["RJCT", "CANC"]);

function dayDistanceDays(a: string, b: string): number {
  const msA = new Date(`${a.slice(0, 10)}T00:00:00.000Z`).getTime();
  const msB = new Date(`${b.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.abs(msA - msB) / 86_400_000;
}

function bankReferenceSet(bank: BankStatementTransaction): Set<string> {
  const refs = new Set<string>();
  const structured = normalize_reference(bank.remittanceInformation.structured?.invoiceNumber ?? null);
  if (structured) refs.add(structured);
  if (bank.normalizedReference) refs.add(bank.normalizedReference);
  return refs;
}

function bankTextNormalized(bank: BankStatementTransaction): string | null {
  return normalize_reference(bank.description ?? bank.remittanceInformation.raw ?? null);
}

function referenceLinked(refs: Set<string>, text: string | null, target: string | null): boolean {
  if (!target) return false;
  if (refs.has(target)) return true;
  return text !== null && text.includes(target);
}

function compactReference(input: string, policy: ReconciliationPolicy): string {
  const withoutIgnoredYears = policy.reference.ignoredYears.reduce((value, year) => value.replace(new RegExp(year, "g"), ""), input);
  let compact = withoutIgnoredYears;
  for (const token of policy.reference.genericTokens) {
    compact = compact.replace(new RegExp(token, "g"), "");
  }
  return compact;
}

function alphaPrefix(ref: string): string | null {
  return ref.match(/^[A-Z]+/)?.[0] ?? null;
}

function meaningfulNumericRuns(ref: string, policy: ReconciliationPolicy): string[] {
  return (ref.match(/\d{3,}/g) ?? []).filter((run) => !policy.reference.ignoredYears.includes(run));
}

function partialReferenceMatch(a: string | null, b: string | null, policy: ReconciliationPolicy): boolean {
  if (!a || !b || a === b) return false;
  const compactA = compactReference(a, policy);
  const compactB = compactReference(b, policy);
  if (!compactA || !compactB) return false;

  if (compactA.length >= 5 && compactB.length >= 5 && (compactA.includes(compactB) || compactB.includes(compactA))) {
    const prefixA = alphaPrefix(compactA);
    const prefixB = alphaPrefix(compactB);
    return prefixA === null || prefixB === null || prefixA === prefixB;
  }

  const runsA = meaningfulNumericRuns(compactA, policy);
  const runsB = meaningfulNumericRuns(compactB, policy);
  return runsA.some((x) =>
    runsB.some((y) => (x === y || x.includes(y) || y.includes(x)) && (x.length >= 4 || y.length >= 4))
  );
}

function amountEqual(a: MoneyAmount | null | undefined, b: MoneyAmount | null | undefined): boolean {
  return a != null && b != null && a.currency === b.currency && compareMoney(a.value, b.value) === 0;
}

// Bank charge/fee rows (e.g. "INWARD TT FEE REF-...", "SERVICE CHARGE") are not
// settlements — they are the bank's own deduction tied to a credit. They must not
// be reconciled as standalone cases; the fee instead explains a small residual on
// the related credit. Only DBIT rows that read as a fee/charge are excluded, so
// genuine outgoing-payment debits still reconcile.
const FEE_ROW_PATTERN = /\b(FEE|FEES|CHARGE|CHARGES|COMMISSION|SVC\s*CHG|SERVICE\s*CHG|SERVICE\s*CHARGE|HANDLING)\b/i;

export function isBankFeeRow(tx: BankStatementTransaction): boolean {
  if (tx.creditDebitIndicator !== "DBIT") return false;
  const text = `${tx.description ?? ""} ${tx.remittanceInformation?.raw ?? ""}`;
  return FEE_ROW_PATTERN.test(text);
}

function isReconcilableSettlementRow(tx: BankStatementTransaction): boolean {
  return compareMoney(tx.amount.value, "0") !== 0 && !isBankFeeRow(tx);
}

function canReceivePayment(expected: ExpectedPaymentRecord): boolean {
  return expected.reconciliationStatus === "OPEN" || expected.reconciliationStatus === "PARTIALLY_MATCHED";
}

function proofComparableAmounts(proof: NormalizedPaymentProofRecord | null): Array<MoneyAmount | null | undefined> {
  if (!proof) return [];
  return [
    proof.financialPayload.paidAmount,
    proof.financialPayload.targetAmount,
    proof.financialPayload.sourceAmount,
    proof.financialPayload.netAmount,
    proof.financialPayload.feeAmount
  ];
}

function exactNameMatch(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

function similarName(a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return false;
  const left = a.replace(/\s+/g, "");
  const right = b.replace(/\s+/g, "");
  return left.length >= 5 && right.length >= 5 && (left.includes(right) || right.includes(left));
}

function partySignals(input: {
  leftName: string | null;
  rightName: string | null;
  leftAccount?: import("../types").AccountIdentifier | null;
  rightAccount?: import("../types").AccountIdentifier | null;
  exactDetail: string;
  aliasDetail: string;
  accountDetail: string;
  similarDetail: string;
  identityStore: CounterpartyIdentityStore;
}): CandidateSignal[] {
  if (input.leftAccount && input.rightAccount && input.identityStore.accountsMatch(input.leftAccount, input.rightAccount)) {
    return [{ code: "COUNTERPARTY_ACCOUNT_MATCH", strength: "STRONG", detail: input.accountDetail }];
  }
  if (exactNameMatch(input.leftName, input.rightName)) {
    return [{ code: "NAME_MATCH", strength: "MEDIUM", detail: input.exactDetail }];
  }
  if (input.identityStore.namesMatch(input.leftName, input.rightName)) {
    return [{ code: "COUNTERPARTY_ALIAS_MATCH", strength: "STRONG", detail: input.aliasDetail }];
  }
  if (similarName(input.leftName, input.rightName)) {
    return [{ code: "NAME_SIMILAR", strength: "MEDIUM", detail: input.similarDetail }];
  }
  return [];
}

function bankProofSignals(bank: BankStatementTransaction, proof: NormalizedPaymentProofRecord, identityStore: CounterpartyIdentityStore): CandidateSignal[] {
  const signals: CandidateSignal[] = [];
  const refs = bankReferenceSet(bank);
  const text = bankTextNormalized(bank);
  const proofRef = proof.financialPayload.reference.normalized;

  if (referenceLinked(refs, text, proofRef)) {
    signals.push({ code: "EXACT_REFERENCE_MATCH", strength: "STRONG", detail: `Bank references proof ${proofRef}.` });
  }

  const proofAmounts = proofComparableAmounts(proof);
  const matchesLocal = proofAmounts.some((amount) => amountEqual(amount, bank.amount));
  const matchesSource = proofAmounts.some((amount) => amountEqual(amount, bank.sourceAmount));
  if (matchesLocal || matchesSource) {
    signals.push({
      code: "AMOUNT_EQUALS_BANK",
      strength: "STRONG",
      detail: matchesSource ? "Proof amount equals bank-recorded source amount." : "Proof amount equals bank credit."
    });
  }
  signals.push(
    ...partySignals({
      leftName: bank.debtorNormalizedName,
      rightName: proof.financialPayload.debtor.normalizedName,
      leftAccount: bank.debtorAccount,
      rightAccount: proof.financialPayload.debtorAccount,
      exactDetail: "Payer name matches bank debtor.",
      aliasDetail: "Payer is a known alias of the bank debtor.",
      accountDetail: "Payer account matches the bank debtor account.",
      similarDetail: "Payer name is similar to the bank debtor.",
      identityStore
    })
  );
  const proofDate = proof.financialPayload.paymentDate;
  if (proofDate && dayDistanceDays(proofDate, bank.bookingDate) <= 7) {
    signals.push({ code: "DATE_CLOSE", strength: "MEDIUM", detail: "Payment date near bank booking date." });
  }
  return signals;
}

function expectedLinkSignals(
  bank: BankStatementTransaction,
  proof: NormalizedPaymentProofRecord | null,
  expected: ExpectedPaymentRecord,
  policy: ReconciliationPolicy,
  identityStore: CounterpartyIdentityStore
): CandidateSignal[] {
  const signals: CandidateSignal[] = [];
  const refs = bankReferenceSet(bank);
  const text = bankTextNormalized(bank);
  const expectedRef = expected.paymentReference.normalized;
  const proofRef = proof?.financialPayload.reference.normalized ?? null;

  const linkedToBank = referenceLinked(refs, text, expectedRef);
  const linkedToProof = expectedRef !== null && proofRef !== null && expectedRef === proofRef;
  if (linkedToBank || linkedToProof) {
    signals.push({ code: "EXACT_REFERENCE_MATCH", strength: "STRONG", detail: `Expected payment ${expectedRef} reference chain.` });
  } else if (partialReferenceMatch(expectedRef, proofRef, policy)) {
    signals.push({
      code: "PARTIAL_REFERENCE_MATCH",
      strength: "MEDIUM",
      detail: `Expected payment ${expectedRef} shares a non-generic reference core with proof ${proofRef}.`
    });
  }

  const expectedAmount = expected.outstandingAmount ?? expected.amountDue;
  const matchesProof = proofComparableAmounts(proof).some((amount) => amountEqual(amount, expectedAmount));
  const matchesBankSource = amountEqual(expectedAmount, bank.sourceAmount);
  if (matchesProof || matchesBankSource) {
    signals.push({
      code: "AMOUNT_MATCHES_EXPECTED",
      strength: "MEDIUM",
      detail: matchesBankSource ? "Invoice amount equals bank-recorded source amount." : "Proof amount equals invoiced amount."
    });
  }
  const bankExpectedSignals = partySignals({
    leftName: bank.debtorNormalizedName,
    rightName: expected.debtor.normalizedName,
    leftAccount: bank.debtorAccount,
    rightAccount: expected.debtorAccount,
    exactDetail: "Invoice debtor matches bank debtor.",
    aliasDetail: "Invoice debtor is a known alias of the bank debtor.",
    accountDetail: "Invoice debtor account matches the bank debtor account.",
    similarDetail: "Invoice debtor name is similar to the bank debtor.",
    identityStore
  });
  if (bankExpectedSignals.length > 0) {
    signals.push(...bankExpectedSignals);
  } else if (proof) {
    signals.push(
      ...partySignals({
        leftName: proof.financialPayload.debtor.normalizedName,
        rightName: expected.debtor.normalizedName,
        leftAccount: proof.financialPayload.debtorAccount,
        rightAccount: expected.debtorAccount,
        exactDetail: "Proof payer matches invoice debtor.",
        aliasDetail: "Proof payer is a known alias of the invoice debtor.",
        accountDetail: "Proof payer account matches the invoice debtor account.",
        similarDetail: "Proof payer name is similar to the invoice debtor.",
        identityStore
      })
    );
  }
  return signals;
}

function meetsThreshold(signals: CandidateSignal[]): boolean {
  const strong = signals.filter((s) => s.strength === "STRONG").length;
  const medium = signals.filter((s) => s.strength === "MEDIUM").length;
  return strong >= 1 || medium >= 2;
}

function expectedBridgeQualifies(
  bank: BankStatementTransaction,
  proof: NormalizedPaymentProofRecord,
  expected: ExpectedPaymentRecord,
  bpSignals: CandidateSignal[],
  policy: ReconciliationPolicy
): boolean {
  const refs = bankReferenceSet(bank);
  const text = bankTextNormalized(bank);
  const expectedRef = expected.paymentReference.normalized;
  const proofRef = proof.financialPayload.reference.normalized;
  const expectedLinkedToBank = referenceLinked(refs, text, expectedRef);
  const expectedLinkedToProof =
    expectedRef !== null && proofRef !== null && (expectedRef === proofRef || partialReferenceMatch(expectedRef, proofRef, policy));
  const expectedAmount = expected.outstandingAmount ?? expected.amountDue;
  const expectedAmountMatchesProof = proofComparableAmounts(proof).some((amount) => amountEqual(amount, expectedAmount));
  // A foreign-currency amount match (proof + invoice in a currency other than the
  // bank's settlement currency) is the cross-border signature: the bank credit is
  // local currency after FX, so an exact foreign-amount match is a meaningful link,
  // not a round-number coincidence. A same-currency local amount match alone is NOT
  // enough to attach an invoice (that stays the deliberate precision guard).
  const foreignAmountBridge = expectedAmount.currency !== bank.amount.currency && expectedAmountMatchesProof;
  const proofBankIsPlausible = meetsThreshold(bpSignals);

  if (expectedLinkedToBank) return expectedLinkedToProof || expectedAmountMatchesProof || proofBankIsPlausible;
  // Not reference-linked to the bank: real-world transfers carry the bank's own
  // wire/TT reference (e.g. "REF-E8DEDE16"), not the invoice number. Attach when the
  // invoice/proof reference cores match, OR a cross-border foreign amount matches
  // exactly — provided the proof is already strongly tied to this bank credit.
  // Competition detection guards the case where several invoices share an amount.
  return (expectedLinkedToProof || foreignAmountBridge) && proofBankIsPlausible;
}

function amountForAllocation(expected: ExpectedPaymentRecord): MoneyAmount {
  if (
    expected.outstandingAmount &&
    expected.outstandingAmount.currency === expected.amountDue.currency &&
    (expected.reconciliationStatus === "PARTIALLY_MATCHED" || compareMoney(expected.outstandingAmount.value, expected.amountDue.value) === 0)
  ) {
    return expected.outstandingAmount;
  }
  return expected.amountDue;
}

function buildAllocations(expecteds: ExpectedPaymentRecord[], reason: AllocationReason): PaymentAllocation[] {
  return expecteds.map((expected) => {
    const amount = amountForAllocation(expected);
    return {
      expectedPaymentId: expected.expectedPaymentId,
      invoiceNumber: expected.invoiceNumber,
      appliedAmount: amount,
      remainingAmount: { value: "0.00", currency: amount.currency },
      reason
    };
  });
}

function makeCandidate(
  candidateId: string,
  bank: BankStatementTransaction,
  proof: NormalizedPaymentProofRecord | null,
  expected: ExpectedPaymentRecord | null,
  signals: CandidateSignal[]
): MatchCandidate {
  return {
    candidateId,
    candidateKind: expected ? "single_invoice" : proof ? "proof_only" : "bank_only",
    bankTransactionId: bank.internalTxId,
    ...(proof ? { proofId: proof.proofId } : {}),
    ...(expected ? { expectedPaymentId: expected.expectedPaymentId, expectedPaymentIds: [expected.expectedPaymentId] } : {}),
    signals,
    bankTransaction: bank,
    ...(proof ? { proof } : {}),
    ...(expected
      ? {
          expectedPayment: expected,
          expectedPayments: [expected],
          allocations: buildAllocations([expected], "single_invoice")
        }
      : {})
  };
}

function makeBatchCandidate(
  candidateId: string,
  bank: BankStatementTransaction,
  proof: NormalizedPaymentProofRecord,
  expecteds: ExpectedPaymentRecord[],
  signals: CandidateSignal[],
  reason: AllocationReason
): MatchCandidate {
  const first = expecteds[0]!;
  return {
    candidateId,
    candidateKind: "batch_invoices",
    bankTransactionId: bank.internalTxId,
    proofId: proof.proofId,
    expectedPaymentId: first.expectedPaymentId,
    expectedPaymentIds: expecteds.map((expected) => expected.expectedPaymentId),
    signals,
    bankTransaction: bank,
    proof,
    expectedPayment: first,
    expectedPayments: expecteds,
    allocations: buildAllocations(expecteds, reason)
  };
}

function normalizedInvoiceIdSet(proof: NormalizedPaymentProofRecord): Set<string> {
  return new Set((proof.financialPayload.invoiceIds ?? []).map((id) => normalize_reference(id)).filter((id): id is string => id !== null));
}

function remittanceBatchExpecteds(proof: NormalizedPaymentProofRecord, expecteds: ExpectedPaymentRecord[]): ExpectedPaymentRecord[] {
  const ids = normalizedInvoiceIdSet(proof);
  if (ids.size < 2) return [];
  return expecteds.filter((expected) => {
    const refs = [expected.invoiceNumber, expected.paymentReference.raw, expected.paymentReference.normalized]
      .map((value) => normalize_reference(value ?? null))
      .filter((value): value is string => value !== null);
    return refs.some((ref) => ids.has(ref));
  });
}

function sumExpected(expecteds: ExpectedPaymentRecord[]): MoneyAmount | null {
  const currency = expecteds[0] ? amountForAllocation(expecteds[0]).currency : null;
  if (!currency || !expecteds.every((expected) => amountForAllocation(expected).currency === currency)) return null;
  return { value: sumMoney(expecteds.map((expected) => amountForAllocation(expected).value)), currency };
}

function amountMatchesBankOrProof(sum: MoneyAmount, bank: BankStatementTransaction, proof: NormalizedPaymentProofRecord): boolean {
  return amountEqual(sum, bank.amount) || amountEqual(sum, bank.sourceAmount) || proofComparableAmounts(proof).some((amount) => amountEqual(sum, amount));
}

function combinations<T>(items: T[], maxSize: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, picked: T[]) => {
    if (picked.length > 1) out.push([...picked]);
    if (picked.length >= maxSize) return;
    for (let i = start; i < items.length; i += 1) {
      picked.push(items[i]!);
      walk(i + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return out;
}

function subsetSumBatchExpecteds(
  bank: BankStatementTransaction,
  proof: NormalizedPaymentProofRecord,
  expecteds: ExpectedPaymentRecord[],
  policy: ReconciliationPolicy,
  identityStore: CounterpartyIdentityStore
): ExpectedPaymentRecord[] {
  const debtor = proof.financialPayload.debtor.normalizedName ?? bank.debtorNormalizedName;
  const group = expecteds
    .filter(canReceivePayment)
    .filter((expected) => (debtor ? exactNameMatch(expected.debtor.normalizedName, debtor) || identityStore.namesMatch(expected.debtor.normalizedName, debtor) : true))
    .slice(0, policy.batch.maxInvoicesPerGroup);

  for (const combo of combinations(group, policy.batch.maxInvoicesPerCandidate)) {
    const sum = sumExpected(combo);
    if (sum && amountMatchesBankOrProof(sum, bank, proof)) return combo;
  }
  return [];
}

export function generateBankAnchoredCandidates(input: {
  batch: NormalizedInputBatch;
  policy: ReconciliationPolicy;
  counterpartyIdentityStore?: CounterpartyIdentityStore;
}): ToolResult<CandidateSet> {
  const { batch, policy } = input;
  const identityStore = input.counterpartyIdentityStore ?? new LocalCounterpartyIdentityStore();
  const candidatesByBankTx: Record<string, MatchCandidate[]> = {};
  const unmatchedBankTxIds: string[] = [];

  const settlementRows = batch.bankTransactions.filter(isReconcilableSettlementRow);
  const proofs = batch.paymentProofs.filter((p) => !REJECTED_STATUSES.has(p.financialPayload.paymentStatus));

  let candidateSeq = 0;

  for (const bank of settlementRows) {
    const perBank: MatchCandidate[] = [];

    for (const proof of proofs) {
      const bpSignals = bankProofSignals(bank, proof, identityStore);
      const openExpecteds = batch.expectedPayments.filter(canReceivePayment);
      const remittanceExpecteds = remittanceBatchExpecteds(proof, openExpecteds);
      if (remittanceExpecteds.length > 1) {
        const sum = sumExpected(remittanceExpecteds);
        if (sum && amountMatchesBankOrProof(sum, bank, proof)) {
          candidateSeq += 1;
          perBank.push(
            makeBatchCandidate(`CAND-${String(candidateSeq).padStart(3, "0")}`, bank, proof, remittanceExpecteds, [
              ...bpSignals,
              { code: "EXACT_REFERENCE_MATCH", strength: "STRONG", detail: "Remittance advice lists the settled invoices." },
              { code: "AMOUNT_MATCHES_EXPECTED", strength: "MEDIUM", detail: "Remittance invoice total matches settlement amount." },
              { code: "NAME_MATCH", strength: "MEDIUM", detail: "Remittance invoices share the payer identity." }
            ], "remittance_advice")
          );
          continue;
        }
      }

      const subsetExpecteds = subsetSumBatchExpecteds(bank, proof, openExpecteds, policy, identityStore);
      if (subsetExpecteds.length > 1) {
        candidateSeq += 1;
        perBank.push(
          makeBatchCandidate(`CAND-${String(candidateSeq).padStart(3, "0")}`, bank, proof, subsetExpecteds, [
            ...bpSignals,
            { code: "AMOUNT_MATCHES_EXPECTED", strength: "MEDIUM", detail: "Subset of open invoices sums to the settlement amount." },
            { code: "NAME_MATCH", strength: "MEDIUM", detail: "Subset invoices share the payer identity." }
          ], "subset_sum")
        );
        continue;
      }

      const linkedExpecteds = openExpecteds
        .map((expected) => ({ expected, signals: expectedLinkSignals(bank, proof, expected, policy, identityStore) }))
        .filter(({ expected }) => expectedBridgeQualifies(bank, proof, expected, bpSignals, policy));

      if (linkedExpecteds.length > 0) {
        for (const { expected, signals: expectedSignals } of linkedExpecteds) {
          const signals = [...bpSignals, ...expectedSignals];
          if (!meetsThreshold(signals)) continue;
          candidateSeq += 1;
          perBank.push(makeCandidate(`CAND-${String(candidateSeq).padStart(3, "0")}`, bank, proof, expected, signals));
        }
      } else if (meetsThreshold(bpSignals)) {
        candidateSeq += 1;
        perBank.push(makeCandidate(`CAND-${String(candidateSeq).padStart(3, "0")}`, bank, proof, null, bpSignals));
      }
    }

    if (perBank.length > 0) {
      candidatesByBankTx[bank.internalTxId] = perBank;
    } else {
      unmatchedBankTxIds.push(bank.internalTxId);
    }
  }

  const total = Object.values(candidatesByBankTx).reduce((sum, list) => sum + list.length, 0);
  return {
    ok: true,
    toolName: TOOL_NAME,
    data: { candidatesByBankTx, unmatchedBankTxIds },
    summary: `Generated ${total} candidate(s) across ${settlementRows.length} bank settlement row(s); ${unmatchedBankTxIds.length} unmatched.`
  };
}
