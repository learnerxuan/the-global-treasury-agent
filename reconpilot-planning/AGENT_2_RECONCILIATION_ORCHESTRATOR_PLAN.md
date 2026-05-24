# ReconPilot Agent 2: Reconciliation Orchestrator Final Plan

Status: final implementation spec
Owner: Agent 2 developer
Component: Agent 2 + Reconciliation Tools
Date: 2026-05-24

Implementation checklist: [AGENT_2_RECONCILIATION_TODO.md](AGENT_2_RECONCILIATION_TODO.md)

## 1. Purpose

Agent 2 is the Reconciliation Orchestrator.

It receives normalized records from the Parse + Normalize Code Tools and decides how to run the reconciliation workflow:

```text
NormalizedInputBatch
-> generate candidates
-> evaluate FX scenarios
-> evaluate residuals and fee hypotheses
-> score candidates
-> classify result
-> route artifacts and human review
```

Agent 2 is not the money-math engine. It does not calculate FX, residuals, fees, scores, or final classification directly. Those are deterministic Reconciliation Tools owned by the Agent 2 developer.

Agent 2's job is to:

- choose which tool to call next;
- observe tool results;
- detect ambiguity;
- ask targeted human-review questions when needed;
- write a visible agent activity timeline;
- route each case to the correct output.

Core rule:

```text
Agent 1 extracts.
Parse + Normalize Code Tools normalize.
Agent 2 orchestrates matching.
Reconciliation Tools decide money math.
Humans approve risky cases.
```

## 2. Ownership Boundary

### Friend 1: Inputs + Agent 1

Owns:

- upload/input descriptors;
- proof file metadata;
- PDF/image/table extraction routing;
- OCR or PDF parsing for payment proofs;
- raw payment proof extraction JSON;
- extraction confidence and evidence spans.

Agent 1 must not normalize names/references or match payments.

### Friend 2: Parse + Normalize Code Tools

Owns:

- parse expected payment CSV/XLSX;
- parse local bank statement CSV/XLSX;
- normalize references, names, dates, currencies, and decimal money strings;
- normalize Agent 1 proof extraction output;
- produce `NormalizedInputBatch`.

Parse + Normalize Code Tools must not fetch FX, generate match candidates, score matches, classify status, or generate reconciliation artifacts.

### Agent 2 Developer

Owns:

- Agent 2 orchestration loop;
- Reconciliation Tools;
- candidate generation;
- FX scenario comparison;
- amount residual and fee hypothesis evaluation;
- scoring;
- classification;
- artifact request routing;
- human review request routing;
- agent activity timeline.

This is Option A:

```text
Friend 2 builds Parse + Normalize.
Agent 2 developer builds Agent 2 + Reconciliation Tools.
```

## 3. Input Contract

Agent 2 consumes one normalized batch.

Expected handoff:

```ts
type NormalizedInputBatch = {
  schemaVersion: "1.0.0";
  batchId: string;
  uploadedAt: string;
  expectedPayments: ExpectedPaymentRecord[];
  bankTransactions: BankStatementTransaction[];
  paymentProofs: NormalizedPaymentProofRecord[];
  warnings: Warning[];
  timelines: TimelineEvent[];
};
```

Contract requirement:

- all record IDs must be stable;
- all money values must be decimal strings, not JavaScript floats;
- all normalized references must use the same normalizer;
- bank rows must expose a normalized reference field or a deterministic way to derive it;
- proof extraction confidence must be preserved;
- Agent 1 and Code Tools timeline events must be preserved.

Agent 2 should not consume raw OCR text as its main input. Raw evidence can be displayed or cited, but matching must use normalized records.

## 4. Output Contract

Agent 2 returns dashboard-ready results:

```ts
type OrchestratorOutput = {
  schemaVersion: "1.0.0";
  batchId: string;
  results: ReconciliationResult[];
  timeline: AgentTimelineEvent[];
  artifactRequests: ArtifactRequest[];
  humanReviewRequests: HumanReviewRequest[];
  summary: {
    autoMatched: number;
    likelyMatched: number;
    needsReview: number;
    unmatched: number;
  };
};
```

Each result:

```ts
type ReconciliationResult = {
  caseId: string;
  status: "AUTO_MATCHED" | "LIKELY_MATCHED" | "NEEDS_REVIEW" | "UNMATCHED";
  selectedCandidateId?: string;
  expectedPaymentId?: string;
  proofId?: string;
  bankTransactionId?: string;
  score: number;
  reasonCodes: ReasonCode[];
  hardReviewFlags: HardReviewFlag[];
  bestFxScenario?: FxScenarioResult;
  residual?: AmountResidualResult;
  explanation: string;
};
```

## 5. Reconciliation Tools

Agent 2 calls tools through a strict registry.

Required tools:

```ts
validateNormalizedBatch(input: NormalizedInputBatch): ToolResult<InputValidationResult>

generateBankAnchoredCandidates(input: {
  batch: NormalizedInputBatch;
  policy: ReconciliationPolicy;
}): ToolResult<CandidateSet>

calculateFxScenarios(input: {
  candidate: MatchCandidate;
  policy: ReconciliationPolicy;
}): ToolResult<FxScenarioResult[]>

evaluateAmountResidual(input: {
  candidate: MatchCandidate;
  fxScenarios: FxScenarioResult[];
  policy: ReconciliationPolicy;
}): ToolResult<AmountResidualResult>

evaluateFeeHypothesis(input: {
  candidate: MatchCandidate;
  residual: AmountResidualResult;
  policy: ReconciliationPolicy;
}): ToolResult<FeeHypothesisResult>

scoreCandidate(input: {
  candidate: MatchCandidate;
  fxScenarios: FxScenarioResult[];
  residual: AmountResidualResult;
  feeHypothesis: FeeHypothesisResult;
}): ToolResult<ScoredCandidate>

detectCompetingCandidates(input: {
  scoredCandidates: ScoredCandidate[];
  policy: ReconciliationPolicy;
}): ToolResult<CompetitionResult>

classifyMatch(input: {
  scoredCandidates: ScoredCandidate[];
  competition: CompetitionResult;
  policy: ReconciliationPolicy;
}): ToolResult<ClassificationResult>

createArtifactRequest(input: ArtifactRequestInput): ToolResult<ArtifactRequest>

createHumanReviewRequest(input: HumanReviewRequestInput): ToolResult<HumanReviewRequest>
```

Forbidden tools:

```text
matchWithAI()
guessCorrectPayment()
decideMoneyMatch()
```

Those are architecture trash. They hide the logic judges will ask about.

## 6. Matching Design

Use bank-anchored matching.

Bad design:

```text
all invoices x all proofs x all bank rows
```

That creates noisy fake candidates.

Correct design:

```text
bank credit -> plausible proofs -> plausible expected payments -> candidate
```

Reason:

- the bank credit is the actual money received;
- proofs can be duplicated, pending, fake, or not settled yet;
- invoices can exist without payment;
- reconciliation starts from actual cash movement.

For each inbound bank credit:

1. Skip debits.
2. Skip already matched rows unless review mode allows it.
3. Find proof records with matching or plausible reference/date/amount/name.
4. Find expected payments connected to those proofs.
5. Build candidate triples only when at least one strong signal or two medium signals exist.

Strong signals:

- exact normalized reference match;
- exact transaction ID match;
- bank description contains normalized invoice reference;
- proof target amount equals bank credit amount;
- explicit proof FX rate explains bank credit.

Medium signals:

- payer/customer name similarity;
- payment date near bank booking date;
- invoice date/due date plausible;
- amount converts plausibly using allowed FX date scenarios;
- partial reference token overlap.

## 7. FX Date Problem

Do not ask the user to upload FX rates for the MVP.

The Reconciliation Tool should try allowed FX scenarios:

```text
1. proof-extracted FX rate, if present
2. invoice/expected payment date FX
3. payment proof date FX
4. bank booking date FX
5. fallback fixture FX table
```

For each scenario:

```text
expected local amount = foreign amount * FX rate
residual amount = actual bank credit - expected local amount
residual percent = abs(residual amount) / expected local amount
```

Pick the scenario with the smallest residual.

Important wording:

```text
Bank-date FX best explains the received amount.
```

Do not say:

```text
The bank definitely used this FX rate.
```

You are finding the best explanation, not proving the bank's internal rate.

## 8. Tolerance And Review Rules

Suggested amount residual policy:

| Residual | Meaning | Route |
|---:|---|---|
| <= 0.5% | strong amount match | can auto-match if other signals are strong |
| > 0.5% and <= 2% | plausible FX spread or small fee | likely matched or review |
| > 2% and <= 5% | risky discrepancy | needs review |
| > 5% | not explained | unmatched or review |

Hard review overrides:

- any critical proof field confidence below `0.8`;
- top two candidates within `10` score points;
- missing reference and weak name match;
- proof status is pending/scheduled/failed;
- possible batch payment;
- possible partial payment;
- possible overpayment;
- duplicate proof transaction ID;
- FX rate unavailable for all allowed scenarios;
- residual above `2%`.

High score does not override hard review flags.

## 9. Scoring

Scoring ranks candidates. It does not create truth.

Suggested score:

| Signal | Points |
|---|---:|
| Reference or transaction ID evidence | 0-35 |
| Amount, FX, and fee residual | 0-30 |
| Date plausibility | 0-15 |
| Party/account consistency | 0-15 |
| Extraction/source confidence | 0-10 |
| Competition penalty | -20 |

Classification must come from `classifyMatch()`, not the LLM.

Status rules:

- `AUTO_MATCHED`: clean evidence, no hard review flags, no close competitor.
- `LIKELY_MATCHED`: probably correct, but should wait for approval.
- `NEEDS_REVIEW`: unresolved ambiguity or risky discrepancy.
- `UNMATCHED`: no candidate survives gates.

## 10. Agent Loop

Agent 2 follows this loop:

```text
observe current case state
decide next allowed action
call deterministic tool
observe tool result
write timeline event
update case state
repeat until terminal routing
```

Recommended state sequence:

```text
CREATED
-> INPUT_VALIDATING
-> CANDIDATE_GENERATING
-> FX_EVALUATING
-> RESIDUAL_EVALUATING
-> FEE_EVALUATING
-> SCORING
-> COMPETITION_CHECKING
-> CLASSIFYING
-> ROUTING
-> TERMINAL
```

Limits:

```ts
const MAX_AGENT_STEPS = 14;
const MAX_TOOL_RETRIES = 1;
const MAX_CLARIFICATION_REQUESTS_PER_CASE = 1;
```

For MVP, human review should not block the whole batch. Agent 2 finishes the batch, then the dashboard shows review tasks.

## 11. AI Responsibilities

The LLM may:

- choose the next action from a fixed allowed action list;
- explain why a tool call is needed;
- summarize observed tool results;
- generate targeted human-review questions;
- write user-facing discrepancy explanations.

The LLM must not:

- calculate FX;
- calculate residuals;
- invent fees;
- choose final classification from intuition;
- override hard review rules;
- mark an invoice as paid directly.

MVP implementation can start with a deterministic decision function and use the LLM only for reasoning text. That is acceptable if the timeline clearly shows tool-based reasoning.

## 12. Human Review

Bad review question:

```text
Is this match correct?
```

Good review questions:

```text
This bank credit is MYR 42.00 below the best FX explanation. Was an intermediary fee deducted?
```

```text
This bank row could match INV-1001 or INV-1002. Which invoice should receive the payment?
```

```text
The proof status is scheduled, not completed. Do you have completed-payment proof?
```

Human review output:

```ts
type HumanReviewRequest = {
  reviewId: string;
  caseId: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  blocking: boolean;
  question: string;
  options?: {
    optionId: string;
    label: string;
    consequence: string;
  }[];
  evidenceRefs: EvidenceRef[];
  reasonCodes: ReasonCode[];
};
```

## 13. Artifact Routing

Agent 2 creates artifact requests. The artifact module renders them.

| Status | Artifact request |
|---|---|
| `AUTO_MATCHED` | reconciliation report |
| `LIKELY_MATCHED` | report draft plus approval prompt |
| `NEEDS_REVIEW` | discrepancy summary plus human review request |
| `UNMATCHED` | discrepancy summary plus mock email draft |

No real email sending for MVP. A mock email draft is just text shown in the UI.

## 14. Timeline

The agent activity timeline is required for the demo.

It proves:

- Agent 2 chose tools;
- tools returned observed results;
- classification came from deterministic evidence;
- risky cases were routed to review.

Timeline event shape:

```ts
type AgentTimelineEvent = {
  step: number;
  timestamp: string;
  actor: "Agent 2" | "Reconciliation Tool" | "Human Review" | "Artifact Module";
  eventType:
    | "ACTION_SELECTED"
    | "TOOL_CALLED"
    | "TOOL_RESULT"
    | "STATE_CHANGED"
    | "CLASSIFICATION_COMPLETED"
    | "ARTIFACT_REQUESTED"
    | "HUMAN_REVIEW_REQUESTED"
    | "ERROR";
  action: string;
  toolName?: string;
  inputSummary?: string;
  resultSummary?: string;
  reasoning: string;
  relatedIds?: {
    caseId?: string;
    candidateId?: string;
    bankTransactionId?: string;
    proofId?: string;
    expectedPaymentId?: string;
  };
};
```

Example:

```text
12:30:04 Agent 2 -> called calculateFxScenarios(CAND-001)
12:30:04 Tool -> bank-date FX residual = MYR 0.05 / 0.12%
12:30:05 Agent 2 -> continue to scoreCandidate because amount path is strong
```

## 15. Implementation Checklist

- [ ] Define Agent 2 input/output schemas.
- [ ] Confirm final `NormalizedInputBatch` shape with Friend 2.
- [ ] Confirm normalized bank reference exists.
- [ ] Implement tool result envelope.
- [ ] Implement `validateNormalizedBatch()`.
- [ ] Implement `generateBankAnchoredCandidates()`.
- [ ] Implement `calculateFxScenarios()`.
- [ ] Implement `evaluateAmountResidual()`.
- [ ] Implement `evaluateFeeHypothesis()`.
- [ ] Implement `scoreCandidate()`.
- [ ] Implement `detectCompetingCandidates()`.
- [ ] Implement `classifyMatch()`.
- [ ] Implement artifact request routing.
- [ ] Implement human review request routing.
- [ ] Implement timeline writer.
- [ ] Build three fixture scenarios: clean match, FX-date variance, needs-review discrepancy.
- [ ] Run Agent 2 against stubs before integrating with Agent 1 and Parse + Normalize.

## 16. MVP Cutline

Do not build:

- real bank API integration;
- real email sending;
- real ERP/accounting posting;
- arbitrary multi-invoice auto-resolution;
- partial payment auto-resolution;
- withholding tax logic;
- production workflow queues;
- LangChain/LangGraph unless the team already has it working.

Those are distractions. The MVP wins by showing accurate reconciliation reasoning, visible tool use, and clean human-review routing.
