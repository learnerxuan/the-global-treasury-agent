import type { FieldEvidence, PaymentProofFinancialPayload, PaymentProofInputDescriptor, Warning } from "../types";
import { makeEvidence, missingFieldWarning } from "./evidence";
import {
  computeImpliedFx,
  extractAllMoney,
  extractDate,
  extractFxRate,
  extractInvoiceIds,
  extractMoney,
  extractParty,
  extractPaymentStatus,
  extractProviderOrBankName,
  extractRemittanceLineItems,
  extractReference
} from "./extract-payment-fields";
import type { ExtractionRoute, ExtractionToolResult } from "./tools";

type BuildInput = {
  descriptor: PaymentProofInputDescriptor;
  route: Exclude<ExtractionRoute, "manual_correction">;
  text: string;
  evidenceSource: FieldEvidence["source"];
  sourceMode: "real_file" | "unreadable";
  sourceWarnings: Warning[];
  /** OCR confidence score (0-100) from Tesseract, if available. */
  ocrConfidence?: number;
};

function confidenceFor(route: BuildInput["route"], field: "party" | "critical"): number {
  if (route === "parse_image_ocr") {
    return field === "party" ? 0.82 : 0.86;
  }
  if (route === "parse_pdf_table") {
    return field === "party" ? 0.94 : 0.96;
  }
  return field === "party" ? 0.94 : 0.98;
}

export function buildToolResult(input: BuildInput): ExtractionToolResult {
  const moneyValues = extractAllMoney(input.text);
  const paidAmount = extractMoney(input.text);
  const sourceAmount = paidAmount ? { value: paidAmount.value, currency: paidAmount.currency } : null;
  const targetAmount = moneyValues.find((money) => money.currency !== paidAmount?.currency) ?? null;
  const paymentDate = extractDate(input.text);
  const reference = extractReference(input.text);
  const invoiceIds = extractInvoiceIds(input.text);
  const remittanceLineItems = extractRemittanceLineItems(input.text);
  const paymentStatus = extractPaymentStatus(input.text);
  const providerOrBankName = extractProviderOrBankName(input.text);
  const debtorName = extractParty(input.text, ["Payer", "Sender", "Debtor"]);
  const creditorName = extractParty(input.text, ["Beneficiary", "Creditor", "to"]);
  const explicitFx = extractFxRate(input.text);
  const exchangeRateInformation = explicitFx ?? computeImpliedFx(sourceAmount, targetAmount);

  const warnings: Warning[] = [...input.sourceWarnings];
  if (!paidAmount) warnings.push(missingFieldWarning("financialPayload.paidAmount", "MISSING_PAID_AMOUNT"));
  if (!paymentDate) warnings.push(missingFieldWarning("financialPayload.paymentDate", "MISSING_PAYMENT_DATE"));
  if (!reference.raw && invoiceIds.length === 0) {
    warnings.push(missingFieldWarning("financialPayload.reference.raw", "MISSING_PAYMENT_REFERENCE"));
  }
  if (!debtorName) warnings.push(missingFieldWarning("financialPayload.debtor.rawName", "MISSING_DEBTOR"));
  if (!creditorName) warnings.push(missingFieldWarning("financialPayload.creditor.rawName", "MISSING_CREDITOR"));

  const fieldConfidence: Record<string, number> = {};
  const evidenceSpans: FieldEvidence[] = [];
  const criticalConfidence = confidenceFor(input.route, "critical");
  const partyConfidence = confidenceFor(input.route, "party");

  if (paidAmount) {
    fieldConfidence["financialPayload.paidAmount.value"] = criticalConfidence;
    fieldConfidence["financialPayload.paidAmount.currency"] = criticalConfidence;
    evidenceSpans.push(
      makeEvidence({
        field: "financialPayload.paidAmount.value",
        value: paidAmount.value,
        originalValue: paidAmount.original,
        normalizedValue: paidAmount.value,
        confidence: criticalConfidence,
        source: input.evidenceSource
      })
    );
  }
  if (paymentDate) {
    fieldConfidence["financialPayload.paymentDate"] = criticalConfidence;
    evidenceSpans.push(
      makeEvidence({
        field: "financialPayload.paymentDate",
        value: paymentDate,
        confidence: criticalConfidence,
        source: input.evidenceSource
      })
    );
  }
  if (reference.raw) {
    fieldConfidence["financialPayload.reference.raw"] = criticalConfidence;
    evidenceSpans.push(
      makeEvidence({
        field: "financialPayload.reference.raw",
        value: reference.raw,
        confidence: criticalConfidence,
        source: input.evidenceSource
      })
    );
  }
  if (debtorName) {
    fieldConfidence["financialPayload.debtor.rawName"] = partyConfidence;
    evidenceSpans.push(
      makeEvidence({
        field: "financialPayload.debtor.rawName",
        value: debtorName,
        confidence: partyConfidence,
        source: input.evidenceSource
      })
    );
  }
  if (creditorName) {
    fieldConfidence["financialPayload.creditor.rawName"] = partyConfidence;
    evidenceSpans.push(
      makeEvidence({
        field: "financialPayload.creditor.rawName",
        value: creditorName,
        confidence: partyConfidence,
        source: input.evidenceSource
      })
    );
  }

  if (input.route === "parse_image_ocr") {
    warnings.push({
      code: "LOW_CONFIDENCE_EXTRACTION",
      message: "OCR party fields are below high-confidence threshold and should remain visible for review.",
      field: "financialPayload.debtor.rawName"
    });
  }

  // Apply OCR confidence penalty when Tesseract reports low confidence
  if (input.ocrConfidence !== undefined && input.ocrConfidence < 60) {
    const penalty = input.ocrConfidence / 100;
    for (const key of Object.keys(fieldConfidence)) {
      const val = fieldConfidence[key];
      if (val !== undefined) fieldConfidence[key] = val * penalty;
    }
  }

  const payload: Partial<PaymentProofFinancialPayload> = {
    documentType:
      input.route === "parse_pdf_table" ? "bank_advice" : input.route === "parse_image_ocr" ? "remittance_advice" : "provider_receipt",
    paymentStatus: paymentStatus.paymentStatus,
    paymentStatusLabel: paymentStatus.label,
    rawPaymentStatus: paymentStatus.raw,
    debtor: { rawName: debtorName },
    creditor: { rawName: creditorName },
    paidAmount: paidAmount ? { value: paidAmount.value, currency: paidAmount.currency } : null,
    paymentDate,
    reference,
    providerOrBankName,
    invoiceIds,
    remittanceLineItems,
    providerTransactionId: input.text.match(/\b(?:WISE|DBS|MYB)-[A-Z0-9-]+\b/i)?.[0] ?? null,
    sourceAmount,
    targetAmount: targetAmount ? { value: targetAmount.value, currency: targetAmount.currency } : null,
    exchangeRateInformation,
    remittanceInformation: {
      raw: reference.raw ? `Payment for ${reference.raw}` : null,
      structured: reference.raw ? { invoiceNumber: reference.raw } : null
    },
    rawText: input.text
  };

  return {
    route: input.route,
    rawText: input.text,
    candidateFinancialPayload: payload,
    fieldConfidence,
    evidenceSpans,
    warnings,
    sourceMode: input.sourceMode
  };
}
