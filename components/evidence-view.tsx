"use client";

import { ReconciliationCase } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { 
  FileText, 
  Building2, 
  Calendar, 
  DollarSign, 
  Hash,
  AlertCircle,
  CheckCircle2,
  ImageIcon,
  FileType
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EvidenceViewProps {
  reconciliationCase: ReconciliationCase;
}

function ConfidenceBar({ value, label }: { value: number; label: string }) {
  const percentage = Math.round(value * 100);
  const isLow = percentage < 80;
  const isMedium = percentage >= 80 && percentage < 85;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            isLow ? "bg-status-unmatched" : isMedium ? "bg-status-needs-review" : "bg-status-auto-matched"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={cn(
        "font-mono w-10 text-right",
        isLow ? "text-status-unmatched" : isMedium ? "text-status-needs-review" : "text-muted-foreground"
      )}>
        {percentage}%
      </span>
    </div>
  );
}

export function EvidenceView({ reconciliationCase }: EvidenceViewProps) {
  const { expected_payment: ep, payment_proof: pp, bank_transaction: bt } = reconciliationCase;

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-MY", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getExtractionIcon = (method: string) => {
    if (method === "parse_image_ocr") return ImageIcon;
    return FileType;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Expected Payment Column */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-chart-2/10">
              <FileText className="h-4 w-4 text-chart-2" />
            </div>
            <CardTitle className="text-sm font-medium">Expected Payment</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Reference</p>
                <p className="font-mono text-sm text-foreground">{ep.invoiceNumber}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="text-sm text-foreground">{ep.debtor.name ?? ep.debtor.normalizedName ?? "Unknown"}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatCurrency(parseFloat(ep.amountDue.value), ep.invoiceCurrency)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Expected Date</p>
                <p className="text-sm text-foreground">{formatDate(ep.issueDate)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Due Date</p>
                <p className="text-sm text-foreground">{ep.dueDate ? formatDate(ep.dueDate) : "—"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Proof Column */}
      <Card className={cn(
        "bg-card border-border",
        !pp && "opacity-60"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              {pp ? (
                <div className="h-4 w-4 text-primary">
                  {(() => {
                    const Icon = getExtractionIcon(pp.aiMetadata.extractionRoute);
                    return <Icon className="h-4 w-4" />;
                  })()}
                </div>
              ) : (
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <CardTitle className="text-sm font-medium">Payment Proof</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pp ? (
            <>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Reference</p>
                    <p className="font-mono text-sm text-foreground">{pp.financialPayload.reference.raw ?? "—"}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Payer</p>
                    <p className="text-sm text-foreground">{pp.financialPayload.debtor.name ?? pp.financialPayload.debtor.normalizedName ?? "Unknown"}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Paid Amount</p>
                    <p className="text-lg font-semibold text-foreground">
                      {formatCurrency(
                        parseFloat(pp.financialPayload.paidAmount?.value ?? "0"),
                        pp.financialPayload.paidAmount?.currency ?? "MYR"
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Payment Date</p>
                    <p className="text-sm text-foreground">
                      {pp.financialPayload.paymentDate ? formatDate(pp.financialPayload.paymentDate) : "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <FileType className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Extraction Method</p>
                    <p className="text-sm text-foreground font-mono">
                      {pp.aiMetadata.extractionRoute.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground mb-2">Extraction Confidence</p>
                <div className="space-y-2">
                  <ConfidenceBar value={pp.aiMetadata.fieldConfidence["paidAmount"] ?? 0} label="Amount" />
                  <ConfidenceBar value={pp.aiMetadata.fieldConfidence["reference"] ?? 0} label="Reference" />
                  <ConfidenceBar value={pp.aiMetadata.fieldConfidence["debtorName"] ?? 0} label="Payer" />
                  <ConfidenceBar value={pp.aiMetadata.fieldConfidence["paymentDate"] ?? 0} label="Date" />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No payment proof uploaded</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bank Deposit Column */}
      <Card className={cn(
        "bg-card border-border",
        !bt && "opacity-60"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-chart-3/10">
              {bt ? (
                <CheckCircle2 className="h-4 w-4 text-chart-3" />
              ) : (
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <CardTitle className="text-sm font-medium">Bank Deposit</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {bt ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Transaction ID</p>
                  <p className="font-mono text-sm text-foreground">{bt.internalTxId}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Reference</p>
                  <p className="font-mono text-sm text-foreground">
                    {bt.normalizedReference ?? bt.remittanceInformation.raw ?? <span className="text-muted-foreground italic">None</span>}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="text-sm text-foreground">{bt.description ?? bt.rawDescription ?? "—"}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Credit Amount</p>
                  <p className="text-lg font-semibold text-primary">
                    {formatCurrency(parseFloat(bt.amount.value), bt.amount.currency)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Bank Date</p>
                  <p className="text-sm text-foreground">{formatDate(bt.bookingDate)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No matching bank deposit found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
