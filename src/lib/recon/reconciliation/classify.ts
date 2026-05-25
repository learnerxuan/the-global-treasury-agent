import type { ReconciliationPolicy } from "./policy";
import type {
  ClassificationResult,
  CompetitionResult,
  HardReviewFlag,
  ReasonCode,
  ReconciliationStatus,
  ScoredCandidate,
  ToolResult
} from "./types";

const TOOL_NAME = "classifyMatch";

// Ordering used to take the *lower* of the score-based tier and any hard cap.
const RANK: Record<ReconciliationStatus, number> = {
  UNMATCHED: 0,
  NEEDS_REVIEW: 1,
  LIKELY_MATCHED: 2,
  AUTO_MATCHED: 3
};
const BY_RANK: ReconciliationStatus[] = ["UNMATCHED", "NEEDS_REVIEW", "LIKELY_MATCHED", "AUTO_MATCHED"];

function scoreTier(score: number, policy: ReconciliationPolicy): ReconciliationStatus {
  if (score >= policy.classification.autoMatched) return "AUTO_MATCHED";
  if (score >= policy.classification.likelyMatched) return "LIKELY_MATCHED";
  if (score >= policy.classification.needsReview) return "NEEDS_REVIEW";
  return "UNMATCHED";
}

export function classifyMatch(input: {
  scoredCandidates: ScoredCandidate[];
  competition: CompetitionResult;
  policy: ReconciliationPolicy;
}): ToolResult<ClassificationResult> {
  const { scoredCandidates, competition, policy } = input;

  if (scoredCandidates.length === 0) {
    return {
      ok: true,
      toolName: TOOL_NAME,
      data: { status: "UNMATCHED", selectedCandidate: null, reasonCodes: ["NO_CANDIDATE"], hardReviewFlags: [] },
      summary: "No surviving candidate; classified UNMATCHED."
    };
  }

  const selected = [...scoredCandidates].sort((a, b) => b.score - a.score)[0]!;

  const reasonCodes: ReasonCode[] = [...selected.reasonCodes];
  const hardReviewFlags: HardReviewFlag[] = [...selected.hardReviewFlags];

  if (competition.hasCompetition) {
    if (!reasonCodes.includes("COMPETING_CANDIDATES")) reasonCodes.push("COMPETING_CANDIDATES");
    if (!hardReviewFlags.includes("COMPETING_CANDIDATES_CLOSE")) hardReviewFlags.push("COMPETING_CANDIDATES_CLOSE");
  }

  // Score sets the ceiling; hard flags / competition can only pull it down to
  // NEEDS_REVIEW. A high score never overrides a hard review flag.
  let status = scoreTier(selected.score, policy);
  const hasHardConcern = hardReviewFlags.length > 0 || competition.hasCompetition;
  if (hasHardConcern) {
    if (status === "UNMATCHED" && selected.score >= 45) {
      status = "NEEDS_REVIEW";
    } else {
      status = BY_RANK[Math.min(RANK[status], RANK.NEEDS_REVIEW)]!;
    }
  }

  return {
    ok: true,
    toolName: TOOL_NAME,
    data: { status, selectedCandidate: selected, reasonCodes, hardReviewFlags },
    summary: `Classified ${selected.candidate.candidateId} as ${status} (score ${selected.score}).`
  };
}
