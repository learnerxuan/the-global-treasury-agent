import { normalize_reference } from "../normalizers";
import type {
  BankStatementTransaction,
  ExpectedPaymentRecord,
  MoneyAmount,
  NormalizedInputBatch,
  NormalizedPaymentProofRecord
} from "../types";
import { compareMoney } from "./money";
import type { ReconciliationPolicy } from "./policy";
import type { CandidateSet, CandidateSignal, MatchCandidate, ToolResult } from "./types";

const TOOL_NAME = "generateBankAnchoredCandidates";

// Payment statuses we will not even build matching candidates for.
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

// True when two normalized references are not identical but share an invoice
// core — one contains the other (>=5 chars) or they share a >=4-digit run (one
// digit run contained in the other). Catches "1007" vs "INV20261007",
// "RP1005" vs "RP20261005", "INV1006GL" vs "INV20261006".
function partialReferenceMatch(a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return false;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return true;
  const runsA = a.match(/\d{4,}/g) ?? [];
  const runsB = b.match(/\d{4,}/g) ?? [];
  return runsA.some((x) => runsB.some((y) => x === y || x.includes(y) || y.includes(x)));
}


function amountEqual(a: MoneyAmount | null | undefined, b: MoneyAmount | null | undefined): boolean {
  return a != null && b != null && a.currency === b.currency && compareMoney(a.value, b.value) === 0;
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

function nameMatch(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

// Signals tying a bank credit to a payment proof.
function bankProofSignals(bank: BankStatementTransaction, proof: NormalizedPaymentProofRecord): CandidateSignal[] {
  const signals: CandidateSignal[] = [];
  const refs = bankReferenceSet(bank);
  const text = bankTextNormalized(bank);
  const proofRef = proof.financialPayload.reference.normalized;

  if (referenceLinked(refs, text, proofRef)) {
    signals.push({ code: "EXACT_REFERENCE_MATCH", strength: "STRONG", detail: `Bank references proof ${proofRef}.` });
  }
  // Note: we intentionally do NOT fuzzy-match against the bank's machine reference
  // (e.g. "REF20260521001") — its digit runs collide with invoice numbers and
  // produce false links. Bank↔proof relies on exact reference or amount instead.

  // The bank credit is local currency; cross-border proofs are foreign currency.
  // Match against bank.amount (local) OR bank.sourceAmount (the foreign amount the
  // bank itself recorded for the incoming remittance).
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
  if (nameMatch(bank.debtorNormalizedName, proof.financialPayload.debtor.normalizedName)) {
    signals.push({ code: "NAME_MATCH", strength: "MEDIUM", detail: "Payer name matches bank debtor." });
  }
  const proofDate = proof.financialPayload.paymentDate;
  if (proofDate && dayDistanceDays(proofDate, bank.bookingDate) <= 7) {
    signals.push({ code: "DATE_CLOSE", strength: "MEDIUM", detail: "Payment date near bank booking date." });
  }
  return signals;
}

// Signals tying an expected payment to the bank credit and/or the proof.
function expectedLinkSignals(
  bank: BankStatementTransaction,
  proof: NormalizedPaymentProofRecord | null,
  expected: ExpectedPaymentRecord
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
  } else if (partialReferenceMatch(expectedRef, proofRef)) {
    // Only fuzzy-match invoice ref against the proof ref (both invoice-number
    // derived) — never against the bank's machine reference.
    signals.push({ code: "PARTIAL_REFERENCE_MATCH", strength: "MEDIUM", detail: `Expected payment ${expectedRef} shares a reference core with proof ${proofRef}.` });
  }
  const matchesProof = proofComparableAmounts(proof).some((amount) => amountEqual(amount, expected.amountDue));
  const matchesBankSource = amountEqual(expected.amountDue, bank.sourceAmount);
  if (matchesProof || matchesBankSource) {
    signals.push({
      code: "AMOUNT_MATCHES_EXPECTED",
      strength: "MEDIUM",
      detail: matchesBankSource ? "Invoice amount equals bank-recorded source amount." : "Proof amount equals invoiced amount."
    });
  }
  if (nameMatch(bank.debtorNormalizedName, expected.debtor.normalizedName)) {
    signals.push({ code: "NAME_MATCH", strength: "MEDIUM", detail: "Invoice debtor matches bank debtor." });
  } else if (proof && nameMatch(proof.financialPayload.debtor.normalizedName, expected.debtor.normalizedName)) {
    // Bank statements frequently omit the payer name. If the proof payer and the
    // invoice debtor agree, the counterparty is still confirmed across documents.
    signals.push({ code: "NAME_MATCH", strength: "MEDIUM", detail: "Proof payer matches invoice debtor." });
  }
  return signals;
}

function meetsThreshold(signals: CandidateSignal[]): boolean {
  const strong = signals.filter((s) => s.strength === "STRONG").length;
  const medium = signals.filter((s) => s.strength === "MEDIUM").length;
  return strong >= 1 || medium >= 2;
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
    bankTransactionId: bank.internalTxId,
    ...(proof ? { proofId: proof.proofId } : {}),
    ...(expected ? { expectedPaymentId: expected.expectedPaymentId } : {}),
    signals,
    bankTransaction: bank,
    ...(proof ? { proof } : {}),
    ...(expected ? { expectedPayment: expected } : {})
  };
}

export function generateBankAnchoredCandidates(input: {
  batch: NormalizedInputBatch;
  policy: ReconciliationPolicy;
}): ToolResult<CandidateSet> {
  const { batch } = input;
  const candidatesByBankTx: Record<string, MatchCandidate[]> = {};
  const unmatchedBankTxIds: string[] = [];

  const credits = batch.bankTransactions.filter((tx) => tx.creditDebitIndicator === "CRDT");
  const proofs = batch.paymentProofs.filter((p) => !REJECTED_STATUSES.has(p.financialPayload.paymentStatus));

  let candidateSeq = 0;

  for (const bank of credits) {
    const perBank: MatchCandidate[] = [];

    for (const proof of proofs) {
      const bpSignals = bankProofSignals(bank, proof);
      if (!meetsThreshold(bpSignals)) continue;

      // An invoice attaches only on a *linking* signal (reference or amount).
      // A shared customer name corroborates the score but must never, on its own,
      // pair a proof with one of several same-customer invoices.
      const linkedExpecteds = batch.expectedPayments.filter((expected) =>
        expectedLinkSignals(bank, proof, expected).some(
          (signal) =>
            signal.code === "EXACT_REFERENCE_MATCH" ||
            signal.code === "PARTIAL_REFERENCE_MATCH" ||
            signal.code === "AMOUNT_MATCHES_EXPECTED"
        )
      );

      if (linkedExpecteds.length > 0) {
        for (const expected of linkedExpecteds) {
          candidateSeq += 1;
          const signals = [...bpSignals, ...expectedLinkSignals(bank, proof, expected)];
          perBank.push(makeCandidate(`CAND-${String(candidateSeq).padStart(3, "0")}`, bank, proof, expected, signals));
        }
      } else {
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
    summary: `Generated ${total} candidate(s) across ${credits.length} bank credit(s); ${unmatchedBankTxIds.length} unmatched.`
  };
}
