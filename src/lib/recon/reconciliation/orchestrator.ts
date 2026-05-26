import type { BankStatementTransaction, ExpectedPaymentRecord, NormalizedInputBatch } from "../types";
import { randomUUID } from "node:crypto";
import { createArtifactRequest, createHumanReviewRequest, primaryArtifactType } from "./artifacts";
import { calculateFxScenarios } from "./calculate-fx-scenarios";
import { classifyMatch } from "./classify";
import { evaluateAmountResidual, evaluateFeeHypothesis } from "./evaluate-residual";
import { generateBankAnchoredCandidates, isBankFeeRow } from "./generate-candidates";
import { DEFAULT_POLICY, type ReconciliationPolicy } from "./policy";
import { InMemoryPaymentApplicationStore } from "./stores";
import { addMoney, compareMoney, subtractMoney } from "./money";
import { detectCompetingCandidates, scoreCandidate } from "./scoring";
import { createAgentTimeline, listAgentEvents, recordAgentEvent, type AgentTimeline } from "./timeline";
import type {
  ArtifactRequest,
  ClassificationResult,
  EvidenceRef,
  HardReviewFlag,
  HumanReviewOption,
  HumanReviewRequest,
  MatchCandidate,
  PaymentApplication,
  ReconciliationOrchestratorOptions,
  ReconciliationResult,
  ReasonCode,
  ReconciliationStatus,
  ReviewSeverity,
  ScoredCandidate,
  ToolResult
} from "./types";
import { validateNormalizedBatch } from "./validate";

type BankRisk = {
  flags: HardReviewFlag[];
  reasons: ReasonCode[];
};

const REVERSAL_TEXT = /\b(?:REVERSAL|REVERSED|RETURNED|RETURN|CORRECTION|CORRECTED|CANCELLED|CANCELED|CHARGEBACK|REFUND)\b/i;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizedBankReference(tx: BankStatementTransaction): string {
  const value =
    tx.endToEndId ??
    tx.txId ??
    tx.acctSvcrRef ??
    tx.referenceNo ??
    tx.ttNo ??
    tx.normalizedReference ??
    tx.remittanceInformation.structured?.invoiceNumber ??
    tx.description ??
    tx.rawDescription ??
    "";
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function buildBankRiskIndex(transactions: BankStatementTransaction[]): Map<string, BankRisk> {
  const duplicateGroups = new Map<string, string[]>();
  const reversalGroups = new Map<string, BankStatementTransaction[]>();
  const risks = new Map<string, BankRisk>();

  const addRisk = (id: string, flag: HardReviewFlag, reason: ReasonCode) => {
    const existing = risks.get(id) ?? { flags: [], reasons: [] };
    existing.flags = unique([...existing.flags, flag]);
    existing.reasons = unique([...existing.reasons, reason]);
    risks.set(id, existing);
  };

  for (const tx of transactions) {
    const reference = normalizedBankReference(tx);
    const date = tx.bookingDate.slice(0, 10);
    const duplicateKey = [tx.accountId, date, tx.amount.value, tx.amount.currency, tx.creditDebitIndicator, reference].join("|");
    duplicateGroups.set(duplicateKey, [...(duplicateGroups.get(duplicateKey) ?? []), tx.internalTxId]);

    const reversalKey = [tx.accountId, date, tx.amount.value, tx.amount.currency, reference].join("|");
    reversalGroups.set(reversalKey, [...(reversalGroups.get(reversalKey) ?? []), tx]);

    const description = [tx.description, tx.rawDescription, tx.remarks, tx.remittanceInformation.raw].filter(Boolean).join(" ");
    if (REVERSAL_TEXT.test(description)) {
      addRisk(tx.internalTxId, "POSSIBLE_REVERSAL", "POSSIBLE_REVERSAL");
    }
  }

  for (const ids of duplicateGroups.values()) {
    if (ids.length <= 1) continue;
    for (const id of ids) addRisk(id, "DUPLICATE_BANK_TRANSACTION", "DUPLICATE_BANK_TRANSACTION");
  }

  for (const group of reversalGroups.values()) {
    const hasCredit = group.some((tx) => tx.creditDebitIndicator === "CRDT");
    const hasDebit = group.some((tx) => tx.creditDebitIndicator === "DBIT");
    if (!hasCredit || !hasDebit) continue;
    for (const tx of group) addRisk(tx.internalTxId, "POSSIBLE_REVERSAL", "POSSIBLE_REVERSAL");
  }

  return risks;
}

function appliedByExpectedId(applications: PaymentApplication[]): Map<string, { value: string; currency: string }> {
  const applied = new Map<string, { value: string; currency: string }>();
  for (const app of applications) {
    for (const allocation of app.allocations) {
      const existing = applied.get(allocation.expectedPaymentId);
      if (existing && existing.currency === allocation.appliedAmount.currency) {
        existing.value = addMoney(existing.value, allocation.appliedAmount.value);
      } else if (!existing) {
        applied.set(allocation.expectedPaymentId, { ...allocation.appliedAmount });
      }
    }
  }
  return applied;
}

function adjustExpectedForLedger(expected: ExpectedPaymentRecord, applied: Map<string, { value: string; currency: string }>): ExpectedPaymentRecord | null {
  const appliedAmount = applied.get(expected.expectedPaymentId);
  const currentOutstanding = expected.outstandingAmount ?? expected.amountDue;
  if (!appliedAmount || appliedAmount.currency !== currentOutstanding.currency) return expected;

  const remaining = subtractMoney(currentOutstanding.value, appliedAmount.value);
  if (compareMoney(remaining, "0") <= 0) return null;
  return {
    ...expected,
    outstandingAmount: { value: remaining, currency: currentOutstanding.currency },
    reconciliationStatus: "PARTIALLY_MATCHED"
  };
}

function applyApplicationLedger(batch: NormalizedInputBatch, applications: PaymentApplication[]): NormalizedInputBatch {
  if (applications.length === 0) return batch;
  const applied = appliedByExpectedId(applications);
  return {
    ...batch,
    expectedPayments: batch.expectedPayments
      .map((expected) => adjustExpectedForLedger(expected, applied))
      .filter((expected): expected is ExpectedPaymentRecord => expected !== null)
  };
}

function recordToolCall<T>(
  timeline: AgentTimeline,
  result: ToolResult<T>,
  inputSummary: string,
  relatedIds: Record<string, string | undefined>
): ToolResult<T> {
  const cleanIds = Object.fromEntries(Object.entries(relatedIds).filter(([, v]) => v !== undefined));
  recordAgentEvent(timeline, {
    actor: "Agent 2",
    eventType: "TOOL_CALLED",
    action: `call ${result.toolName}`,
    toolName: result.toolName,
    inputSummary,
    reasoning: `Need ${result.toolName} output to advance the case.`,
    relatedIds: cleanIds
  });
  recordAgentEvent(timeline, {
    actor: "Reconciliation Tool",
    eventType: "TOOL_RESULT",
    action: `${result.toolName} returned`,
    toolName: result.toolName,
    resultSummary: result.summary,
    reasoning: result.ok ? "Observed deterministic tool result." : "Tool reported an error.",
    relatedIds: cleanIds
  });
  return result;
}

function evidenceFor(candidate: MatchCandidate): EvidenceRef[] {
  const refs: EvidenceRef[] = [{ kind: "bank_transaction", id: candidate.bankTransactionId }];
  if (candidate.proofId) refs.push({ kind: "payment_proof", id: candidate.proofId });
  const expectedIds = candidate.expectedPaymentIds ?? (candidate.expectedPaymentId ? [candidate.expectedPaymentId] : []);
  for (const id of expectedIds) refs.push({ kind: "expected_payment", id });
  return refs;
}

function severityFor(classification: ClassificationResult): ReviewSeverity {
  const flags = classification.hardReviewFlags;
  if (
    flags.includes("COMPETING_CANDIDATES_CLOSE") ||
    flags.includes("RESIDUAL_ABOVE_THRESHOLD") ||
    flags.includes("NO_FX_SCENARIO") ||
    flags.includes("LOW_CONFIDENCE_CRITICAL_FIELD")
  ) {
    return "HIGH";
  }
  if (flags.length > 0) return "MEDIUM";
  return "LOW";
}

function buildReviewQuestion(classification: ClassificationResult, selected: ScoredCandidate | null): string {
  const flags = classification.hardReviewFlags;
  if (flags.includes("LOW_CONFIDENCE_CRITICAL_FIELD")) {
    return "Some critical fields were extracted with low confidence. Please confirm the amount, currency, reference, date, payer, beneficiary, and status before approval.";
  }
  if (flags.includes("DUPLICATE_BANK_TRANSACTION")) {
    return "This bank settlement appears more than once in the imported statement data. Confirm which row, if any, should be consumed.";
  }
  if (flags.includes("POSSIBLE_REVERSAL")) {
    return "This bank settlement appears to be reversed, corrected, or paired with an opposite transaction. Confirm the final settlement state before approval.";
  }
  if (flags.includes("COMPETING_CANDIDATES_CLOSE")) {
    return "This bank settlement row could settle more than one invoice. Which invoice should receive the payment?";
  }
  if (selected?.candidate.candidateKind === "batch_invoices") {
    return "This bank settlement appears to pay multiple invoices. Approve or reject the proposed allocation set.";
  }
  if (flags.includes("RESIDUAL_ABOVE_THRESHOLD") && selected?.residual.residualAmount) {
    const amount = selected.feeHypothesis.amount ?? selected.residual.residualAmount;
    return `This bank settlement row is ${amount} ${selected.residual.bestScenario?.expectedLocalAmount.currency ?? ""} away from the best FX explanation. Was an intermediary fee or FX spread applied?`.trim();
  }
  if (flags.includes("PROOF_NOT_SETTLED")) {
    return "The payment proof is not marked as settled/completed. Do you have a completed-payment proof before we close this invoice?";
  }
  return "Please review this case before it is approved.";
}

function suggestedActionsFor(classification: ClassificationResult, selected: ScoredCandidate | null): string[] {
  const actions: string[] = [];
  const flags = classification.hardReviewFlags;
  if (selected?.candidate.candidateKind === "batch_invoices") actions.push("Review every invoice allocation before approval.");
  if (flags.includes("LOW_CONFIDENCE_CRITICAL_FIELD")) actions.push("Confirm low-confidence proof fields against the source document.");
  if (flags.includes("DUPLICATE_BANK_TRANSACTION")) actions.push("Confirm this is not a duplicate bank import before consuming the payment.");
  if (flags.includes("POSSIBLE_REVERSAL")) actions.push("Check for reversal/correction rows and confirm the final bank-settled amount.");
  if (flags.includes("RESIDUAL_ABOVE_THRESHOLD") || flags.includes("UNEXPLAINED_RESIDUAL_ABOVE_CAP")) {
    actions.push("Confirm whether the residual is a bank fee, FX spread, short payment, or overpayment.");
  }
  if (flags.includes("COMPETING_CANDIDATES_CLOSE")) actions.push("Choose the correct invoice candidate from the review options.");
  if (flags.includes("NO_FX_SCENARIO")) actions.push("Provide a bank/proof FX rate or cached market rate for this currency pair.");
  if (actions.length === 0 && classification.status === "LIKELY_MATCHED") actions.push("Approve or reject the likely match.");
  return actions;
}

function competingOptions(scoredCandidates: ScoredCandidate[]): HumanReviewOption[] {
  const seen = new Set<string>();
  const options: HumanReviewOption[] = [];
  for (const sc of scoredCandidates) {
    const expected = sc.candidate.expectedPayment;
    if (!expected || seen.has(expected.expectedPaymentId)) continue;
    seen.add(expected.expectedPaymentId);
    options.push({
      optionId: expected.expectedPaymentId,
      label: expected.invoiceNumber,
      consequence: `Apply this payment to ${expected.invoiceNumber}.`
    });
  }
  return options;
}

function buildExplanation(status: ReconciliationStatus, selected: ScoredCandidate | null): string {
  if (!selected) {
    return "No plausible payment proof or expected payment was found for this bank settlement row.";
  }
  const fx = selected.residual.bestScenario;
  const pct = selected.residual.residualPercent;
  const fxClause =
    fx && pct !== null
      ? ` ${fx.label} best explains the received amount with ${(pct * 100).toFixed(2)}% residual.`
      : "";
  switch (status) {
    case "AUTO_MATCHED":
      return `Reference, amount, date, and party align.${fxClause} Auto-matched.`;
    case "LIKELY_MATCHED":
      return `Strong evidence with a minor gap.${fxClause} Recommended for approval.`;
    case "NEEDS_REVIEW":
      return `Evidence is conflicting or risky (${selected.hardReviewFlags.join(", ") || "competition"}).${fxClause} Escalated for human review.`;
    case "UNMATCHED":
      return `No candidate survived the matching gates.${fxClause}`;
  }
}

export function runReconciliationOrchestrator(
  batch: NormalizedInputBatch,
  options: ReconciliationOrchestratorOptions = {}
): import("./types").OrchestratorOutput {
  const policy: ReconciliationPolicy = DEFAULT_POLICY;
  const timeline = createAgentTimeline(options.now);
  const paymentApplicationStore = options.paymentApplicationStore ?? new InMemoryPaymentApplicationStore();
  const ledgerApplications = paymentApplicationStore.listApplications();
  const effectiveBatch = applyApplicationLedger(batch, ledgerApplications);
  const bankRiskById = buildBankRiskIndex(effectiveBatch.bankTransactions);

  const results: ReconciliationResult[] = [];
  const artifactRequests: ArtifactRequest[] = [];
  const humanReviewRequests: HumanReviewRequest[] = [];
  const summary = { autoMatched: 0, likelyMatched: 0, needsReview: 0, unmatched: 0 };

  // 1. Validate the normalized batch.
  recordToolCall(timeline, validateNormalizedBatch(effectiveBatch), `batch ${effectiveBatch.batchId}`, {});

  // 2. Generate bank-anchored candidates.
  const candidateSet = recordToolCall(
    timeline,
    generateBankAnchoredCandidates({ batch: effectiveBatch, policy, ...(options.counterpartyIdentityStore ? { counterpartyIdentityStore: options.counterpartyIdentityStore } : {}) }),
    `batch ${effectiveBatch.batchId}`,
    {}
  );
  if (!candidateSet.ok) {
    return {
      schemaVersion: "1.0.0",
      batchId: batch.batchId,
      results,
      timeline: listAgentEvents(timeline),
      artifactRequests,
      humanReviewRequests,
      summary
    };
  }

  // Skip zero-value rows, already-consumed rows, and bank fee/charge rows — fees are
  // not settlements; they explain a small residual on the related credit, not a case.
  const settlementRows = effectiveBatch.bankTransactions.filter(
    (tx) =>
      tx.amount.value !== "0" &&
      tx.amount.value !== "0.00" &&
      !isBankFeeRow(tx) &&
      !paymentApplicationStore.isBankTransactionConsumed(tx.internalTxId)
  );

  for (const bankTx of settlementRows) {
    const caseId = `CASE-${bankTx.internalTxId}`;
    const candidates = candidateSet.data.candidatesByBankTx[bankTx.internalTxId] ?? [];

    recordAgentEvent(timeline, {
      actor: "Agent 2",
      eventType: "STATE_CHANGED",
      action: "case created",
      reasoning: `Reconciling bank settlement row ${bankTx.internalTxId} (${candidates.length} candidate(s)).`,
      relatedIds: { caseId, bankTransactionId: bankTx.internalTxId }
    });

    // 3. Score every candidate through the deterministic tool chain.
    const scoredCandidates: ScoredCandidate[] = [];
    for (const candidate of candidates) {
      const fx = recordToolCall(
        timeline,
        calculateFxScenarios({ candidate, policy, ...(options.fxProvider ? { fxProvider: options.fxProvider } : {}) }),
        `candidate ${candidate.candidateId}`,
        { caseId, candidateId: candidate.candidateId }
      );
      if (!fx.ok) continue;

      const residual = recordToolCall(
        timeline,
        evaluateAmountResidual({ fxScenarios: fx.data, policy }),
        `candidate ${candidate.candidateId}`,
        { caseId, candidateId: candidate.candidateId }
      );
      if (!residual.ok) continue;

      const fee = recordToolCall(
        timeline,
        evaluateFeeHypothesis({ residual: residual.data, policy }),
        `candidate ${candidate.candidateId}`,
        { caseId, candidateId: candidate.candidateId }
      );
      if (!fee.ok) continue;

      const scored = recordToolCall(
        timeline,
        scoreCandidate({ candidate, fxScenarios: fx.data, residual: residual.data, feeHypothesis: fee.data, policy }),
        `candidate ${candidate.candidateId}`,
        { caseId, candidateId: candidate.candidateId }
      );
      if (!scored.ok) continue;
      scoredCandidates.push(scored.data);
    }

    // 4. Detect competition and classify.
    const competition = recordToolCall(
      timeline,
      detectCompetingCandidates({ scoredCandidates, policy }),
      `${scoredCandidates.length} scored candidate(s)`,
      { caseId }
    );
    const competitionResult = competition.ok
      ? competition.data
      : { hasCompetition: false, topScore: 0, runnerUpScore: null, gap: null };

    const classification = classifyMatch({ scoredCandidates, competition: competitionResult, policy });
    const classified: ClassificationResult = classification.ok
      ? classification.data
      : { status: "UNMATCHED", selectedCandidate: null, reasonCodes: ["NO_CANDIDATE"], hardReviewFlags: [] };
    const bankRisk = bankRiskById.get(bankTx.internalTxId);
    const effectiveClassification: ClassificationResult = bankRisk
      ? {
          ...classified,
          status: classified.status === "UNMATCHED" ? "UNMATCHED" : "NEEDS_REVIEW",
          reasonCodes: unique([...classified.reasonCodes, ...bankRisk.reasons]),
          hardReviewFlags: unique([...classified.hardReviewFlags, ...bankRisk.flags])
        }
      : classified;

    const classifiedCandidateId = effectiveClassification.selectedCandidate?.candidate.candidateId;
    recordAgentEvent(timeline, {
      actor: "Agent 2",
      eventType: "CLASSIFICATION_COMPLETED",
      action: `classified ${effectiveClassification.status}`,
      reasoning: bankRisk ? "Bank duplicate/reversal risk forces human review." : classification.ok ? classification.summary : "Classification fallback.",
      relatedIds: {
        caseId,
        bankTransactionId: bankTx.internalTxId,
        ...(classifiedCandidateId ? { candidateId: classifiedCandidateId } : {})
      }
    });

    const selected = effectiveClassification.selectedCandidate;
    const status = effectiveClassification.status;
    const evidence = selected ? evidenceFor(selected.candidate) : [{ kind: "bank_transaction" as const, id: bankTx.internalTxId }];
    const reviewQuestion = status === "LIKELY_MATCHED"
      ? "Strong match with a minor gap. Approve this reconciliation?"
      : status === "NEEDS_REVIEW"
        ? buildReviewQuestion(effectiveClassification, selected)
        : null;
    const reviewActions = suggestedActionsFor(effectiveClassification, selected);

    // 5. Build the per-case result.
    const result: ReconciliationResult = {
      caseId,
      status,
      bankTransactionId: bankTx.internalTxId,
      score: selected?.score ?? 0,
      reasonCodes: effectiveClassification.reasonCodes,
      hardReviewFlags: effectiveClassification.hardReviewFlags,
      policyVersion: policy.version,
      reviewBlockers: effectiveClassification.hardReviewFlags,
      ...(selected?.evidenceTrust ? { evidenceTrust: selected.evidenceTrust } : {}),
      auditTrail: {
        policyVersion: policy.version,
        selectedCandidateId: selected?.candidate.candidateId ?? null,
        candidateKind: selected?.candidate.candidateKind ?? null,
        fxSourceKind: selected?.residual.bestScenario?.fxSourceKind ?? null,
        fxScenarioId: selected?.residual.bestScenario?.scenarioId ?? null,
        evidenceRefs: evidence,
        reasonCodes: effectiveClassification.reasonCodes,
        hardReviewFlags: effectiveClassification.hardReviewFlags
      },
      reviewPayload: {
        required: status === "NEEDS_REVIEW" || status === "LIKELY_MATCHED",
        primaryQuestion: reviewQuestion,
        blockers: effectiveClassification.hardReviewFlags,
        suggestedActions: reviewActions
      },
      ...(selected?.candidate.candidateKind ? { candidateKind: selected.candidate.candidateKind } : {}),
      explanation: buildExplanation(status, selected),
      ...(selected?.candidate.candidateId ? { selectedCandidateId: selected.candidate.candidateId } : {}),
      ...(selected?.candidate.expectedPaymentId ? { expectedPaymentId: selected.candidate.expectedPaymentId } : {}),
      ...(selected?.candidate.expectedPaymentIds ? { expectedPaymentIds: selected.candidate.expectedPaymentIds } : {}),
      ...(selected?.candidate.proofId ? { proofId: selected.candidate.proofId } : {}),
      ...(selected?.candidate.allocations ? { allocations: selected.candidate.allocations } : {}),
      ...(selected?.residual.bestScenario ? { bestFxScenario: selected.residual.bestScenario } : {}),
      ...(selected ? { residual: selected.residual } : {})
    };
    results.push(result);

    if (status === "AUTO_MATCHED" && selected?.candidate.expectedPaymentIds?.length) {
      paymentApplicationStore.saveApplication({
        applicationId: `app_${randomUUID()}`,
        createdAt: options.now?.() ?? new Date().toISOString(),
        policyVersion: policy.version,
        bankTransactionId: bankTx.internalTxId,
        ...(selected.candidate.proofId ? { proofId: selected.candidate.proofId } : {}),
        selectedCandidateId: selected.candidate.candidateId,
        expectedPaymentIds: selected.candidate.expectedPaymentIds,
        allocations: selected.candidate.allocations ?? [],
        status
      });
    }

    summary[
      status === "AUTO_MATCHED"
        ? "autoMatched"
        : status === "LIKELY_MATCHED"
          ? "likelyMatched"
          : status === "NEEDS_REVIEW"
            ? "needsReview"
            : "unmatched"
    ] += 1;

    // 6. Route artifacts.
    const primary = createArtifactRequest({
      caseId,
      status,
      type: primaryArtifactType(status),
      evidenceRefs: evidence,
      summary: result.explanation
    });
    if (primary.ok) {
      artifactRequests.push(primary.data);
      recordAgentEvent(timeline, {
        actor: "Artifact Module",
        eventType: "ARTIFACT_REQUESTED",
        action: `request ${primary.data.type}`,
        reasoning: `Status ${status} routes to ${primary.data.type}.`,
        relatedIds: { caseId }
      });
    }
    if (status === "UNMATCHED") {
      const email = createArtifactRequest({
        caseId,
        status,
        type: "MOCK_EMAIL_DRAFT",
        evidenceRefs: evidence,
        summary: "Draft follow-up email for an unresolved bank settlement row."
      });
      if (email.ok) artifactRequests.push(email.data);
    }

    // 7. Route human review (NEEDS_REVIEW required; LIKELY_MATCHED approval prompt).
    if (status === "NEEDS_REVIEW" || status === "LIKELY_MATCHED") {
      const isCompetition = effectiveClassification.hardReviewFlags.includes("COMPETING_CANDIDATES_CLOSE");
      const review = createHumanReviewRequest({
        caseId,
        severity: status === "LIKELY_MATCHED" ? "LOW" : severityFor(effectiveClassification),
        blocking: status === "NEEDS_REVIEW",
        question:
          status === "LIKELY_MATCHED"
            ? "Strong match with a minor gap. Approve this reconciliation?"
            : buildReviewQuestion(effectiveClassification, selected),
        ...(isCompetition ? { options: competingOptions(scoredCandidates) } : {}),
        evidenceRefs: evidence,
        reasonCodes: effectiveClassification.reasonCodes,
        hardReviewFlags: effectiveClassification.hardReviewFlags,
        suggestedActions: reviewActions
      });
      if (review.ok) {
        humanReviewRequests.push(review.data);
        recordAgentEvent(timeline, {
          actor: "Human Review",
          eventType: "HUMAN_REVIEW_REQUESTED",
          action: "request human review",
          reasoning: review.data.question,
          relatedIds: { caseId }
        });
      }
    }
  }

  return {
    schemaVersion: "1.0.0",
    batchId: batch.batchId,
    results,
    timeline: listAgentEvents(timeline),
    artifactRequests,
    humanReviewRequests,
    summary
  };
}
