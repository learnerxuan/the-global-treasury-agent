import type { NormalizedInputBatch } from "../types";
import { createArtifactRequest, createHumanReviewRequest, primaryArtifactType } from "./artifacts";
import { calculateFxScenarios } from "./calculate-fx-scenarios";
import { classifyMatch } from "./classify";
import { evaluateAmountResidual, evaluateFeeHypothesis } from "./evaluate-residual";
import { generateBankAnchoredCandidates } from "./generate-candidates";
import { DEFAULT_POLICY, type ReconciliationPolicy } from "./policy";
import { detectCompetingCandidates, scoreCandidate } from "./scoring";
import { createAgentTimeline, listAgentEvents, recordAgentEvent, type AgentTimeline } from "./timeline";
import type {
  ArtifactRequest,
  ClassificationResult,
  EvidenceRef,
  HumanReviewOption,
  HumanReviewRequest,
  MatchCandidate,
  ReconciliationOrchestratorOptions,
  ReconciliationResult,
  ReconciliationStatus,
  ReviewSeverity,
  ScoredCandidate,
  ToolResult
} from "./types";
import { validateNormalizedBatch } from "./validate";

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
  if (candidate.expectedPaymentId) refs.push({ kind: "expected_payment", id: candidate.expectedPaymentId });
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
  if (flags.includes("COMPETING_CANDIDATES_CLOSE")) {
    return "This bank settlement row could settle more than one invoice. Which invoice should receive the payment?";
  }
  if (flags.includes("RESIDUAL_ABOVE_THRESHOLD") && selected?.residual.residualAmount) {
    const amount = selected.feeHypothesis.amount ?? selected.residual.residualAmount;
    return `This bank settlement row is ${amount} ${selected.residual.bestScenario?.expectedLocalAmount.currency ?? ""} away from the best FX explanation. Was an intermediary fee or FX spread applied?`.trim();
  }
  if (flags.includes("PROOF_NOT_SETTLED")) {
    return "The payment proof is not marked as settled/completed. Do you have a completed-payment proof before we close this invoice?";
  }
  if (flags.includes("LOW_CONFIDENCE_CRITICAL_FIELD")) {
    return "Some critical fields were extracted with low confidence. Please confirm the amount and reference before approval.";
  }
  return "Please review this case before it is approved.";
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

  const results: ReconciliationResult[] = [];
  const artifactRequests: ArtifactRequest[] = [];
  const humanReviewRequests: HumanReviewRequest[] = [];
  const summary = { autoMatched: 0, likelyMatched: 0, needsReview: 0, unmatched: 0 };

  // 1. Validate the normalized batch.
  recordToolCall(timeline, validateNormalizedBatch(batch), `batch ${batch.batchId}`, {});

  // 2. Generate bank-anchored candidates.
  const candidateSet = recordToolCall(
    timeline,
    generateBankAnchoredCandidates({ batch, policy }),
    `batch ${batch.batchId}`,
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

  const settlementRows = batch.bankTransactions.filter((tx) => tx.amount.value !== "0" && tx.amount.value !== "0.00");

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
        calculateFxScenarios({ candidate, policy }),
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

    const classifiedCandidateId = classified.selectedCandidate?.candidate.candidateId;
    recordAgentEvent(timeline, {
      actor: "Agent 2",
      eventType: "CLASSIFICATION_COMPLETED",
      action: `classified ${classified.status}`,
      reasoning: classification.ok ? classification.summary : "Classification fallback.",
      relatedIds: {
        caseId,
        bankTransactionId: bankTx.internalTxId,
        ...(classifiedCandidateId ? { candidateId: classifiedCandidateId } : {})
      }
    });

    const selected = classified.selectedCandidate;
    const status = classified.status;

    // 5. Build the per-case result.
    const result: ReconciliationResult = {
      caseId,
      status,
      bankTransactionId: bankTx.internalTxId,
      score: selected?.score ?? 0,
      reasonCodes: classified.reasonCodes,
      hardReviewFlags: classified.hardReviewFlags,
      explanation: buildExplanation(status, selected),
      ...(selected?.candidate.candidateId ? { selectedCandidateId: selected.candidate.candidateId } : {}),
      ...(selected?.candidate.expectedPaymentId ? { expectedPaymentId: selected.candidate.expectedPaymentId } : {}),
      ...(selected?.candidate.proofId ? { proofId: selected.candidate.proofId } : {}),
      ...(selected?.residual.bestScenario ? { bestFxScenario: selected.residual.bestScenario } : {}),
      ...(selected ? { residual: selected.residual } : {})
    };
    results.push(result);

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
    const evidence = selected ? evidenceFor(selected.candidate) : [{ kind: "bank_transaction" as const, id: bankTx.internalTxId }];
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
      const isCompetition = classified.hardReviewFlags.includes("COMPETING_CANDIDATES_CLOSE");
      const review = createHumanReviewRequest({
        caseId,
        severity: status === "LIKELY_MATCHED" ? "LOW" : severityFor(classified),
        blocking: false,
        question:
          status === "LIKELY_MATCHED"
            ? "Strong match with a minor gap. Approve this reconciliation?"
            : buildReviewQuestion(classified, selected),
        ...(isCompetition ? { options: competingOptions(scoredCandidates) } : {}),
        evidenceRefs: evidence,
        reasonCodes: classified.reasonCodes
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
