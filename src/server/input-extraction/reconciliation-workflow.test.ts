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
  it("stores and extracts many reconciliation inputs through the provided extractor", async () => {
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
      invoices: [
        textUpload("invoice-1001.md", "Invoice INV-1001\nAmount: MYR 425.00", "text/markdown"),
        textUpload("invoice-1002.txt", "Invoice INV-1002\nAmount: SGD 200.00")
      ],
      bankStatements: [
        textUpload("bank-may.csv", "date,description,amount\n2026-05-21,INV-1001,425.00", "text/csv"),
        textUpload("bank-wise.csv", "date,description,amount\n2026-05-22,INV-1002,670.00", "text/csv")
      ],
      paymentProofs: [
        textUpload("proof-1001.md", "Paid MYR 425.00 for INV-1001", "text/markdown"),
        textUpload("proof-1002.txt", "Paid SGD 200.00 for INV-1002")
      ]
    };

    const result = await extractReconciliationDocuments(request, { storageDir, extractor });

    expect(Object.keys(result.documents).sort()).toEqual(["bank_statement", "invoice", "payment_proof"]);
    expect(calls.map((call) => call.role).sort()).toEqual(["bank_statement", "bank_statement", "invoice", "invoice", "payment_proof", "payment_proof"]);
    expect(result.extractions.bank_statement[0]?.selectedTool).toBe("parse_spreadsheet");
    expect(result.documents.invoice).toHaveLength(2);
    expect(result.documents.bank_statement).toHaveLength(2);
    expect(result.documents.payment_proof).toHaveLength(2);
    expect(result.documents.invoice[0]?.readableTextLength).toBeGreaterThan(0);
    expect(result.documents.bank_statement[0]?.toolObservations).toContain("CSV text is available");

    const storedInvoice = await readFile(result.documents.invoice[0]!.storageRef.uri, "utf8");
    expect(storedInvoice).toContain("INV-1001");
  });

  it("rejects unsupported files before calling the extractor", async () => {
    const extractor: StructuredExtractor = async () => {
      throw new Error("extractor should not be called");
    };

    await expect(
      extractReconciliationDocuments(
        {
          invoices: [textUpload("invoice.docx", "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")],
          bankStatements: [textUpload("bank.csv", "date,amount", "text/csv")],
          paymentProofs: [textUpload("proof.txt", "paid")]
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
        invoices: [textUpload("invoice.xlsx", "not-a-real-xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")],
        bankStatements: [textUpload("bank.csv", "date,amount", "text/csv")],
        paymentProofs: [textUpload("proof.txt", "paid")]
      },
      { storageDir, extractor }
    );

    expect(result.documents.invoice[0]?.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(result.documents.invoice[0]?.toolObservations).toContain("Spreadsheet extraction failed");
    expect(calls[0]?.role).toBe("invoice");
  });

  it("rejects missing document groups before extraction", async () => {
    const extractor: StructuredExtractor = async () => {
      throw new Error("extractor should not be called");
    };

    await expect(
      extractReconciliationDocuments(
        {
          invoices: [],
          bankStatements: [textUpload("bank.csv", "date,amount", "text/csv")],
          paymentProofs: [textUpload("proof.txt", "paid")]
        },
        { extractor }
      )
    ).rejects.toThrow("Upload at least one invoice document");
  });
});
