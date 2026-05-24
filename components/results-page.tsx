"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Download,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { CaseDetailView } from "@/components/case-detail-view";
import { demoReconciliationCases } from "@/lib/demo-data";
import { ReconciliationCase, ReconciliationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const statusOrder: ReconciliationStatus[] = [
  "NEEDS_REVIEW",
  "UNMATCHED",
  "LIKELY_MATCHED",
  "AUTO_MATCHED",
];

export function ResultsPage() {
  const router = useRouter();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(
    demoReconciliationCases[2].id // Start with NEEDS_REVIEW case
  );

  const cases = demoReconciliationCases;
  const selectedCase = cases.find((c) => c.id === selectedCaseId) || null;

  // Sort cases by status priority
  const sortedCases = [...cases].sort(
    (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
  );

  // Stats
  const stats = {
    total: cases.length,
    autoMatched: cases.filter((c) => c.status === "AUTO_MATCHED").length,
    likelyMatched: cases.filter((c) => c.status === "LIKELY_MATCHED").length,
    needsReview: cases.filter((c) => c.status === "NEEDS_REVIEW").length,
    unmatched: cases.filter((c) => c.status === "UNMATCHED").length,
  };

  const matchRate = Math.round(
    ((stats.autoMatched + stats.likelyMatched) / stats.total) * 100
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              New Reconciliation
            </Button>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  Reconciliation Results
                </h1>
                <p className="text-xs text-muted-foreground">
                  {stats.total} cases processed
                </p>
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Export Report
          </Button>
        </div>
      </header>

      {/* Summary Stats */}
      <div className="border-b border-border bg-card/30">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{matchRate}%</p>
              <p className="text-xs text-muted-foreground">Match Rate</p>
            </div>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-lg font-semibold text-status-auto-matched">
                {stats.autoMatched}
              </p>
              <p className="text-xs text-muted-foreground">Auto Matched</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-status-likely-matched">
                {stats.likelyMatched}
              </p>
              <p className="text-xs text-muted-foreground">Likely Matched</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-status-needs-review">
                {stats.needsReview}
              </p>
              <p className="text-xs text-muted-foreground">Needs Review</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-status-unmatched">
                {stats.unmatched}
              </p>
              <p className="text-xs text-muted-foreground">Unmatched</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Case List */}
          <Card className="h-fit bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">Cases</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-320px)]">
                <div className="space-y-1 p-2">
                  {sortedCases.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCaseId(c.id)}
                      className={cn(
                        "w-full rounded-lg p-3 text-left transition-colors",
                        selectedCaseId === c.id
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-secondary/50"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">
                          {c.expected_payment.invoiceNumber}
                        </span>
                        <StatusBadge status={c.status} size="sm" />
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {c.expected_payment.debtor.name ?? c.expected_payment.debtor.normalizedName ?? "Unknown"}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {c.expected_payment.invoiceCurrency}{" "}
                          {parseFloat(c.expected_payment.amountDue.value).toLocaleString()}
                        </span>
                        {c.human_action_required && (
                          <span className="flex items-center gap-1 text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            Action needed
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Case Detail */}
          <div>
            {selectedCase ? (
              <CaseDetailView reconciliationCase={selectedCase} />
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="flex h-[400px] items-center justify-center">
                  <div className="text-center">
                    <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-muted-foreground">
                      Select a case to view details
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
