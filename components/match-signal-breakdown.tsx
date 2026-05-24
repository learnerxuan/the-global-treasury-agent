"use client";

import { MatchScore, ReconciliationCase } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Hash, DollarSign, Calendar, Building2, Shield, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface MatchSignalBreakdownProps {
  reconciliationCase: ReconciliationCase;
}

const signalConfig = [
  {
    key: "reference_match" as keyof MatchScore,
    label: "Reference Match",
    max: 35,
    icon: Hash,
    description: "Invoice/payment reference alignment",
  },
  {
    key: "amount_fx_match" as keyof MatchScore,
    label: "Amount/FX Match",
    max: 30,
    icon: DollarSign,
    description: "Amount variance with FX consideration",
  },
  {
    key: "date_proximity" as keyof MatchScore,
    label: "Date Proximity",
    max: 15,
    icon: Calendar,
    description: "Time between payment and bank posting",
  },
  {
    key: "name_similarity" as keyof MatchScore,
    label: "Name Similarity",
    max: 15,
    icon: Building2,
    description: "Payer/customer name matching",
  },
  {
    key: "extraction_confidence" as keyof MatchScore,
    label: "Extraction Confidence",
    max: 5,
    icon: Shield,
    description: "OCR/parsing reliability",
  },
];

export function MatchSignalBreakdown({ reconciliationCase }: MatchSignalBreakdownProps) {
  const { score, status } = reconciliationCase;

  const getScoreColor = (total: number) => {
    if (total >= 95) return "text-status-auto-matched";
    if (total >= 80) return "text-status-likely-matched";
    if (total >= 60) return "text-status-needs-review";
    return "text-status-unmatched";
  };

  const getProgressColor = (value: number, max: number) => {
    const percentage = (value / max) * 100;
    if (percentage >= 90) return "bg-status-auto-matched";
    if (percentage >= 70) return "bg-status-likely-matched";
    if (percentage >= 50) return "bg-status-needs-review";
    return "bg-status-unmatched";
  };

  const getStatusThreshold = () => {
    switch (status) {
      case "AUTO_MATCHED":
        return { min: 95, label: "95-100" };
      case "LIKELY_MATCHED":
        return { min: 80, label: "80-94" };
      case "NEEDS_REVIEW":
        return { min: 60, label: "60-79" };
      default:
        return { min: 0, label: "<60" };
    }
  };

  const threshold = getStatusThreshold();

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">Match Signals</CardTitle>
          </div>
          <div className="text-right">
            <p className={cn("text-2xl font-bold", getScoreColor(score.total))}>
              {score.total}
              <span className="text-sm text-muted-foreground font-normal">/100</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Threshold: {threshold.label}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {signalConfig.map((signal) => {
          const value = score[signal.key];
          const percentage = (value / signal.max) * 100;
          const Icon = signal.icon;

          return (
            <div key={signal.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{signal.label}</span>
                </div>
                <span className="text-sm font-mono text-foreground">
                  {value}/{signal.max}
                </span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", getProgressColor(value, signal.max))}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{signal.description}</p>
            </div>
          );
        })}

        {/* Classification Rules */}
        <div className="pt-4 border-t border-border">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Classification Rules
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-status-auto-matched" />
              <span className="text-muted-foreground">Auto Match: 95-100</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-status-likely-matched" />
              <span className="text-muted-foreground">Likely: 80-94</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-status-needs-review" />
              <span className="text-muted-foreground">Review: 60-79</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-status-unmatched" />
              <span className="text-muted-foreground">Unmatched: {"<"}60</span>
            </div>
          </div>
        </div>

        {/* Reason */}
        <div className="pt-4 border-t border-border">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Decision Reason
          </h4>
          <p className="text-sm text-foreground leading-relaxed">
            {reconciliationCase.reason}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
