import { describe, expect, it } from "vitest";
import { RECONCILIATION_ACTIONS, actionCode } from "./ReconciliationDetailModal";

describe("ReconciliationDetailModal actions", () => {
  it("keeps review statuses to approve or reject only", () => {
    expect(RECONCILIATION_ACTIONS.LIKELY_MATCHED).toEqual(["Approve", "Reject"]);
    expect(RECONCILIATION_ACTIONS.NEEDS_REVIEW).toEqual(["Approve", "Reject"]);
  });

  it("maps streamlined action labels to backend action codes", () => {
    expect(actionCode("Approve")).toBe("APPROVE_MATCH");
    expect(actionCode("Reject")).toBe("REJECT_MATCH");
    expect(actionCode("Upload Missing Evidence")).toBe("UPLOAD_MISSING_EVIDENCE");
  });
});
