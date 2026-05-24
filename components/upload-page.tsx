"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileSpreadsheet,
  Receipt,
  Building2,
  Play,
  Loader2,
  CheckCircle2,
  Bot,
  FileSearch,
  Calculator,
  Scale,
  AlertCircle,
} from "lucide-react";
import { FileUploadZone } from "./file-upload-zone";
import { demoTimelineEvents } from "@/lib/demo-data";
import { TimelineEvent } from "@/lib/types";

export function UploadPage() {
  const router = useRouter();
  const [invoice, setInvoice] = useState<File[]>([]);
  const [paymentProofs, setPaymentProofs] = useState<File[]>([]);
  const [bankStatements, setBankStatements] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canRunReconciliation =
    invoice.length > 0 && paymentProofs.length > 0 && bankStatements.length > 0;

  const runReconciliation = async () => {
    setIsProcessing(true);
    setError(null);
    setTimelineEvents([]);
    setCurrentStep(0);

    // Play the agent timeline animation while the API runs in parallel
    const timelinePromise = (async () => {
      for (let i = 0; i < demoTimelineEvents.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 300));
        setTimelineEvents((prev) => [...prev, demoTimelineEvents[i]!]);
        setCurrentStep(i + 1);
      }
    })();

    // Call the real extraction API
    const formData = new FormData();
    formData.append("invoice", invoice[0]!);
    formData.append("bankStatement", bankStatements[0]!);
    formData.append("paymentProof", paymentProofs[0]!);

    const apiPromise = fetch("/api/reconciliation/extractions", {
      method: "POST",
      body: formData,
    });

    const [, response] = await Promise.all([timelinePromise, apiPromise]);
    const body = await response.json();

    if (!response.ok) {
      setIsProcessing(false);
      setError((body as { error?: string }).error ?? "Extraction failed.");
      return;
    }

    sessionStorage.setItem("extractionResult", JSON.stringify(body));

    await new Promise((resolve) => setTimeout(resolve, 800));
    router.push("/results");
  };

  const getActorIcon = (agent: TimelineEvent["agent"]) => {
    switch (agent) {
      case "Extraction Agent":
        return <FileSearch className="h-4 w-4" />;
      case "Code Tools":
        return <Calculator className="h-4 w-4" />;
    }
  };

  const getActorColor = (agent: TimelineEvent["agent"]) => {
    switch (agent) {
      case "Extraction Agent":
        return "text-blue-400 bg-blue-400/10";
      case "Code Tools":
        return "text-emerald-400 bg-emerald-400/10";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">ReconPilot</h1>
              <p className="text-xs text-muted-foreground">FX Reconciliation Agent</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className={`grid gap-8 ${isProcessing ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
          {/* Upload Section */}
          <div className={isProcessing ? "" : "max-w-5xl mx-auto w-full"}>
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-foreground">Upload Files</h2>
              <p className="mt-1 text-muted-foreground">
                Upload your expected payments, payment proofs, and bank statements to begin reconciliation.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FileUploadZone
                title="Expected Payments"
                description="Invoice — PDF, image, XLSX, CSV, or TXT"
                acceptedTypes=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.csv,.xlsx"
                icon={<FileSpreadsheet className="h-4 w-4 text-blue-400" />}
                files={invoice}
                onFilesChange={setInvoice}
              />

              <FileUploadZone
                title="Payment Proofs"
                description="Payment receipt — PDF, image, XLSX, CSV, or TXT"
                acceptedTypes=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.csv,.xlsx"
                icon={<Receipt className="h-4 w-4 text-emerald-400" />}
                files={paymentProofs}
                onFilesChange={setPaymentProofs}
              />

              <FileUploadZone
                title="Bank Statements"
                description="Bank statement — PDF, image, XLSX, CSV, or TXT"
                acceptedTypes=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.csv,.xlsx"
                icon={<Building2 className="h-4 w-4 text-amber-400" />}
                files={bankStatements}
                onFilesChange={setBankStatements}
              />
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="mt-6 flex justify-center">
              <Button
                size="lg"
                disabled={!canRunReconciliation || isProcessing}
                onClick={runReconciliation}
                className="gap-2 px-8"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Reconciliation
                  </>
                )}
              </Button>
            </div>

            {!canRunReconciliation && !isProcessing && (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                Please upload at least one file in each category to proceed.
              </p>
            )}
          </div>

          {/* Agent Timeline (shows when processing) */}
          {isProcessing && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <Bot className="h-4 w-4 text-primary" />
                  Agent Activity
                  <span className="ml-auto text-sm font-normal text-muted-foreground">
                    Step {currentStep} of {demoTimelineEvents.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-3">
                    {timelineEvents.map((event, index) => (
                      <div
                        key={index}
                        className="animate-in fade-in slide-in-from-top-2 duration-300"
                      >
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-full ${getActorColor(event.agent)}`}
                            >
                              {getActorIcon(event.agent)}
                            </div>
                            {index < timelineEvents.length - 1 && (
                              <div className="mt-2 h-full w-px bg-border" />
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {event.agent}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {event.action}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {event.reasoning}
                            </p>
                            {event.resultSummary && (
                              <div className="mt-2 flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                <span className="text-xs text-foreground">
                                  {event.resultSummary}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {currentStep === demoTimelineEvents.length && (
                      <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                        <p className="mt-2 font-medium text-emerald-400">
                          Extraction Complete
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Redirecting to results...
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
