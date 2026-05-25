import { describe, expect, it } from "vitest";
import { cleanNormalizedBatch } from "../../lib/recon/fixtures/normalized/clean";
import { runReconciliationOrchestrator } from "../../lib/recon/reconciliation/orchestrator";
import type { DocumentRole, StructuredDocumentExtraction } from "../../lib/recon/extraction/structured-extractor";
import { buildAgentActivity } from "./agent-activity";
import type { StoredDocument } from "./reconciliation-workflow";

function storedDoc(role: DocumentRole, fileName: string, mimeType: string): StoredDocument {
  return {
    documentId: `${role}_doc`,
    role,
    fileName,
    mimeType,
    sizeBytes: 1000,
    storageRef: { kind: "local_path", uri: `/tmp/${fileName}` },
    readableTextLength: 100,
    toolObservations: [],
    warnings: []
  };
}

function extraction(role: DocumentRole, selectedTool: StructuredDocumentExtraction["selectedTool"], counts: { invoices?: number; bank?: number; proofs?: number }): StructuredDocumentExtraction {
  return {
    role,
    selectedTool,
    confidence: 0.92,
    summary: `Extracted ${role}`,
    invoices: Array.from({ length: counts.invoices ?? 0 }, () => ({ invoiceNumber: "INV-1001", customerName: "Acme", issueDate: "2026-05-01", dueDate: null, amountDue: { value: "250.00", currency: "USD" }, paymentReference: "INV-1001" })),
    bankTransactions: Array.from({ length: counts.bank ?? 0 }, () => ({ transactionDate: "2026-05-20", valueDate: null, description: "INV-1001", reference: "INV-1001", amount: { value: "250.00", currency: "USD" }, payerName: "Acme" })),
    paymentProofs: Array.from({ length: counts.proofs ?? 0 }, () => ({ payerName: "Acme", creditorName: "ReconPilot", paymentDate: "2026-05-20", paidAmount: { value: "250.00", currency: "USD" }, reference: "INV-1001", paymentStatus: "ACSC", providerOrBankName: "Maybank", exchangeRate: null })),
    warnings: []
  };
}

describe("buildAgentActivity", () => {
  const reconciliation = runReconciliationOrchestrator(cleanNormalizedBatch);
  const documents = {
    invoice: [storedDoc("invoice", "invoices.csv", "text/csv")],
    bank_statement: [storedDoc("bank_statement", "bank.pdf", "application/pdf")],
    payment_proof: [storedDoc("payment_proof", "proof.png", "image/png")]
  };
  const extractions = {
    invoice: [extraction("invoice", "parse_csv_text", { invoices: 2 })],
    bank_statement: [extraction("bank_statement", "parse_pdf_text", { bank: 2 })],
    payment_proof: [extraction("payment_proof", "parse_image_ocr", { proofs: 1 })]
  };

  const activity = buildAgentActivity({ documents, extractions, normalizedInputBatch: cleanNormalizedBatch, reconciliation });

  it("covers all three stages in order", () => {
    const stages = activity.map((e) => e.stage);
    const firstCode = stages.indexOf("code_tools");
    const firstRecon = stages.indexOf("reconciliation");
    const lastExtraction = stages.lastIndexOf("extraction");
    expect(lastExtraction).toBeLessThan(firstCode);
    expect(firstCode).toBeLessThan(firstRecon);
  });

  it("emits an Extraction Agent inspect + tool call per document", () => {
    const extractionEvents = activity.filter((e) => e.stage === "extraction");
    expect(extractionEvents.some((e) => e.toolName === "inspect_file")).toBe(true);
    expect(extractionEvents.some((e) => e.toolName === "parse_image_ocr")).toBe(true);
    expect(extractionEvents.some((e) => e.toolName === "parse_pdf_text")).toBe(true);
    expect(extractionEvents.every((e) => e.actor === "Extraction Agent")).toBe(true);
  });

  it("includes a Code Tools normalization event", () => {
    expect(activity.some((e) => e.stage === "code_tools" && e.actor === "Code Tools")).toBe(true);
  });

  it("includes Agent 2 reconciliation tool calls", () => {
    const recon = activity.filter((e) => e.stage === "reconciliation");
    expect(recon.length).toBeGreaterThan(0);
    expect(recon.some((e) => e.toolName === "generateBankAnchoredCandidates")).toBe(true);
  });

  it("numbers events sequentially from 1", () => {
    expect(activity[0]?.seq).toBe(1);
    for (let i = 1; i < activity.length; i += 1) {
      expect(activity[i]!.seq).toBe(activity[i - 1]!.seq + 1);
    }
  });

  it("still produces extraction + code tools events when reconciliation is null", () => {
    const partial = buildAgentActivity({ documents, extractions, normalizedInputBatch: cleanNormalizedBatch, reconciliation: null });
    expect(partial.some((e) => e.stage === "extraction")).toBe(true);
    expect(partial.some((e) => e.stage === "reconciliation")).toBe(false);
  });
});
