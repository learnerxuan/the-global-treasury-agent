import type { PaymentProofInputDescriptor } from "../types";
import { makeEvidence, makeWarning } from "./evidence";
import type { ExtractionToolResult } from "./tools";

export async function manualCorrection(_descriptor: PaymentProofInputDescriptor): Promise<ExtractionToolResult> {
  const warnings = [
    makeWarning("MISSING_PAID_AMOUNT", "Payment amount could not be read from the proof.", "financialPayload.paidAmount"),
    makeWarning("MISSING_PAYMENT_DATE", "Payment date could not be read from the proof.", "financialPayload.paymentDate"),
    makeWarning("MISSING_PAYMENT_REFERENCE", "Payment reference could not be read from the proof.", "financialPayload.reference.raw"),
    makeWarning("MISSING_DEBTOR", "Debtor could not be read from the proof.", "financialPayload.debtor.rawName"),
    makeWarning("MISSING_CREDITOR", "Creditor could not be read from the proof.", "financialPayload.creditor.rawName"),
    makeWarning("LOW_QUALITY_PROOF", "Manual correction required before reconciliation.", null)
  ];

  return {
    route: "manual_correction",
    rawText: null,
    candidateFinancialPayload: {
      documentType: "other",
      paymentStatus: "UNKNOWN",
      debtor: { rawName: null },
      creditor: { rawName: null },
      paidAmount: null,
      paymentDate: null,
      reference: { raw: null },
      invoiceIds: [],
      exchangeRateInformation: null
    },
    fieldConfidence: {
      "financialPayload.paidAmount.value": 0,
      "financialPayload.paymentDate": 0,
      "financialPayload.reference.raw": 0,
      "financialPayload.debtor.rawName": 0,
      "financialPayload.creditor.rawName": 0
    },
    evidenceSpans: [
      makeEvidence({
        field: "manual_correction",
        value: null,
        originalValue: null,
        confidence: 0,
        source: "manual",
        evidenceText: "Manual correction required before reconciliation",
        warnings
      })
    ],
    warnings,
    sourceMode: "unreadable"
  };
}
