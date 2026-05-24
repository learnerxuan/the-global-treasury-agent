# Code Tools: Parse + Normalize Todo

Owner: Parse + Normalize Code Tools developer
Scope: deterministic parsing and normalization only
Date: 2026-05-24

## Boundary

This todo belongs to the Parse + Normalize layer.

It must not include:

- FX lookup;
- FX scenario comparison;
- candidate generation;
- scoring;
- final classification;
- artifact generation;
- human review routing.

Those belong to Agent 2 + Reconciliation Tools.

## Schema And Contract

- [ ] Confirm `INPUT_PLAN.md` is the source of truth for shared types.
- [ ] Confirm whether `NormalizedInputBatch` will be added to shared schemas or exported by this module.
- [ ] Keep `schemaVersion` and `batchId` on the normalized output.
- [ ] Preserve Agent 1 timeline events in `NormalizedInputBatch.timelines`.
- [ ] Preserve Code Tools warnings in `NormalizedInputBatch.warnings`.
- [ ] Use decimal strings for money values.
- [ ] Do not use JavaScript floating-point numbers for money.
- [ ] Confirm bank transactions expose a normalized reference usable by Agent 2.
- [ ] Confirm proof records expose normalized reference, payer name, payee name, date, amount, and confidence metadata.

## Parsers

- [ ] Implement expected payment CSV parser.
- [ ] Implement expected payment XLSX parser.
- [ ] Implement bank statement CSV parser.
- [ ] Implement bank statement XLSX parser.
- [ ] Validate required columns.
- [ ] Return structured parser warnings for missing/invalid columns.
- [ ] Preserve source row numbers for evidence/debugging.
- [ ] Add parser tests with valid and invalid files.

## Normalizers

- [ ] Implement `normalize_reference()`.
- [ ] Implement `normalize_party_name()`.
- [ ] Implement `normalize_date()`.
- [ ] Implement `normalize_currency_amount()`.
- [ ] Make normalizers pure and deterministic.
- [ ] Use the same normalizer for expected payments, bank rows, and payment proofs.
- [ ] Add unit tests for punctuation, case, legal suffixes, currency symbols, commas, and invalid dates.

## Payment Proof Normalization

- [ ] Convert Agent 1 raw `PaymentProofExtractionOutput` into `NormalizedPaymentProofRecord`.
- [ ] Preserve Agent 1 `aiMetadata`.
- [ ] Preserve evidence spans.
- [ ] Preserve extraction warnings.
- [ ] Add `normalizationMetadata`.
- [ ] Do not overwrite raw extracted fields.
- [ ] Do not match proof to invoice or bank row.

## Batch Assembly

- [ ] Implement `normalizeInputBatch()`.
- [ ] Accept parsed expected payments.
- [ ] Accept parsed bank transactions.
- [ ] Accept Agent 1 proof extraction outputs.
- [ ] Return `NormalizedInputBatch`.
- [ ] Include all warnings and timeline events.
- [ ] Reject or warn on invalid schema versions.

## Tests

- [ ] Test expected-payment parsing.
- [ ] Test bank-statement parsing.
- [ ] Test payment-proof normalization.
- [ ] Test batch assembly.
- [ ] Test normalized reference consistency across invoice, proof, and bank row.
- [ ] Test invalid money/date/reference inputs.
- [ ] Test that no FX, matching, scoring, or classification logic appears in this layer.

## Handoff To Agent 2

- [ ] Provide one clean normalized batch fixture.
- [ ] Provide one fixture with weak proof confidence.
- [ ] Provide one fixture with missing reference but usable payer/date/amount.
- [ ] Provide one fixture with duplicate or ambiguous reference.
- [ ] Document exact fields Agent 2 should consume.
