import { normalizeInputBatch } from "../../normalize-input-batch";
import { ambiguousReferenceBatch } from "../batches/ambiguous-reference-batch";

// Pre-computed handoff fixture for Agent 2.
// Proof quotes "INV-2001" (normalizes to INV2001) but two open invoices exist:
// INV-2001A (INV2001A) and INV-2001B (INV2001B) — neither is an exact match.
// Expect: zero normalization warnings (the proof itself is clean); the ambiguity
// is structural and Agent 2 must detect it during matching, not normalization.
export const ambiguousReferenceNormalizedBatch = normalizeInputBatch(ambiguousReferenceBatch);
