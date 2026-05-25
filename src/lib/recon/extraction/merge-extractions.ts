import type { PaymentProofFinancialPayload, Warning } from "../types";
import type { StructuredDocumentExtraction } from "./structured-extractor";
import type { ExtractionToolResult } from "./tools";

/**
 * Merges an LLM-based structured extraction result into a regex-based
 * ExtractionToolResult. The regex result is treated as the primary source;
 * the LLM fills in any null fields that the regex could not extract.
 *
 * The merge strategy:
 * 1. For each field, keep the regex value if it is non-null (higher trust for exact matches).
 * 2. If the regex value is null but the LLM extracted a value, use the LLM value
 *    with a slightly lower confidence (LLM confidence × 0.90 penalty).
 * 3. Merge warnings from both sources, deduplicating by warning code.
 * 4. Recalculate the field confidence map.
 */

const LLM_CONFIDENCE_PENALTY = 0.90;

function firstNonNull<T>(...values: (T | null | undefined)[]): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

function mergeWarnings(regexWarnings: Warning[], llmWarnings: string[]): Warning[] {
  const result = [...regexWarnings];
  const existingCodes = new Set(regexWarnings.map((w) => w.code));

  for (const message of llmWarnings) {
    // LLM warnings are plain strings; wrap them as generic warnings
    if (!existingCodes.has("LOW_CONFIDENCE_EXTRACTION")) {
      result.push({
        code: "LOW_CONFIDENCE_EXTRACTION",
        message: `LLM warning: ${message}`,
        field: null
      });
      existingCodes.add("LOW_CONFIDENCE_EXTRACTION");
    }
  }

  return result;
}

export function mergeExtractions(
  regexResult: ExtractionToolResult,
  llmResult: StructuredDocumentExtraction
): ExtractionToolResult {
  const regexPayload = regexResult.candidateFinancialPayload;
  const llmProof = llmResult.paymentProofs[0];

  // If LLM produced no payment proof records, return the regex result as-is
  if (!llmProof) {
    return regexResult;
  }

  const llmConfidence = (llmResult.confidence ?? 0.5) * LLM_CONFIDENCE_PENALTY;

  // Build the merged payload, preferring regex values over LLM values
  const merged: Partial<PaymentProofFinancialPayload> = { ...regexPayload };
  const fieldConfidence = { ...regexResult.fieldConfidence };

  // Paid amount
  if (!regexPayload.paidAmount && llmProof.paidAmount?.value) {
    merged.paidAmount = {
      value: llmProof.paidAmount.value,
      currency: (llmProof.paidAmount.currency ?? "USD") as PaymentProofFinancialPayload["paidAmount"] extends { currency: infer C } ? C : string
    };
    fieldConfidence["financialPayload.paidAmount.value"] = llmConfidence;
    fieldConfidence["financialPayload.paidAmount.currency"] = llmConfidence;
  }

  // Payment date
  if (!regexPayload.paymentDate && llmProof.paymentDate) {
    merged.paymentDate = llmProof.paymentDate;
    fieldConfidence["financialPayload.paymentDate"] = llmConfidence;
  }

  // Reference
  if (!regexPayload.reference?.raw && llmProof.reference) {
    merged.reference = { raw: llmProof.reference };
    fieldConfidence["financialPayload.reference.raw"] = llmConfidence;
  }

  // Invoice IDs
  if ((!regexPayload.invoiceIds || regexPayload.invoiceIds.length === 0) && llmProof.invoiceIds && llmProof.invoiceIds.length > 0) {
    merged.invoiceIds = llmProof.invoiceIds;
    fieldConfidence["financialPayload.invoiceIds"] = llmConfidence;
  }

  // Debtor
  if (!regexPayload.debtor?.rawName && llmProof.payerName) {
    merged.debtor = { rawName: llmProof.payerName };
    fieldConfidence["financialPayload.debtor.rawName"] = llmConfidence;
  }

  // Creditor
  if (!regexPayload.creditor?.rawName && llmProof.creditorName) {
    merged.creditor = { rawName: llmProof.creditorName };
    fieldConfidence["financialPayload.creditor.rawName"] = llmConfidence;
  }

  // Payment status
  if (regexPayload.paymentStatus === "UNKNOWN" && llmProof.paymentStatus) {
    const llmStatus = llmProof.paymentStatus.toLowerCase();
    if (["acsc", "paid", "completed", "settled", "successful"].includes(llmStatus)) {
      merged.paymentStatus = "ACSC";
      merged.paymentStatusLabel = "Settled";
      merged.rawPaymentStatus = llmProof.paymentStatus;
    } else if (["pndg", "pending", "processing"].includes(llmStatus)) {
      merged.paymentStatus = "PNDG";
      merged.paymentStatusLabel = "Pending";
      merged.rawPaymentStatus = llmProof.paymentStatus;
    } else if (["rjct", "rejected", "failed"].includes(llmStatus)) {
      merged.paymentStatus = "RJCT";
      merged.paymentStatusLabel = "Rejected";
      merged.rawPaymentStatus = llmProof.paymentStatus;
    }
  }

  // Provider/Bank name
  if (!regexPayload.providerOrBankName && llmProof.providerOrBankName) {
    merged.providerOrBankName = llmProof.providerOrBankName;
  }

  // Exchange rate
  if (!regexPayload.exchangeRateInformation && llmProof.exchangeRate) {
    // Store as a simple string — the full ExchangeRateInformation structure
    // will be built during normalization if needed.
    merged.exchangeRateInformation = null; // Cannot create full structure from LLM string alone
  }

  // Fee fields
  if (!regexPayload.feeAmount && llmProof.feeAmount?.value) {
    merged.feeAmount = {
      value: llmProof.feeAmount.value,
      currency: (llmProof.feeAmount.currency ?? llmProof.feeCurrency ?? "USD") as PaymentProofFinancialPayload["feeAmount"] extends { currency: infer C } | null ? C : string
    };
  }

  if (!regexPayload.netAmount && llmProof.netAmount?.value) {
    merged.netAmount = {
      value: llmProof.netAmount.value,
      currency: (llmProof.netAmount.currency ?? "USD") as PaymentProofFinancialPayload["netAmount"] extends { currency: infer C } | null ? C : string
    };
  }

  // Merge warnings
  const warnings = mergeWarnings(regexResult.warnings, llmResult.warnings);

  // Remove warnings for fields that are now populated from LLM
  const populatedFields = new Set<string>();
  if (merged.paidAmount) populatedFields.add("MISSING_PAID_AMOUNT");
  if (merged.paymentDate) populatedFields.add("MISSING_PAYMENT_DATE");
  if (merged.reference?.raw || (merged.invoiceIds && merged.invoiceIds.length > 0)) {
    populatedFields.add("MISSING_PAYMENT_REFERENCE");
  }
  if (merged.debtor?.rawName) populatedFields.add("MISSING_DEBTOR");
  if (merged.creditor?.rawName) populatedFields.add("MISSING_CREDITOR");

  const filteredWarnings = warnings.filter((w) => !populatedFields.has(w.code));

  return {
    ...regexResult,
    candidateFinancialPayload: merged,
    fieldConfidence,
    warnings: filteredWarnings
  };
}
