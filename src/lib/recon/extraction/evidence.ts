import type { FieldEvidence, Warning, WarningCode } from "../types.js";

export function makeWarning(code: WarningCode, message: string, field: string | null): Warning {
  return { code, message, field };
}

export function makeEvidence(input: {
  field: string;
  value: string | null;
  originalValue?: string | null;
  normalizedValue?: string | null;
  confidence: number;
  source: FieldEvidence["source"];
  evidenceText?: string | null;
  warnings?: Warning[];
}): FieldEvidence {
  return {
    field: input.field,
    value: input.value,
    originalValue: input.originalValue ?? input.value,
    normalizedValue: input.normalizedValue ?? null,
    confidence: input.confidence,
    source: input.source,
    evidenceText: input.evidenceText ?? input.originalValue ?? input.value,
    page: input.source.startsWith("pdf") ? 1 : null,
    bbox: null,
    warnings: input.warnings ?? []
  };
}

export function missingFieldWarning(field: string, code: WarningCode): Warning {
  return makeWarning(code, `Could not extract ${field}.`, field);
}
