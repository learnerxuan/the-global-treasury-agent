import { paymentProofExtractionOutputSchema } from "../schemas";
import type { PaymentProofExtractionOutput, PaymentProofFinancialPayload, PaymentProofInputDescriptor, WarningCode } from "../types";
import { addEvent, createTimeline, listEvents, type TimelineEvent } from "../timeline";
import { getExtractionToolRegistry, type ExtractionRoute, type ExtractionToolResult } from "./tools";

export type ExtractionAgentResult = {
  extraction: PaymentProofExtractionOutput;
  timeline: TimelineEvent[];
};

export function selectInitialRoute(descriptor: PaymentProofInputDescriptor): ExtractionRoute {
  if (descriptor.imageQuality === "low") return "manual_correction";
  if (descriptor.tableLikely) return "parse_pdf_table";
  if (descriptor.mimeType === "application/pdf" && descriptor.textLayer) return "parse_pdf_text";
  if (descriptor.mimeType === "text/plain") return "parse_pdf_text";
  if (descriptor.mimeType.startsWith("image/")) return "parse_image_ocr";
  return "manual_correction";
}

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

function confidence(fieldConfidence: Record<string, number>, fields: string[]): number {
  return Math.max(0, ...fields.map((field) => fieldConfidence[field] ?? 0));
}

export function calculateOverallConfidence(fieldConfidence: Record<string, number>): number {
  const weighted =
    confidence(fieldConfidence, ["financialPayload.paidAmount.value", "financialPayload.paidAmount.currency"]) * 0.3 +
    confidence(fieldConfidence, ["financialPayload.paymentDate"]) * 0.2 +
    confidence(fieldConfidence, ["financialPayload.reference.raw", "financialPayload.invoiceIds"]) * 0.2 +
    confidence(fieldConfidence, ["financialPayload.debtor.rawName"]) * 0.15 +
    confidence(fieldConfidence, ["financialPayload.creditor.rawName"]) * 0.15;

  return Number(weighted.toFixed(4));
}

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

export function isExtractionWeak(toolResult: ExtractionToolResult): boolean {
  const payload = mergeToolPayloadWithDefaults(toolResult);
  const overallConfidence = calculateOverallConfidence(toolResult.fieldConfidence);

  return (
    !payload.paidAmount ||
    !payload.paymentDate ||
    (!payload.reference.raw && payload.invoiceIds.length === 0) ||
    !payload.debtor.rawName ||
    !payload.creditor.rawName ||
    payload.paymentStatus !== "ACSC" ||
    overallConfidence < 0.85 ||
    toolResult.warnings.some((warning) => criticalWarningCodes.includes(warning.code))
  );
}

function requiresManualReview(route: ExtractionRoute, payload: PaymentProofFinancialPayload, toolResult: ExtractionToolResult, overallConfidence: number): boolean {
  return (
    route === "manual_correction" ||
    overallConfidence < 0.85 ||
    !payload.paidAmount ||
    !payload.paymentDate ||
    (!payload.reference.raw && payload.invoiceIds.length === 0) ||
    !payload.debtor.rawName ||
    !payload.creditor.rawName ||
    payload.paymentStatus !== "ACSC" ||
    toolResult.warnings.some((warning) => criticalWarningCodes.includes(warning.code))
  );
}

function nextFallbackRoute(descriptor: PaymentProofInputDescriptor, route: ExtractionRoute): ExtractionRoute | null {
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

  return criticalFields + calculateOverallConfidence(result.fieldConfidence);
}

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
    const overallConfidence = calculateOverallConfidence(result.fieldConfidence);
    const weak = isExtractionWeak(result);

    addEvent(timeline, {
      agent: "Extraction Agent",
      action: "Observed extraction result",
      toolName: route,
      inputSummary: descriptor.fileName,
      resultSummary: weak ? "Extraction is weak; evaluating fallback." : "Extraction is strong enough for handoff.",
      reasoning: weak
        ? "Critical fields, confidence, payment status, or warnings require retry/manual review."
        : "Critical fields are present with acceptable confidence.",
      observedConfidence: overallConfidence,
      warnings: result.warnings
    });

    if (!weak) {
      break;
    }

    const fallback = nextFallbackRoute(descriptor, route);
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
      reasoning: "The previous route produced weak extraction quality.",
      warnings: result.warnings
    });
  }

  const bestResult = [...attempted].sort((a, b) => resultScore(b) - resultScore(a))[0];
  if (!bestResult) {
    throw new Error("Extraction Agent could not produce an extraction attempt.");
  }

  const financialPayload = mergeToolPayloadWithDefaults(bestResult);
  const overallConfidence = calculateOverallConfidence(bestResult.fieldConfidence);
  const extraction: PaymentProofExtractionOutput = {
    schemaVersion: "1.0.0",
    proofId: `proof_${descriptor.fileId.replace(/^proof_file_/, "").padStart(3, "0")}`,
    sourceFileId: descriptor.fileId,
    financialPayload,
    aiMetadata: {
      extractionRoute: bestResult.route,
      overallConfidence,
      fieldConfidence: bestResult.fieldConfidence,
      evidenceSpans: bestResult.evidenceSpans,
      requiresManualReview: requiresManualReview(bestResult.route, financialPayload, bestResult, overallConfidence),
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
