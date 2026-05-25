import { paymentProofExtractionOutputSchema } from "../schemas";
import type { PaymentProofExtractionOutput, PaymentProofFinancialPayload, PaymentProofInputDescriptor, WarningCode } from "../types";
import { addEvent, createTimeline, listEvents, type TimelineEvent } from "../timeline";
import { getExtractionToolRegistry, type ExtractionRoute, type ExtractionToolResult } from "./tools";
import { mergeExtractions } from "./merge-extractions";
import { createChutesStructuredExtractor } from "./structured-extractor";

export type ExtractionAgentResult = {
  extraction: PaymentProofExtractionOutput;
  timeline: TimelineEvent[];
};

// ─── Quality assessment (consolidates isExtractionWeak + requiresManualReview) ─

export type ExtractionQuality = {
  isWeak: boolean;
  requiresManualReview: boolean;
  reasons: string[];
  missingCriticalFields: string[];
  overallConfidence: number;
};

const criticalWarningCodes: WarningCode[] = [
  "MISSING_PAID_AMOUNT",
  "MISSING_PAYMENT_DATE",
  "MISSING_PAYMENT_REFERENCE",
  "MISSING_DEBTOR",
  "MISSING_CREDITOR",
  "LOW_QUALITY_PROOF",
  "LOW_CONFIDENCE_EXTRACTION",
  "PAYMENT_NOT_SETTLED"
];

// ─── Route selection ─────────────────────────────────────────────────────────

export function selectInitialRoute(descriptor: PaymentProofInputDescriptor): ExtractionRoute {
  if (descriptor.imageQuality === "low") return "manual_correction";
  if (descriptor.tableLikely) return "parse_pdf_table";
  if (descriptor.mimeType === "application/pdf" && descriptor.textLayer) return "parse_pdf_text";
  if (descriptor.mimeType === "text/plain") return "parse_pdf_text";
  if (descriptor.mimeType.startsWith("image/")) return "parse_image_ocr";
  return "manual_correction";
}

// ─── Default payload ─────────────────────────────────────────────────────────

export function createDefaultFinancialPayload(): PaymentProofFinancialPayload {
  return {
    documentType: "other",
    paymentStatus: "UNKNOWN",
    paymentStatusLabel: null,
    rawPaymentStatus: null,
    debtor: { rawName: null },
    creditor: { rawName: null },
    debtorAccount: null,
    creditorAccount: null,
    paidAmount: null,
    paymentDate: null,
    valueDate: null,
    bookingDate: null,
    reference: { raw: null },
    providerTransactionId: null,
    providerOrBankName: null,
    invoiceIds: [],
    endToEndId: null,
    uetr: null,
    feeAmount: null,
    netAmount: null,
    sourceAmount: null,
    targetAmount: null,
    exchangeRateInformation: null,
    remittanceInformation: { raw: null, structured: null },
    rawText: null
  };
}

export function mergeToolPayloadWithDefaults(toolResult: ExtractionToolResult): PaymentProofFinancialPayload {
  return {
    ...createDefaultFinancialPayload(),
    ...toolResult.candidateFinancialPayload
  };
}

// ─── Document-type-aware confidence weights ──────────────────────────────────

const WEIGHT_PROFILES: Record<string, { amount: number; date: number; reference: number; debtor: number; creditor: number }> = {
  default:            { amount: 0.30, date: 0.20, reference: 0.20, debtor: 0.15, creditor: 0.15 },
  remittance_advice:  { amount: 0.35, date: 0.15, reference: 0.30, debtor: 0.10, creditor: 0.10 },
  bank_advice:        { amount: 0.25, date: 0.20, reference: 0.20, debtor: 0.20, creditor: 0.15 },
  provider_receipt:   { amount: 0.30, date: 0.20, reference: 0.15, debtor: 0.15, creditor: 0.20 },
};

function confidence(fieldConfidence: Record<string, number>, fields: string[]): number {
  return Math.max(0, ...fields.map((field) => fieldConfidence[field] ?? 0));
}

export function calculateOverallConfidence(
  fieldConfidence: Record<string, number>,
  documentType?: string
): number {
  const weights = WEIGHT_PROFILES[documentType ?? "default"] ?? WEIGHT_PROFILES["default"]!;
  const weighted =
    confidence(fieldConfidence, ["financialPayload.paidAmount.value", "financialPayload.paidAmount.currency"]) * weights.amount +
    confidence(fieldConfidence, ["financialPayload.paymentDate"]) * weights.date +
    confidence(fieldConfidence, ["financialPayload.reference.raw", "financialPayload.invoiceIds"]) * weights.reference +
    confidence(fieldConfidence, ["financialPayload.debtor.rawName"]) * weights.debtor +
    confidence(fieldConfidence, ["financialPayload.creditor.rawName"]) * weights.creditor;

  return Number(weighted.toFixed(4));
}

// ─── Unified quality assessment ──────────────────────────────────────────────

export function assessExtractionQuality(
  toolResult: ExtractionToolResult,
  route?: ExtractionRoute
): ExtractionQuality {
  const payload = mergeToolPayloadWithDefaults(toolResult);
  const documentType = payload.documentType ?? "default";
  const overallConfidence = calculateOverallConfidence(toolResult.fieldConfidence, documentType);
  const reasons: string[] = [];
  const missingCriticalFields: string[] = [];

  if (!payload.paidAmount) {
    missingCriticalFields.push("paidAmount");
    reasons.push("Missing paid amount");
  }
  if (!payload.paymentDate) {
    missingCriticalFields.push("paymentDate");
    reasons.push("Missing payment date");
  }
  if (!payload.reference.raw && payload.invoiceIds.length === 0) {
    missingCriticalFields.push("reference");
    reasons.push("Missing reference/invoice IDs");
  }
  if (!payload.debtor.rawName) {
    missingCriticalFields.push("debtor");
    reasons.push("Missing debtor");
  }
  if (!payload.creditor.rawName) {
    missingCriticalFields.push("creditor");
    reasons.push("Missing creditor");
  }
  if (payload.paymentStatus !== "ACSC") {
    reasons.push(`Payment status: ${payload.paymentStatus}`);
  }
  if (overallConfidence < 0.85) {
    reasons.push(`Low confidence: ${overallConfidence}`);
  }

  const hasCriticalWarnings = toolResult.warnings.some((w) => criticalWarningCodes.includes(w.code));
  if (hasCriticalWarnings) {
    reasons.push("Has critical warnings");
  }

  const isWeak =
    missingCriticalFields.length > 0 ||
    overallConfidence < 0.85 ||
    payload.paymentStatus !== "ACSC" ||
    hasCriticalWarnings;

  return {
    isWeak,
    requiresManualReview: isWeak || route === "manual_correction",
    reasons,
    missingCriticalFields,
    overallConfidence,
  };
}

// ─── Legacy compatibility wrappers ───────────────────────────────────────────

/** @deprecated Use assessExtractionQuality instead */
export function isExtractionWeak(toolResult: ExtractionToolResult): boolean {
  return assessExtractionQuality(toolResult).isWeak;
}

// ─── Failure-reason-aware fallback routing ────────────────────────────────────

function nextFallbackRoute(
  descriptor: PaymentProofInputDescriptor,
  route: ExtractionRoute,
  quality: ExtractionQuality
): ExtractionRoute | null {
  // If text extraction found essentially nothing (4+ missing critical fields),
  // skip table parser (same issue for scanned PDFs) → go straight to OCR
  if (
    quality.missingCriticalFields.length >= 4 &&
    route === "parse_pdf_text" &&
    descriptor.mimeType !== "text/plain"
  ) {
    return "parse_image_ocr";
  }

  // Default fallback chain
  if (route === "parse_pdf_text" && descriptor.tableLikely) return "parse_pdf_table";
  if ((route === "parse_pdf_text" || route === "parse_pdf_table") && descriptor.mimeType !== "text/plain") return "parse_image_ocr";
  if (route === "parse_image_ocr") return "manual_correction";
  return null;
}

function resultScore(result: ExtractionToolResult): number {
  const payload = mergeToolPayloadWithDefaults(result);
  const criticalFields = [
    payload.paidAmount,
    payload.paymentDate,
    payload.reference.raw ?? payload.invoiceIds[0],
    payload.debtor.rawName,
    payload.creditor.rawName
  ].filter(Boolean).length;

  return criticalFields + calculateOverallConfidence(result.fieldConfidence, payload.documentType ?? undefined);
}

// ─── Main extraction agent ──────────────────────────────────────────────────

export async function runExtractionAgent(descriptor: PaymentProofInputDescriptor): Promise<ExtractionAgentResult> {
  const timeline = createTimeline();
  const registry = await getExtractionToolRegistry();
  const attempted: ExtractionToolResult[] = [];
  let route: ExtractionRoute | null = selectInitialRoute(descriptor);

  addEvent(timeline, {
    agent: "Extraction Agent",
    action: "Selected extraction route",
    toolName: route,
    inputSummary: `${descriptor.fileName} (${descriptor.mimeType}, quality ${descriptor.imageQuality})`,
    resultSummary: `Initial route: ${route}`,
    reasoning: "Route selected from file type, text layer, table signal, and image quality.",
    warnings: descriptor.warnings
  });

  while (route) {
    const result = await registry[route](descriptor);
    attempted.push(result);
    const quality = assessExtractionQuality(result, route);

    addEvent(timeline, {
      agent: "Extraction Agent",
      action: "Observed extraction result",
      toolName: route,
      inputSummary: descriptor.fileName,
      resultSummary: quality.isWeak ? "Extraction is weak; evaluating fallback." : "Extraction is strong enough for handoff.",
      reasoning: quality.isWeak
        ? `Weak because: ${quality.reasons.join(", ")}. Missing: ${quality.missingCriticalFields.join(", ") || "none"}.`
        : "Critical fields are present with acceptable confidence.",
      observedConfidence: quality.overallConfidence,
      warnings: result.warnings
    });

    if (!quality.isWeak) {
      break;
    }

    const fallback = nextFallbackRoute(descriptor, route, quality);
    if (!fallback || attempted.some((item) => item.route === fallback)) {
      break;
    }

    route = fallback;
    addEvent(timeline, {
      agent: "Extraction Agent",
      action: "Retrying extraction route",
      toolName: route,
      inputSummary: descriptor.fileName,
      resultSummary: `Retrying with ${route}`,
      reasoning: `The previous route produced weak extraction quality: ${quality.reasons.join(", ")}.`,
      warnings: result.warnings
    });
  }

  let bestResult = [...attempted].sort((a, b) => resultScore(b) - resultScore(a))[0];
  if (!bestResult) {
    throw new Error("Extraction Agent could not produce an extraction attempt.");
  }

  // ─── LLM enrichment step ─────────────────────────────────────────────
  // If the best regex result is still weak and we have raw text to work with,
  // escalate to the LLM-based structured extractor to fill in gaps.
  const bestQuality = assessExtractionQuality(bestResult);
  if (bestQuality.isWeak && bestResult.rawText && bestResult.route !== "manual_correction") {
    addEvent(timeline, {
      agent: "Extraction Agent",
      action: "Escalating to LLM extraction",
      toolName: "structured_extractor" as any,
      inputSummary: descriptor.fileName,
      resultSummary: "Regex extraction weak; attempting LLM enrichment.",
      reasoning: `All regex routes exhausted with weak results: ${bestQuality.reasons.join(", ")}.`,
      warnings: bestResult.warnings
    });

    try {
      const structuredExtractor = createChutesStructuredExtractor();
      const llmResult = await structuredExtractor({
        role: "payment_proof",
        fileName: descriptor.fileName,
        mimeType: descriptor.mimeType,
        text: bestResult.rawText,
        toolObservations: bestResult.warnings.map((w) => w.message)
      });

      bestResult = mergeExtractions(bestResult, llmResult);

      addEvent(timeline, {
        agent: "Extraction Agent",
        action: "Merged LLM enrichment",
        toolName: "structured_extractor" as any,
        inputSummary: descriptor.fileName,
        resultSummary: `LLM enrichment applied. New confidence: ${calculateOverallConfidence(bestResult.fieldConfidence)}.`,
        reasoning: "Merged LLM-extracted fields into regex result for fields that were missing.",
        warnings: bestResult.warnings
      });
    } catch (llmError) {
      addEvent(timeline, {
        agent: "Extraction Agent",
        action: "LLM enrichment failed",
        toolName: "structured_extractor" as any,
        inputSummary: descriptor.fileName,
        resultSummary: `LLM enrichment failed: ${llmError instanceof Error ? llmError.message : "unknown error"}. Using regex-only result.`,
        reasoning: "LLM enrichment is optional; regex result is used as fallback.",
        warnings: bestResult.warnings
      });
    }
  }

  const financialPayload = mergeToolPayloadWithDefaults(bestResult);
  const finalQuality = assessExtractionQuality(bestResult, bestResult.route);
  const extraction: PaymentProofExtractionOutput = {
    schemaVersion: "1.0.0",
    proofId: `proof_${descriptor.fileId.replace(/^proof_file_/, "").padStart(3, "0")}`,
    sourceFileId: descriptor.fileId,
    financialPayload,
    aiMetadata: {
      extractionRoute: bestResult.route,
      overallConfidence: finalQuality.overallConfidence,
      fieldConfidence: bestResult.fieldConfidence,
      evidenceSpans: bestResult.evidenceSpans,
      requiresManualReview: finalQuality.requiresManualReview,
      warnings: bestResult.warnings
    }
  };

  const parsed = paymentProofExtractionOutputSchema.parse(extraction);

  addEvent(timeline, {
    agent: "Extraction Agent",
    action: "Assembled extraction output",
    toolName: bestResult.route,
    inputSummary: descriptor.fileName,
    resultSummary: parsed.aiMetadata.requiresManualReview ? "Output requires manual review." : "Output ready for Code Tools handoff.",
    reasoning: "Final output is schema-valid and contains raw proof fields only.",
    observedConfidence: parsed.aiMetadata.overallConfidence,
    warnings: parsed.aiMetadata.warnings
  });

  return { extraction: parsed, timeline: listEvents(timeline) };
}
