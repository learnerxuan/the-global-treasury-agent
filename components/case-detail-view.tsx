"use client";

import { ReconciliationCase } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { EvidenceView } from "@/components/evidence-view";
import { FXReasoningPanel } from "@/components/fx-reasoning-panel";
import { MatchSignalBreakdown } from "@/components/match-signal-breakdown";
import { ArtifactsPanel } from "@/components/artifacts-panel";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CaseDetailViewProps {
  reconciliationCase: ReconciliationCase;
}

export function CaseDetailView({ reconciliationCase }: CaseDetailViewProps) {
  const { expected_payment: ep, status, human_action_required } = reconciliationCase;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-semibold text-foreground">{ep.invoiceNumber}</h2>
            <StatusBadge status={status} size="lg" />
          </div>
          <p className="text-muted-foreground">{ep.debtor.name ?? ep.debtor.normalizedName ?? "Unknown"}</p>
        </div>

        {human_action_required && (
          <div className="flex flex-wrap gap-2">
            {status === "LIKELY_MATCHED" && (
              <>
                <Button variant="default" size="sm" className="gap-2">
                  <ThumbsUp className="h-4 w-4" />
                  Approve Match
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <ThumbsDown className="h-4 w-4" />
                  Reject
                </Button>
              </>
            )}
            {status === "NEEDS_REVIEW" && (
              <>
                <Button variant="default" size="sm" className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm Match
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Request Clarification
                </Button>
                <Button variant="ghost" size="sm" className="gap-2 text-destructive hover:text-destructive">
                  <XCircle className="h-4 w-4" />
                  Mark Unresolved
                </Button>
              </>
            )}
            {status === "UNMATCHED" && (
              <>
                <Button variant="outline" size="sm" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Send Follow-up
                </Button>
                <Button variant="ghost" size="sm" className="gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Escalate
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Human Action Required Alert */}
      {human_action_required && (
        <div className={cn(
          "p-4 rounded-lg border flex items-start gap-3",
          status === "LIKELY_MATCHED" 
            ? "bg-status-likely-matched/10 border-status-likely-matched/30"
            : status === "NEEDS_REVIEW"
            ? "bg-status-needs-review/10 border-status-needs-review/30"
            : "bg-status-unmatched/10 border-status-unmatched/30"
        )}>
          <AlertTriangle className={cn(
            "h-5 w-5 mt-0.5 shrink-0",
            status === "LIKELY_MATCHED" 
              ? "text-status-likely-matched"
              : status === "NEEDS_REVIEW"
              ? "text-status-needs-review"
              : "text-status-unmatched"
          )} />
          <div>
            <p className={cn(
              "font-medium",
              status === "LIKELY_MATCHED" 
                ? "text-status-likely-matched"
                : status === "NEEDS_REVIEW"
                ? "text-status-needs-review"
                : "text-status-unmatched"
            )}>
              {status === "LIKELY_MATCHED" && "Human Approval Recommended"}
              {status === "NEEDS_REVIEW" && "Human Review Required"}
              {status === "UNMATCHED" && "Follow-up Action Needed"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {reconciliationCase.reason}
            </p>
          </div>
        </div>
      )}

      {/* Evidence View */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Evidence Comparison
        </h3>
        <EvidenceView reconciliationCase={reconciliationCase} />
      </div>

      {/* Analysis Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FXReasoningPanel reconciliationCase={reconciliationCase} />
        <MatchSignalBreakdown reconciliationCase={reconciliationCase} />
      </div>

      {/* Artifacts */}
      <ArtifactsPanel reconciliationCase={reconciliationCase} />
    </div>
  );
}
