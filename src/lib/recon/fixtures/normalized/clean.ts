import { normalizeInputBatch } from "../../normalize-input-batch";
import { cleanBatch } from "../batches/clean-batch";

// Pre-computed handoff fixture for Agent 2.
// Two invoices (INV-1001, INV-1002) with matching proofs — zero warnings expected.
// normalizedAt reflects the time this module was first evaluated; Agent 2 tests
// should match it with /^\d{4}-\d{2}-\d{2}T/ rather than an exact value.
export const cleanNormalizedBatch = normalizeInputBatch(cleanBatch);
