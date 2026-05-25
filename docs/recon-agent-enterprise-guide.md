# Recon Agent Enterprise Upgrade Guide

This guide maps the completed reconciliation upgrade to the codebase. It is written for the next engineer or UI builder who needs to know what data exists, where it is produced, and what should be rendered later.

## Phase 1: Safety Gates And Scoring Hardening

Included:
- Token-aware partial reference matching that ignores generic tokens and standalone years from 2020-2035.
- Partial references are weak evidence unless backed by amount and party evidence.
- Absolute residual caps prevent large shortages from passing as percentage tolerances.
- Flat fees are separated from FX variance, short payment, overpayment, and unexplained residuals.

Where:
- Policy defaults: `src/lib/recon/reconciliation/policy.ts`
- Reference matching and candidate signals: `src/lib/recon/reconciliation/generate-candidates.ts`
- Residual classification: `src/lib/recon/reconciliation/evaluate-residual.ts`
- Score and hard review gates: `src/lib/recon/reconciliation/scoring.ts`
- Regression tests: `src/lib/recon/reconciliation/enterprise-upgrade.test.ts`

UI-ready fields:
- `ReconciliationResult.reasonCodes`
- `ReconciliationResult.hardReviewFlags`
- `ReconciliationResult.residual.residualClassification`
- `ReconciliationResult.residual.absoluteCap`
- `ReconciliationResult.residual.exceedsAbsoluteCap`

## Phase 2: FX Provider And Cached Historical Rates

Included:
- `FxRateProvider` abstraction for fixture, cached, composite, and BNM live providers.
- BNM OpenAPI historical exchange-rate hydration for MYR settlement pairs, with non-MYR cross rates derived through MYR.
- Local JSON FX cache keyed by provider, base currency, quote currency, and date.
- FX scenario source hierarchy: bank actual, proof declared, market/fixture, spread-adjusted.
- Spread margins from policy are tested against market-style rates.

Where:
- Provider/cache interfaces, BNM adapter, and runtime BNM factory: `src/lib/recon/reconciliation/fx-provider.ts`
- Fixture table fallback: `src/lib/recon/reconciliation/fx-table.ts`
- FX scenario generation: `src/lib/recon/reconciliation/calculate-fx-scenarios.ts`
- Waiting-proof runtime BNM hydration: `src/server/reconciliation/waiting-reconciliation.ts`

BNM integration:
- Endpoint pattern: `https://api.bnm.gov.my/public/exchange-rate/{currency}/date/{YYYY-MM-DD}?session=1700&quote=rm`
- Required header: `Accept: application/vnd.BNM.API.v1+json`
- Provider ID: `bnm`
- Runtime cache path: `runtime/extracted/fx-cache/bnm`
- Direct BNM rates appear on FX scenarios as `rateSource: "live_api"` and `providerId: "bnm"`.
- Spread-adjusted scenarios keep `providerId: "bnm"` so reviewers can see the market source plus the bank-spread assumption.
- If BNM is unavailable or has no rate for the requested pair/date, runtime falls back to fixtures only for local/offline continuity; fixture-only explanations remain review-gated when evidence is weak.

UI-ready fields:
- `ReconciliationResult.bestFxScenario.fxSourceKind`
- `ReconciliationResult.bestFxScenario.providerId`
- `ReconciliationResult.bestFxScenario.spreadMargin`
- `ReconciliationResult.bestFxScenario.rateSource`
- `ReconciliationResult.bestFxScenario.rateDate`
- `ReconciliationResult.auditTrail.fxSourceKind`
- `ReconciliationResult.auditTrail.fxScenarioId`

## Phase 3: Many-To-One Batch Matching And Remittance Advice

Included:
- Batch candidates with `candidateKind: "batch_invoices"`.
- Remittance invoice IDs can directly group multiple invoices.
- Payment-proof extraction now captures multiple invoice IDs and optional remittance line items from text/table/structured extraction.
- Bounded subset-sum matching groups open invoices by debtor/currency and policy limits.
- Allocation rows show applied and remaining amount per invoice.

Where:
- Candidate type and allocation types: `src/lib/recon/reconciliation/types.ts`
- Batch/remittance/subset-sum generation: `src/lib/recon/reconciliation/generate-candidates.ts`
- Deterministic proof/remittance parsing: `src/lib/recon/extraction/extract-payment-fields.ts`
- Tool-result payload mapping: `src/lib/recon/extraction/build-tool-result.ts`
- Structured extractor remittance schema: `src/lib/recon/extraction/structured-extractor.ts`
- Remittance line item schema: `src/lib/recon/schemas.ts`

UI-ready fields:
- `ReconciliationResult.candidateKind`
- `ReconciliationResult.expectedPaymentIds`
- `ReconciliationResult.allocations[]`
- `PaymentAllocation.invoiceNumber`
- `PaymentAllocation.appliedAmount`
- `PaymentAllocation.remainingAmount`
- `PaymentAllocation.reason`

## Phase 4: Duplicate Protection, Idempotency, And Allocation Ledger

Included:
- Payment application ledger records each completed auto-match.
- Bank transactions and proof IDs are treated as consumed after application.
- Re-runs do not duplicate applications.
- Prior allocations are applied before candidate generation so partially paid invoices can receive later payments only up to remaining outstanding amount.
- Duplicate bank statement rows and reversal/correction rows force human review instead of auto-match.
- Runtime reconciliation uses local JSON storage for applications.

Where:
- Store interfaces and local implementations: `src/lib/recon/reconciliation/stores.ts`
- Orchestrator application save, consumed-bank filtering, ledger adjustment, duplicate/reversal review gates: `src/lib/recon/reconciliation/orchestrator.ts`
- Runtime wiring: `src/server/reconciliation/waiting-reconciliation.ts`

Runtime paths:
- Payment applications: `runtime/extracted/payment_applications/applications.json`
- Individual application files: `runtime/extracted/payment_applications/<applicationId>.json`

UI-ready fields:
- `PaymentApplication.applicationId`
- `PaymentApplication.policyVersion`
- `PaymentApplication.bankTransactionId`
- `PaymentApplication.proofId`
- `PaymentApplication.expectedPaymentIds`
- `PaymentApplication.allocations`
- Hard flags: `DUPLICATE_BANK_TRANSACTION`, `POSSIBLE_REVERSAL`

## Phase 5: Counterparty Identity And Evidence Trust

Included:
- Counterparty identity store interface and local JSON implementation.
- Name matching now supports exact names, known aliases, known payer names, and account identity matches.
- Similar names are medium-strength only and do not become strong identity evidence.
- Critical proof confidence checks cover amount, currency, reference, date, payer, beneficiary, and status when those confidences are present.
- Evidence trust summary is attached to scored candidates and final results.

Where:
- Identity store: `src/lib/recon/reconciliation/stores.ts`
- Identity-aware matching: `src/lib/recon/reconciliation/generate-candidates.ts`
- Evidence trust calculation: `src/lib/recon/reconciliation/scoring.ts`
- Runtime identity-map loading: `src/server/reconciliation/waiting-reconciliation.ts`

Runtime identity map:
- Put local identities at `runtime/extracted/counterparties/counterparty-identities.json`.
- Shape:

```json
[
  {
    "canonicalName": "ACME GROUP",
    "aliases": ["ACME"],
    "payerNames": ["ACME MALAYSIA"],
    "debtorAccounts": [
      {
        "iban": null,
        "swiftBic": null,
        "localAccountId": "123456789",
        "maskedAccount": null
      }
    ],
    "notes": "Known treasury payer for Acme subsidiaries."
  }
]
```

UI-ready fields:
- `ReconciliationResult.evidenceTrust.level`
- `ReconciliationResult.evidenceTrust.extractionRoute`
- `ReconciliationResult.evidenceTrust.hasEvidenceSpans`
- `ReconciliationResult.evidenceTrust.criticalFieldsChecked`
- `ReconciliationResult.evidenceTrust.issues[]`
- Reason codes: `COUNTERPARTY_ALIAS_MATCH`, `COUNTERPARTY_ACCOUNT_MATCH`, `NAME_SIMILAR`, `NAME_MATCH`, `NAME_MISMATCH`

## Phase 6: Audit Trail And Review Workflow Payloads

Included:
- Every result has an audit trail with selected candidate, candidate kind, FX scenario/source, policy version, evidence refs, reason codes, and hard flags.
- Every result has a review payload stating whether review is required, the primary question, blockers, and suggested actions.
- Human review requests now carry hard flags and suggested actions.
- Existing UI has partial display support, but no new UI build is required here.

Where:
- Result contract: `src/lib/recon/reconciliation/types.ts`
- Audit/review payload creation: `src/lib/recon/reconciliation/orchestrator.ts`
- Human review request type creation: `src/lib/recon/reconciliation/artifacts.ts`
- Existing partial UI display: `src/components/reconciliation/CaseDetailPanel.tsx`

UI-ready fields:
- `ReconciliationResult.auditTrail`
- `ReconciliationResult.reviewPayload`
- `HumanReviewRequest.hardReviewFlags`
- `HumanReviewRequest.suggestedActions`

Recommended future UI sections:
- Case summary: status, score, candidate kind, policy version.
- Evidence table: invoice/proof/bank reference, party, amount, dates, confidence.
- Allocation table: one row per `PaymentAllocation`.
- FX panel: best scenario, rate, source kind, spread, residual type.
- Trust panel: evidence trust level and critical field issues.
- Review panel: primary question, blockers, suggested actions, options if present.
- Audit panel: policy version, evidence refs, selected candidate, reason codes, hard flags.

## Verification

Current verification commands:

```bash
npm run typecheck
npm test
npm run build
```

Key regression coverage:
- `src/lib/recon/reconciliation/enterprise-upgrade.test.ts`
- `src/lib/recon/reconciliation/generate-candidates.test.ts`
- `src/lib/recon/reconciliation/scoring.test.ts`
- `src/lib/recon/reconciliation/orchestrator.test.ts`
