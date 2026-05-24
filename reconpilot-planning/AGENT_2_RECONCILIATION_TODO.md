# Agent 2: Reconciliation Orchestrator Todo

Owner: Agent 2 developer
Scope: Agent 2 orchestration plus deterministic Reconciliation Tools
Date: 2026-05-24

## Boundary

Agent 2 owns matching workflow orchestration and the deterministic Reconciliation Tools.

Agent 2 must not:

- extract OCR/PDF/table text;
- normalize references, party names, dates, currencies, or money;
- use LLM output for money math;
- let the LLM choose final match status without `classifyMatch()`;
- auto-approve risky cases with hard review flags.

## Contract Setup

- [ ] Import the existing `NormalizedInputBatch` handoff type from `src/lib/recon/types.ts`.
- [ ] Consume `response.codeTools.normalizedInputBatch` from the current extraction API shape.
- [x] Confirm `schemaVersion`, `batchId`, `expectedPayments`, `bankTransactions`, `paymentProofs`, `warnings`, and `timelines` exist.
- [x] Confirm money values are decimal strings.
- [x] Confirm bank rows expose `normalizedReference`.
- [x] Confirm payment proofs preserve Agent 1 confidence and evidence metadata.
- [ ] Define `OrchestratorOutput`.
- [ ] Define `ReconciliationResult`.
- [ ] Define `ArtifactRequest`.
- [ ] Define `HumanReviewRequest`.
- [ ] Define reason codes and hard review flags.

## Reconciliation Tools

- [ ] Implement `validateNormalizedBatch()`.
- [ ] Implement `generateBankAnchoredCandidates()`.
- [ ] Implement `calculateFxScenarios()`.
- [ ] Implement `evaluateAmountResidual()`.
- [ ] Implement `evaluateFeeHypothesis()`.
- [ ] Implement `scoreCandidate()`.
- [ ] Implement `detectCompetingCandidates()`.
- [ ] Implement `classifyMatch()`.
- [ ] Implement deterministic tests for every tool.

## Agent Loop

- [ ] Implement state machine: validate input -> generate candidates -> FX -> residual -> fee -> score -> competition -> classify -> route.
- [ ] Implement max step limit.
- [ ] Implement retry-once behavior for retryable tool failures.
- [ ] Implement no-candidate route to `UNMATCHED`.
- [ ] Implement hard-review override handling.
- [ ] Implement dashboard-safe batch completion where review cases do not stop the whole batch.
- [ ] Add timeline event for every selected action.
- [ ] Add timeline event for every tool result.

## Matching Rules

- [ ] Anchor candidate generation on inbound bank credits.
- [ ] Skip debit rows for inbound payment matching.
- [ ] Require one strong signal or two medium signals before building a candidate.
- [ ] Use exact normalized reference as the strongest signal.
- [ ] Use payer/customer similarity only as supporting evidence.
- [ ] Detect competing candidates when top scores are within 10 points.
- [ ] Do not auto-resolve partial, batch, or overpayment cases in MVP.

## FX And Amount Rules

- [ ] Evaluate proof-extracted FX rate when available.
- [ ] Evaluate invoice/expected-payment date FX.
- [ ] Evaluate payment-proof date FX.
- [ ] Evaluate bank-booking date FX.
- [ ] Evaluate fallback fixture FX table.
- [ ] Pick the lowest residual scenario as best explanation.
- [ ] Route residual above 2% to human review.
- [ ] Route residual above 5% to unmatched or high-severity review.
- [ ] Never describe best-fit FX as confirmed bank FX.

## Human Review

- [ ] Generate specific review questions.
- [ ] Avoid vague "is this correct?" prompts.
- [ ] Include evidence refs in review requests.
- [ ] Include candidate options when candidates compete.
- [ ] Mark risky cases as blocking approval.
- [ ] Keep batch processing running even when review requests are created.

## Artifact Routing

- [ ] `AUTO_MATCHED` -> reconciliation report request.
- [ ] `LIKELY_MATCHED` -> report draft plus approval prompt.
- [ ] `NEEDS_REVIEW` -> discrepancy summary plus human review request.
- [ ] `UNMATCHED` -> discrepancy summary plus mock email draft.
- [ ] Do not send real emails in MVP.

## Fixture Scenarios

- [ ] Clean exact-reference auto-match.
- [ ] FX-date variance where bank-date or payment-date best explains the amount.
- [ ] Fuzzy party/reference likely match.
- [ ] Short payment or fee discrepancy requiring review.
- [ ] Competing candidates requiring human selection.
- [ ] Missing reference but plausible amount/date/name support.

## Acceptance Tests

- [ ] Agent 2 runs against stub `NormalizedInputBatch` without Agent 1.
- [ ] Agent 2 runs against stub Reconciliation Tools before full integration.
- [ ] Clean case returns `AUTO_MATCHED`.
- [ ] Risky but plausible case returns `NEEDS_REVIEW`.
- [ ] No-candidate case returns `UNMATCHED`.
- [ ] Competing-candidate case creates a human review request.
- [ ] Timeline clearly shows observe, decide, tool call, observed result, and route.
- [ ] LLM text never changes deterministic score or classification.
