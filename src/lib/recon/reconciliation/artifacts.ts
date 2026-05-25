import type {
  ArtifactRequest,
  ArtifactType,
  EvidenceRef,
  HumanReviewOption,
  HumanReviewRequest,
  ReasonCode,
  ReconciliationStatus,
  ReviewSeverity,
  HardReviewFlag,
  ToolResult
} from "./types";

const ARTIFACT_TOOL = "createArtifactRequest";
const REVIEW_TOOL = "createHumanReviewRequest";

// Primary artifact per classification. UNMATCHED also gets a mock email draft,
// which the orchestrator requests as a second artifact.
export function primaryArtifactType(status: ReconciliationStatus): ArtifactType {
  switch (status) {
    case "AUTO_MATCHED":
      return "RECONCILIATION_REPORT";
    case "LIKELY_MATCHED":
      return "RECONCILIATION_REPORT_DRAFT";
    case "NEEDS_REVIEW":
      return "DISCREPANCY_SUMMARY";
    case "UNMATCHED":
      return "DISCREPANCY_SUMMARY";
  }
}

export function createArtifactRequest(input: {
  caseId: string;
  status: ReconciliationStatus;
  type: ArtifactType;
  evidenceRefs: EvidenceRef[];
  summary: string;
}): ToolResult<ArtifactRequest> {
  const artifact: ArtifactRequest = {
    artifactId: `${input.caseId}-${input.type}`,
    caseId: input.caseId,
    type: input.type,
    status: input.status,
    evidenceRefs: input.evidenceRefs,
    summary: input.summary
  };
  return {
    ok: true,
    toolName: ARTIFACT_TOOL,
    data: artifact,
    summary: `Requested ${input.type} for ${input.caseId}.`
  };
}

export function createHumanReviewRequest(input: {
  caseId: string;
  severity: ReviewSeverity;
  blocking: boolean;
  question: string;
  options?: HumanReviewOption[];
  evidenceRefs: EvidenceRef[];
  reasonCodes: ReasonCode[];
  hardReviewFlags?: HardReviewFlag[];
  suggestedActions?: string[];
}): ToolResult<HumanReviewRequest> {
  const review: HumanReviewRequest = {
    reviewId: `${input.caseId}-REVIEW`,
    caseId: input.caseId,
    severity: input.severity,
    blocking: input.blocking,
    question: input.question,
    ...(input.options ? { options: input.options } : {}),
    evidenceRefs: input.evidenceRefs,
    reasonCodes: input.reasonCodes,
    ...(input.hardReviewFlags ? { hardReviewFlags: input.hardReviewFlags } : {}),
    ...(input.suggestedActions ? { suggestedActions: input.suggestedActions } : {})
  };
  return {
    ok: true,
    toolName: REVIEW_TOOL,
    data: review,
    summary: `Requested ${input.severity} human review for ${input.caseId}.`
  };
}
