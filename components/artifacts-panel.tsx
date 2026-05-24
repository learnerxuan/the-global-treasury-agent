"use client";

import { ReconciliationCase } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileText, 
  Mail, 
  Copy, 
  CheckCircle2, 
  AlertTriangle,
  Download
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ArtifactsPanelProps {
  reconciliationCase: ReconciliationCase;
}

export function ArtifactsPanel({ reconciliationCase }: ArtifactsPanelProps) {
  const [copiedReport, setCopiedReport] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const { expected_payment: ep, bank_transaction: bt, status, fee_hypothesis, best_fx_scenario } = reconciliationCase;

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const generateReport = () => {
    const lines = [
      "═══════════════════════════════════════════════════════════",
      "                    RECONCILIATION REPORT",
      "═══════════════════════════════════════════════════════════",
      "",
      `Case ID:         ${reconciliationCase.id}`,
      `Status:          ${status.replace(/_/g, " ")}`,
      `Generated:       ${new Date().toLocaleString()}`,
      "",
      "───────────────────────────────────────────────────────────",
      "                     EXPECTED PAYMENT",
      "───────────────────────────────────────────────────────────",
      `Reference:       ${ep.invoiceNumber}`,
      `Customer:        ${ep.debtor.name ?? ep.debtor.normalizedName ?? "Unknown"}`,
      `Amount:          ${formatCurrency(parseFloat(ep.amountDue.value), ep.invoiceCurrency)}`,
      `Expected Date:   ${ep.issueDate}`,
      "",
    ];

    if (bt) {
      lines.push(
        "───────────────────────────────────────────────────────────",
        "                      BANK DEPOSIT",
        "───────────────────────────────────────────────────────────",
        `Transaction ID:  ${bt.internalTxId}`,
        `Description:     ${bt.description ?? bt.rawDescription ?? ""}`,
        `Credit Amount:   ${formatCurrency(parseFloat(bt.amount.value), bt.amount.currency)}`,
        `Bank Date:       ${bt.bookingDate}`,
        ""
      );
    }

    if (best_fx_scenario) {
      lines.push(
        "───────────────────────────────────────────────────────────",
        "                       FX ANALYSIS",
        "───────────────────────────────────────────────────────────",
        `Best Scenario:   ${best_fx_scenario.scenario_name}`,
        `FX Rate:         ${best_fx_scenario.fx_rate.toFixed(4)}`,
        `Expected MYR:    ${formatCurrency(best_fx_scenario.expected_local_amount, "MYR")}`,
        `Variance:        ${formatCurrency(best_fx_scenario.variance, "MYR")} (${best_fx_scenario.variance_percentage.toFixed(2)}%)`,
        ""
      );
    }

    lines.push(
      "───────────────────────────────────────────────────────────",
      "                     MATCH ANALYSIS",
      "───────────────────────────────────────────────────────────",
      `Total Score:     ${reconciliationCase.score.total}/100`,
      `Reference:       ${reconciliationCase.score.reference_match}/35`,
      `Amount/FX:       ${reconciliationCase.score.amount_fx_match}/30`,
      `Date Proximity:  ${reconciliationCase.score.date_proximity}/15`,
      `Name Similarity: ${reconciliationCase.score.name_similarity}/15`,
      `Extraction:      ${reconciliationCase.score.extraction_confidence}/5`,
      "",
      "───────────────────────────────────────────────────────────",
      "                        DECISION",
      "───────────────────────────────────────────────────────────",
      reconciliationCase.reason,
      "",
      "═══════════════════════════════════════════════════════════",
      "                    END OF REPORT",
      "═══════════════════════════════════════════════════════════"
    );

    return lines.join("\n");
  };

  const generateEmailDraft = () => {
    if (status === "AUTO_MATCHED") {
      return `To: finance@company.com
Subject: Payment Confirmed - ${ep.invoiceNumber}

Dear Finance Team,

This is to confirm that payment for ${ep.invoiceNumber} has been automatically reconciled.

Customer: ${ep.debtor.name ?? ep.debtor.normalizedName ?? "Unknown"}
Expected Amount: ${formatCurrency(parseFloat(ep.amountDue.value), ep.invoiceCurrency)}
${bt ? `Received Amount: ${formatCurrency(parseFloat(bt.amount.value), bt.amount.currency)}` : ""}
${bt ? `Bank Date: ${bt.bookingDate}` : ""}

Status: AUTO MATCHED
Match Score: ${reconciliationCase.score.total}/100

No action required.

Best regards,
ReconPilot`;
    }

    if (status === "UNMATCHED" || !bt) {
      return `To: finance@company.com
Subject: Discrepancy Found - ${ep.invoiceNumber}

Dear Finance Team,

ReconPilot could not reconcile the following payment:

Customer: ${ep.debtor.name ?? ep.debtor.normalizedName ?? "Unknown"}
Expected Amount: ${formatCurrency(parseFloat(ep.amountDue.value), ep.invoiceCurrency)}
Expected Date: ${ep.issueDate}

Issue: No matching bank deposit found within the expected time window.

Recommended Actions:
1. Verify with customer if payment was initiated
2. Check bank statement for delayed posting
3. Request payment proof from customer

Please investigate and update the records accordingly.

Best regards,
ReconPilot`;
    }

    if (status === "NEEDS_REVIEW" && fee_hypothesis) {
      return `To: finance@company.com
Subject: Review Required - ${ep.invoiceNumber}

Dear Finance Team,

ReconPilot has flagged the following payment for manual review:

Customer: ${ep.debtor.name ?? ep.debtor.normalizedName ?? "Unknown"}
Expected Amount: ${formatCurrency(parseFloat(ep.amountDue.value), ep.invoiceCurrency)}
${bt ? `Received Amount: ${formatCurrency(parseFloat(bt.amount.value), bt.amount.currency)}` : ""}
${bt ? `Bank Date: ${bt.bookingDate}` : ""}

Discrepancy Details:
Expected: ${best_fx_scenario ? formatCurrency(best_fx_scenario.expected_local_amount, "MYR") : "N/A"}
Received: ${bt ? formatCurrency(parseFloat(bt.amount.value), bt.amount.currency) : "N/A"}
Variance: ${fee_hypothesis ? formatCurrency(fee_hypothesis.possible_fee, "MYR") : "N/A"}

Possible Explanations:
- Bank/intermediary fee
- FX spread
- Partial payment
- Short payment

Recommended Action:
Request confirmation or fee breakdown from the customer before closing this invoice.

Best regards,
ReconPilot`;
    }

    return `To: finance@company.com
Subject: Review Required - ${ep.invoiceNumber}

Dear Finance Team,

ReconPilot requires your review for the following payment:

Customer: ${ep.debtor.name ?? ep.debtor.normalizedName ?? "Unknown"}
Expected Amount: ${formatCurrency(parseFloat(ep.amountDue.value), ep.invoiceCurrency)}
${bt ? `Received Amount: ${formatCurrency(parseFloat(bt.amount.value), bt.amount.currency)}` : ""}

Status: ${status.replace(/_/g, " ")}
Match Score: ${reconciliationCase.score.total}/100

Reason: ${reconciliationCase.reason}

Please review and take appropriate action.

Best regards,
ReconPilot`;
  };

  const copyToClipboard = async (text: string, type: "report" | "email") => {
    await navigator.clipboard.writeText(text);
    if (type === "report") {
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } else {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  const report = generateReport();
  const emailDraft = generateEmailDraft();

  const showReport = status === "AUTO_MATCHED" || status === "LIKELY_MATCHED";
  const showEmail = status === "NEEDS_REVIEW" || status === "UNMATCHED" || status === "LIKELY_MATCHED";

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-chart-3/10">
            <FileText className="h-4 w-4 text-chart-3" />
          </div>
          <CardTitle className="text-sm font-medium">Generated Artifacts</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={showReport ? "report" : "email"} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="report" disabled={!showReport} className="gap-2">
              <FileText className="h-4 w-4" />
              Report
            </TabsTrigger>
            <TabsTrigger value="email" disabled={!showEmail} className="gap-2">
              <Mail className="h-4 w-4" />
              Email Draft
            </TabsTrigger>
          </TabsList>

          <TabsContent value="report">
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-status-auto-matched/10 border border-status-auto-matched/30">
                <CheckCircle2 className="h-4 w-4 text-status-auto-matched" />
                <span className="text-sm text-status-auto-matched">
                  Reconciliation report ready for audit
                </span>
              </div>
              <div className="bg-secondary/30 rounded-lg p-4 border border-border max-h-80 overflow-y-auto">
                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                  {report}
                </pre>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(report, "report")}
                  className="gap-2"
                >
                  {copiedReport ? (
                    <CheckCircle2 className="h-4 w-4 text-status-auto-matched" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copiedReport ? "Copied!" : "Copy Report"}
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="email">
            <div className="space-y-3">
              <div className={cn(
                "flex items-center gap-2 p-2 rounded-lg border",
                status === "UNMATCHED" || status === "NEEDS_REVIEW"
                  ? "bg-status-needs-review/10 border-status-needs-review/30"
                  : "bg-status-likely-matched/10 border-status-likely-matched/30"
              )}>
                <AlertTriangle className={cn(
                  "h-4 w-4",
                  status === "UNMATCHED" || status === "NEEDS_REVIEW"
                    ? "text-status-needs-review"
                    : "text-status-likely-matched"
                )} />
                <span className={cn(
                  "text-sm",
                  status === "UNMATCHED" || status === "NEEDS_REVIEW"
                    ? "text-status-needs-review"
                    : "text-status-likely-matched"
                )}>
                  Email draft for follow-up
                </span>
              </div>
              <div className="bg-secondary/30 rounded-lg p-4 border border-border max-h-80 overflow-y-auto">
                <pre className="text-sm font-mono text-foreground whitespace-pre-wrap">
                  {emailDraft}
                </pre>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(emailDraft, "email")}
                  className="gap-2"
                >
                  {copiedEmail ? (
                    <CheckCircle2 className="h-4 w-4 text-status-auto-matched" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copiedEmail ? "Copied!" : "Copy Email"}
                </Button>
                <Button variant="secondary" size="sm" className="gap-2">
                  Mark as Sent
                </Button>
                <Button variant="ghost" size="sm">
                  Discard
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
