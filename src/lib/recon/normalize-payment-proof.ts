import { normalize_date, normalize_party_name, normalize_reference } from "./normalizers";
import type {
  NormalizedPaymentProofFinancialPayload,
  NormalizedPaymentProofRecord,
  PaymentProofExtractionOutput,
  Warning,
} from "./types";

type NormalizationTool = "normalize_party_name" | "normalize_reference" | "normalize_date";

export function normalizePaymentProof(
  extraction: PaymentProofExtractionOutput,
): NormalizedPaymentProofRecord {
  const fp = extraction.financialPayload;
  const warnings: Warning[] = [];
  const toolsUsed = new Set<NormalizationTool>();

  // ── Debtor ────────────────────────────────────────────────────────────────────
  const rawDebtorName = fp.debtor.rawName;
  if (rawDebtorName === null) {
    warnings.push({ code: "MISSING_DEBTOR", message: "Debtor name is missing in extraction output", field: "debtor.rawName" });
  } else {
    toolsUsed.add("normalize_party_name");
  }
  const debtorNormalizedName = normalize_party_name(rawDebtorName);

  // ── Creditor ──────────────────────────────────────────────────────────────────
  const rawCreditorName = fp.creditor.rawName;
  if (rawCreditorName === null) {
    warnings.push({ code: "MISSING_CREDITOR", message: "Creditor name is missing in extraction output", field: "creditor.rawName" });
  } else {
    toolsUsed.add("normalize_party_name");
  }
  const creditorNormalizedName = normalize_party_name(rawCreditorName);

  // ── Reference ─────────────────────────────────────────────────────────────────
  const rawReference = fp.reference.raw;
  if (rawReference === null) {
    warnings.push({ code: "MISSING_PAYMENT_REFERENCE", message: "Payment reference is missing in extraction output", field: "reference.raw" });
  } else {
    toolsUsed.add("normalize_reference");
  }
  const normalizedReference = normalize_reference(rawReference);

  // ── Dates — strips time component from ISO datetimes ──────────────────────────
  const normalizeOneDate = (raw: string | null): string | null => {
    if (raw === null) return null;
    toolsUsed.add("normalize_date");
    return normalize_date(raw) ?? raw;
  };
  const paymentDate = normalizeOneDate(fp.paymentDate);
  const valueDate = normalizeOneDate(fp.valueDate);
  const bookingDate = normalizeOneDate(fp.bookingDate);

  // ── Field-level warnings ──────────────────────────────────────────────────────
  if (!fp.paidAmount) {
    warnings.push({ code: "MISSING_PAID_AMOUNT", message: "Paid amount is missing", field: "paidAmount" });
  }
  if (!paymentDate) {
    warnings.push({ code: "MISSING_PAYMENT_DATE", message: "Payment date is missing or unrecognised", field: "paymentDate" });
  }
  if (fp.paymentStatus !== "ACSC") {
    warnings.push({
      code: "PAYMENT_NOT_SETTLED",
      message: `Payment status is "${fp.paymentStatus}", not ACSC (Accepted Settlement Completed)`,
      field: "paymentStatus",
    });
  }
  if (extraction.aiMetadata.overallConfidence < 0.6) {
    warnings.push({
      code: "LOW_CONFIDENCE_EXTRACTION",
      message: `Overall confidence ${extraction.aiMetadata.overallConfidence.toFixed(2)} is below threshold 0.60`,
      field: "aiMetadata.overallConfidence",
    });
  }

  // ── Assemble normalized payload ───────────────────────────────────────────────
  const {
    debtor: _d,
    creditor: _c,
    reference: _r,
    paymentDate: _pd,
    valueDate: _vd,
    bookingDate: _bd,
    ...payloadRest
  } = fp;

  const normalizedPayload: NormalizedPaymentProofFinancialPayload = {
    ...payloadRest,
    debtor: { name: rawDebtorName, normalizedName: debtorNormalizedName },
    creditor: { name: rawCreditorName, normalizedName: creditorNormalizedName },
    reference: { raw: rawReference, normalized: normalizedReference },
    paymentDate,
    valueDate,
    bookingDate,
  };

  return {
    schemaVersion: "1.0.0",
    proofId: extraction.proofId,
    sourceFileId: extraction.sourceFileId,
    financialPayload: normalizedPayload,
    aiMetadata: extraction.aiMetadata,
    normalizationMetadata: {
      normalizedAt: new Date().toISOString(),
      toolsUsed: [...toolsUsed],
      warnings,
    },
  };
}
