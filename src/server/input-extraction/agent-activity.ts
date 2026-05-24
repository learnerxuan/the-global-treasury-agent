import type { DocumentRole, ExtractionToolName, StructuredDocumentExtraction } from "../../lib/recon/extraction/structured-extractor";
import type { OrchestratorOutput } from "../../lib/recon/reconciliation/types";
import type { NormalizedInputBatch } from "../../lib/recon/types";
import type { StoredDocument } from "./reconciliation-workflow";

// A single, ordered process feed spanning all three stages of the pipeline:
// Agent 1 (extraction routing) -> Code Tools (parse + normalize) -> Agent 2
// (reconciliation tool calls). This is the demo-critical "what the agents did".
export type AgentActivityStage = "extraction" | "code_tools" | "reconciliation";

export type AgentActivityEvent = {
  seq: number;
  stage: AgentActivityStage;
  actor: string;
  toolName?: string;
  text: string;
  result?: string;
};

const ROLE_LABEL: Record<DocumentRole, string> = {
  invoice: "expected payments",
  bank_statement: "bank statement",
  payment_proof: "payment proof"
};

const ROLE_ORDER: DocumentRole[] = ["invoice", "payment_proof", "bank_statement"];

function routingReason(tool: ExtractionToolName, mimeType: string): string {
  switch (tool) {
    case "parse_image_ocr":
      return "Document is a scanned image. Routing to OCR / vision extraction.";
    case "parse_pdf_text":
      return "PDF has an embedded text layer. No OCR needed — parsing text.";
    case "parse_pdf_table":
      return "PDF contains a table layout. Parsing table structure.";
    case "parse_csv_text":
      return "Delimited text file detected. Parsing CSV.";
    case "parse_spreadsheet":
      return "Spreadsheet detected. Reading rows.";
    case "manual_correction":
      return `Could not confidently auto-extract ${mimeType}. Routed to manual correction.`;
  }
}

function recordCount(role: DocumentRole, extraction: StructuredDocumentExtraction): number {
  if (role === "invoice") return extraction.invoices.length;
  if (role === "bank_statement") return extraction.bankTransactions.length;
  return extraction.paymentProofs.length;
}

export function buildAgentActivity(input: {
  documents: Record<DocumentRole, StoredDocument[]>;
  extractions: Record<DocumentRole, StructuredDocumentExtraction[]>;
  normalizedInputBatch: NormalizedInputBatch;
  reconciliation: OrchestratorOutput | null;
}): AgentActivityEvent[] {
  const events: Omit<AgentActivityEvent, "seq">[] = [];

  // ── Stage 1: Extraction Agent ──────────────────────────────────────────────
  for (const role of ROLE_ORDER) {
    const docs = input.documents[role] ?? [];
    const exs = input.extractions[role] ?? [];
    docs.forEach((doc, i) => {
      const ex = exs[i];
      if (!ex) return;
      events.push({
        stage: "extraction",
        actor: "Extraction Agent",
        toolName: "inspect_file",
        text: `${doc.fileName} — ${routingReason(ex.selectedTool, doc.mimeType)}`,
        result: `Route to ${ex.selectedTool}()`
      });
      const count = recordCount(role, ex);
      events.push({
        stage: "extraction",
        actor: "Extraction Agent",
        toolName: ex.selectedTool,
        text: ex.summary || `Extracted ${ROLE_LABEL[role]} fields.`,
        result: `Extracted ${count} record(s) · ${Math.round(ex.confidence * 100)}% confidence`
      });
    });
  }

  // ── Stage 2: Code Tools ────────────────────────────────────────────────────
  for (const event of input.normalizedInputBatch.timelines) {
    events.push({
      stage: "code_tools",
      actor: event.agent,
      ...(event.toolName ? { toolName: event.toolName } : {}),
      text: event.reasoning || event.action,
      ...(event.resultSummary ? { result: event.resultSummary } : {})
    });
  }

  // ── Stage 3: Reconciliation Orchestrator (Agent 2) ─────────────────────────
  if (input.reconciliation) {
    let pendingCallReason: string | null = null;
    for (const event of input.reconciliation.timeline) {
      switch (event.eventType) {
        case "TOOL_CALLED":
          pendingCallReason = event.reasoning;
          break;
        case "TOOL_RESULT":
          events.push({
            stage: "reconciliation",
            actor: "Reconciliation Orchestrator",
            ...(event.toolName ? { toolName: event.toolName } : {}),
            text: pendingCallReason ?? event.reasoning,
            ...(event.resultSummary ? { result: event.resultSummary } : {})
          });
          pendingCallReason = null;
          break;
        case "STATE_CHANGED":
          events.push({ stage: "reconciliation", actor: "Reconciliation Orchestrator", text: event.reasoning, result: event.action });
          break;
        case "CLASSIFICATION_COMPLETED":
          events.push({ stage: "reconciliation", actor: "Reconciliation Orchestrator", text: event.reasoning, result: event.action });
          break;
        case "ARTIFACT_REQUESTED":
          events.push({ stage: "reconciliation", actor: "Artifact Module", text: event.reasoning, result: event.action });
          break;
        case "HUMAN_REVIEW_REQUESTED":
          events.push({ stage: "reconciliation", actor: "Human Review", text: event.reasoning, result: event.action });
          break;
        default:
          break;
      }
    }
  }

  return events.map((event, i) => ({ seq: i + 1, ...event }));
}
