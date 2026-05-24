import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractReconciliationDocuments, type ReconciliationExtractionRequest } from "./reconciliation-workflow";
import type { StructuredExtractionInput, StructuredExtractor } from "../../lib/recon/extraction/structured-extractor";

function textUpload(fileName: string, text: string, mimeType = "text/plain") {
  return {
    fileName,
    mimeType,
    contentBase64: Buffer.from(text, "utf8").toString("base64")
  };
}

describe("extractReconciliationDocuments", () => {
  it("stores and extracts all three reconciliation inputs through the provided extractor", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reconpilot-workflow-"));
    const calls: StructuredExtractionInput[] = [];
    const extractor: StructuredExtractor = async (input) => {
      calls.push(input);
      return {
        role: input.role,
        selectedTool: input.role === "bank_statement" ? "parse_spreadsheet" : "parse_pdf_text",
        confidence: 0.91,
        summary: `Extracted ${input.role}`,
        invoices: [],
        bankTransactions: [],
        paymentProofs: [],
        warnings: []
      };
    };

    const request: ReconciliationExtractionRequest = {
      invoice: textUpload("invoice.txt", "Invoice INV-1001\nAmount: MYR 425.00"),
      bankStatement: textUpload("bank.csv", "date,description,amount\n2026-05-21,INV-1001,425.00", "text/csv"),
      paymentProof: textUpload("proof.txt", "Paid MYR 425.00 for INV-1001")
    };

    const result = await extractReconciliationDocuments(request, { storageDir, extractor });

    expect(Object.keys(result.documents).sort()).toEqual(["bank_statement", "invoice", "payment_proof"]);
    expect(calls.map((call) => call.role).sort()).toEqual(["bank_statement", "invoice", "payment_proof"]);
    expect(result.extractions.bank_statement.selectedTool).toBe("parse_spreadsheet");
    expect(result.documents.invoice.readableTextLength).toBeGreaterThan(0);
    expect(result.documents.bank_statement.toolObservations).toContain("CSV text is available");

    const storedInvoice = await readFile(result.documents.invoice.storageRef.uri, "utf8");
    expect(storedInvoice).toContain("INV-1001");
  });

  it("rejects unsupported files before calling the extractor", async () => {
    const extractor: StructuredExtractor = async () => {
      throw new Error("extractor should not be called");
    };

    await expect(
      extractReconciliationDocuments(
        {
          invoice: textUpload("invoice.docx", "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
          bankStatement: textUpload("bank.csv", "date,amount", "text/csv"),
          paymentProof: textUpload("proof.txt", "paid")
        },
        { extractor }
      )
    ).rejects.toThrow("Unsupported document type");
  });

  it("accepts spreadsheet uploads and surfaces unreadable spreadsheet warnings without fixtures", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reconpilot-workflow-"));
    const calls: StructuredExtractionInput[] = [];
    const extractor: StructuredExtractor = async (input) => {
      calls.push(input);
      return {
        role: input.role,
        selectedTool: "manual_correction",
        confidence: 0,
        summary: "Unreadable spreadsheet",
        invoices: [],
        bankTransactions: [],
        paymentProofs: [],
        warnings: input.toolObservations
      };
    };

    const result = await extractReconciliationDocuments(
      {
        invoice: textUpload("invoice.xlsx", "not-a-real-xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        bankStatement: textUpload("bank.csv", "date,amount", "text/csv"),
        paymentProof: textUpload("proof.txt", "paid")
      },
      { storageDir, extractor }
    );

    expect(result.documents.invoice.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(result.documents.invoice.toolObservations).toContain("Spreadsheet extraction failed");
    expect(calls[0]?.role).toBe("invoice");
  });
});
