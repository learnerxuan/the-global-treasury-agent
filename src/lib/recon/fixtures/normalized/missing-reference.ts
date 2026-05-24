import { normalizeInputBatch } from "../../normalize-input-batch";
import { missingReferenceBatch } from "../batches/missing-reference-batch";

// Pre-computed handoff fixture for Agent 2.
// SWIFT confirmation with no invoice number on the remittance — reference.raw is null.
// Expect: MISSING_PAYMENT_REFERENCE in warnings; reference.normalized is also null.
// Agent 2 must fall back to matching by debtor name (DELTA) + paidAmount (500.00 USD).
export const missingReferenceNormalizedBatch = normalizeInputBatch(missingReferenceBatch);
