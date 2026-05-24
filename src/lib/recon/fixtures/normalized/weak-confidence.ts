import { normalizeInputBatch } from "../../normalize-input-batch";
import { weakConfidenceBatch } from "../batches/weak-confidence-batch";

// Pre-computed handoff fixture for Agent 2.
// Proof extracted via OCR from a low-quality photocopy (overallConfidence 0.42).
// Expect: LOW_CONFIDENCE_EXTRACTION in warnings; requiresManualReview flag is true
// on the proof's aiMetadata. Agent 2 should not auto-reconcile this record.
export const weakConfidenceNormalizedBatch = normalizeInputBatch(weakConfidenceBatch);
