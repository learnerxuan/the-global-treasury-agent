"use client";

import { FXScenario, ReconciliationCase } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Calendar, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FXReasoningPanelProps {
  reconciliationCase: ReconciliationCase;
}

export function FXReasoningPanel({ reconciliationCase }: FXReasoningPanelProps) {
  const { fx_scenarios, best_fx_scenario, expected_payment, bank_transaction, fee_hypothesis } = reconciliationCase;

  if (!fx_scenarios.length || !bank_transaction) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-medium">FX Reasoning</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No FX analysis available for this case.
          </p>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number, currency: string = "MYR") => {
    return new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-sm font-medium">FX Reasoning</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="p-3 rounded-lg bg-secondary/50 border border-border">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm text-foreground">
                <span className="font-medium">{expected_payment.invoiceCurrency} {parseFloat(expected_payment.amountDue.value).toFixed(2)}</span>
                <span className="text-muted-foreground"> → </span>
                <span className="font-medium text-primary">{formatCurrency(parseFloat(bank_transaction.amount.value))}</span>
              </p>
              {best_fx_scenario && (
                <p className="text-xs text-muted-foreground mt-1">
                  Best reference: {best_fx_scenario.scenario_name} rate ({best_fx_scenario.fx_rate.toFixed(4)})
                </p>
              )}
            </div>
          </div>
        </div>

        {/* FX Scenarios Table */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Date Scenarios
          </h4>
          <div className="space-y-2">
            {fx_scenarios.map((scenario, index) => (
              <div
                key={index}
                className={cn(
                  "p-3 rounded-lg border transition-all",
                  scenario.is_best_match
                    ? "bg-primary/5 border-primary/30"
                    : "bg-secondary/30 border-border"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {scenario.scenario_name}
                    </span>
                    {scenario.is_best_match && (
                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Best Match
                      </Badge>
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {scenario.fx_date}
                  </span>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">FX Rate</p>
                    <p className="font-mono text-foreground">{scenario.fx_rate.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Expected MYR</p>
                    <p className="font-mono text-foreground">{formatCurrency(scenario.expected_local_amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Variance</p>
                    <p className={cn(
                      "font-mono",
                      scenario.variance_percentage <= 0.5 ? "text-status-auto-matched" :
                      scenario.variance_percentage <= 2 ? "text-status-likely-matched" :
                      "text-status-needs-review"
                    )}>
                      {scenario.variance >= 0 ? "+" : ""}{formatCurrency(scenario.variance)} ({scenario.variance_percentage.toFixed(2)}%)
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fee Hypothesis */}
        {fee_hypothesis && (
          <div className="p-3 rounded-lg bg-status-needs-review/10 border border-status-needs-review/30">
            <div className="flex items-start gap-2">
              <div className="p-1 rounded bg-status-needs-review/20 mt-0.5">
                <TrendingUp className="h-3 w-3 text-status-needs-review" />
              </div>
              <div>
                <p className="text-sm font-medium text-status-needs-review">Fee Hypothesis</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Possible fee/spread: <span className="font-mono text-foreground">{formatCurrency(fee_hypothesis.possible_fee)}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {fee_hypothesis.explanation}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Note */}
        <p className="text-xs text-muted-foreground italic">
          FX rates are reference estimates. Banks may use different settlement rates, spreads, or posting delays.
        </p>
      </CardContent>
    </Card>
  );
}
