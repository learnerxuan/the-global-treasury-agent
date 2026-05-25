import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractReconciliationDocuments, extractRoleDocuments, type ReconciliationExtractionRequest } from "./reconciliation-workflow";
import type { StructuredExtractionInput, StructuredExtractor } from "../../lib/recon/extraction/structured-extractor";

function textUpload(fileName: string, text: string, mimeType = "text/plain") {
  return {
    fileName,
    mimeType,
    contentBase64: Buffer.from(text, "utf8").toString("base64")
  };
}

describe("extractReconciliationDocuments", () => {
  it("extracts one role and writes separate waiting records to local storage", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reconpilot-uploads-"));
    const extractedDir = await mkdtemp(join(tmpdir(), "reconpilot-extracted-"));
    const extractor: StructuredExtractor = async (input) => ({
      role: input.role,
      selectedTool: "parse_pdf_text",
      confidence: 0.93,
      summary: "Extracted invoice",
      invoices: [
        {
          invoiceNumber: "INV-1001",
          customerName: "ABC Inc.",
          issueDate: "2026-05-20",
          dueDate: "2026-05-30",
          amountDue: { value: "10.00", currency: "USD" },
          paymentReference: "INV-1001"
        }
      ],
      bankTransactions: [],
      paymentProofs: [],
      warnings: []
    });

    const result = await extractRoleDocuments(
      "invoice",
      [textUpload("invoice-1001.txt", "Invoice INV-1001\nAmount USD 10.00")],
      { storageDir, extractedDir, extractor }
    );

    expect(result.role).toBe("invoice");
    expect(result.ingestionId).toContain("ing_invoice_");
    expect(result.documents).toHaveLength(1);
    expect(result.extractions).toHaveLength(1);
    expect(result.storage.waitingRecordPaths).toHaveLength(1);
    expect(result.mockReconciliationRun).toBeNull();

    const waitingRecord = JSON.parse(await readFile(result.storage.waitingRecordPaths[0]!, "utf8")) as {
      stage: string;
      role: string;
      record: { invoiceNumber: string };
    };
    expect(waitingRecord.stage).toBe("waiting");
    expect(waitingRecord.role).toBe("invoice");
    expect(waitingRecord.record.invoiceNumber).toBe("INV-1001");
    await expect(readFile(result.storage.summaryPath, "utf8")).resolves.toContain("waitingRecordCount");
  });

  it("preserves AUD and GBP invoice currencies from extraction into waiting storage", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reconpilot-uploads-"));
    const extractedDir = await mkdtemp(join(tmpdir(), "reconpilot-extracted-"));
    const extractor: StructuredExtractor = async (input) => ({
      role: input.role,
      selectedTool: "parse_pdf_text",
      confidence: 0.93,
      summary: "Extracted foreign currency invoice",
      invoices: [
        {
          invoiceNumber: input.fileName.includes("gbp") ? "INV-GBP" : "INV-AUD",
          customerName: "Cross Border Customer",
          issueDate: "2026-05-20",
          dueDate: null,
          amountDue: {
            value: input.fileName.includes("gbp") ? "9150.00" : "13500.00",
            currency: input.fileName.includes("gbp") ? "GBP" : "AUD"
          },
          paymentReference: input.fileName.includes("gbp") ? "INV-GBP" : "INV-AUD"
        }
      ],
      bankTransactions: [],
      paymentProofs: [],
      warnings: []
    });

    const result = await extractRoleDocuments(
      "invoice",
      [
        textUpload("aud-invoice.txt", "Total Due AUD 13500.00"),
        textUpload("gbp-invoice.txt", "Total Due GBP 9150.00")
      ],
      { storageDir, extractedDir, extractor }
    );

    const records = await Promise.all(
      result.storage.waitingRecordPaths.map(async (path) => {
        const value = JSON.parse(await readFile(path, "utf8")) as { record: { invoiceCurrency: string; amountDue: { currency: string } } };
        return value.record;
      })
    );

    expect(records.map((record) => record.invoiceCurrency).sort()).toEqual(["AUD", "GBP"]);
    expect(records.map((record) => record.amountDue.currency).sort()).toEqual(["AUD", "GBP"]);
  });

  it("stores successful records when another file in the same role batch fails extraction", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reconpilot-uploads-"));
    const extractedDir = await mkdtemp(join(tmpdir(), "reconpilot-extracted-"));
    const extractor: StructuredExtractor = async (input) => {
      if (input.fileName.includes("bad")) {
        throw new Error("provider 429");
      }

      return {
        role: input.role,
        selectedTool: "parse_pdf_text",
        confidence: 0.91,
        summary: "Extracted invoice",
        invoices: [
          {
            invoiceNumber: "INV-1001",
            customerName: "ABC Inc.",
            issueDate: "2026-05-20",
            dueDate: null,
            amountDue: { value: "10.00", currency: "USD" },
            paymentReference: "INV-1001"
          }
        ],
        bankTransactions: [],
        paymentProofs: [],
        warnings: []
      };
    };

    const result = await extractRoleDocuments(
      "invoice",
      [
        textUpload("good-invoice.txt", "Invoice INV-1001\nAmount USD 10.00"),
        textUpload("bad-invoice.txt", "Invoice INV-1002\nAmount USD 20.00")
      ],
      { storageDir, extractedDir, extractor }
    );

    expect(result.extractions).toHaveLength(2);
    expect(result.extractions[1]?.selectedTool).toBe("manual_correction");
    expect(result.extractions[1]?.warnings[0]).toContain("provider 429");
    expect(result.storage.waitingRecordPaths).toHaveLength(1);

    // The failure must be visible in the summary instead of silently vanishing.
    expect(result.extractionSummary.total).toBe(2);
    expect(result.extractionSummary.extracted).toBe(1);
    expect(result.extractionSummary.failed).toBe(1);
    const failedOutcome = result.extractionSummary.outcomes.find((outcome) => outcome.status === "failed");
    expect(failedOutcome?.fileName).toContain("bad-invoice");
    expect(failedOutcome?.error).toContain("provider 429");
  });

  it("runs real proof-triggered reconciliation when payment proofs are stored", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reconpilot-uploads-"));
    const extractedDir = await mkdtemp(join(tmpdir(), "reconpilot-extracted-"));
    const extractor: StructuredExtractor = async (input) => ({
      role: input.role,
      selectedTool: "parse_pdf_text",
      confidence: 0.9,
      summary: "Extracted proof",
      invoices: [],
      bankTransactions: [],
      paymentProofs: [
        {
          payerName: "ABC Inc.",
          creditorName: "ReconPilot Sdn Bhd",
          paymentDate: "2026-05-24",
          paidAmount: { value: "10.00", currency: "USD" },
          reference: "INV-1001",
          paymentStatus: "ACSC",
          providerOrBankName: "Sender Bank",
          exchangeRate: null
        }
      ],
      warnings: []
    });

    const result = await extractRoleDocuments(
      "payment_proof",
      [textUpload("proof-1001.txt", "Paid USD 10.00 for INV-1001")],
      { storageDir, extractedDir, extractor }
    );

    expect(result.storage.waitingRecordPaths).toHaveLength(1);
    expect(result.mockReconciliationRun).toBeNull();
    expect(result.reconciliationRuns).toHaveLength(1);
    expect(result.reconciliationRuns[0]?.trigger).toBe("payment_proof_uploaded");
    expect(result.reconciliationRuns[0]?.status).toBe("NEEDS_REVIEW");
    expect(result.reconciliationRuns[0]?.summary).toContain("no waiting bank credit");
    await expect(readFile(result.reconciliationRuns[0]!.outputPaths.runPath, "utf8")).resolves.toContain("payment_proof_uploaded");
  });

  it("parses bank statement CSV uploads with code before calling the extractor", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reconpilot-uploads-"));
    const extractedDir = await mkdtemp(join(tmpdir(), "reconpilot-extracted-"));
    const calls: StructuredExtractionInput[] = [];
    const extractor: StructuredExtractor = async (input) => {
      calls.push(input);
      throw new Error("extractor should not be called for usable bank CSV");
    };

    const result = await extractRoleDocuments(
      "bank_statement",
      [
        textUpload(
          "maybank.csv",
          "date,description,amount,direction,payer\n2026-05-24,TT20260524XYZ TT INWARD FROM ABC INC USD 10.00 @ FX 4.25 LESS RM0.50 FEE NET RM42.00,42.00,CR,ABC INC",
          "text/csv"
        )
      ],
      { storageDir, extractedDir, extractor }
    );

    expect(calls).toHaveLength(0);
    expect(result.extractions[0]?.selectedTool).toBe("parse_csv_text");
    expect(result.storage.waitingRecordPaths).toHaveLength(1);

    const waitingRecord = JSON.parse(await readFile(result.storage.waitingRecordPaths[0]!, "utf8")) as {
      record: {
        description: string;
        creditDebitIndicator: string;
        sourceAmount: { value: string; currency: string };
        exchangeRateApplied: string;
        bankFeeDeducted: { value: string; currency: string };
        referenceNo: string;
      };
    };
    expect(waitingRecord.record.description).toContain("TT INWARD FROM ABC INC");
    expect(waitingRecord.record.creditDebitIndicator).toBe("CRDT");
    expect(waitingRecord.record.sourceAmount).toEqual({ value: "10.00", currency: "USD" });
    expect(waitingRecord.record.exchangeRateApplied).toBe("4.25");
    expect(waitingRecord.record.bankFeeDeducted).toEqual({ value: "0.50", currency: "MYR" });
    expect(waitingRecord.record.referenceNo).toBe("TT20260524XYZ");
  });

  it("preserves code-parsed debit and credit direction for bank statement rows", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reconpilot-uploads-"));
    const extractedDir = await mkdtemp(join(tmpdir(), "reconpilot-extracted-"));
    const extractor: StructuredExtractor = async () => {
      throw new Error("extractor should not be called for usable bank text");
    };

    const result = await extractRoleDocuments(
      "bank_statement",
      [
        textUpload(
          "statement.txt",
          [
            "Currency MYR",
            "Opening Balance MYR 1000.00",
            "Transaction Details",
            "2026-05-01 RENT PAYMENT 100.00 900.00 RENT-MAY",
            "2026-05-02 CUSTOMER PAYMENT 250.00 1150.00 INV-1001"
          ].join("\n")
        )
      ],
      { storageDir, extractedDir, extractor }
    );

    const records = await Promise.all(
      result.storage.waitingRecordPaths.map(async (path) => {
        const value = JSON.parse(await readFile(path, "utf8")) as { record: { creditDebitIndicator: string; referenceNo: string; amountReceived: unknown; netCreditAmount: unknown } };
        return value.record;
      })
    );

    expect(records.map((record) => [record.referenceNo, record.creditDebitIndicator])).toEqual([
      ["RENT-MAY", "DBIT"],
      ["INV-1001", "CRDT"]
    ]);
    expect(records[0]?.amountReceived).toBeNull();
    expect(records[0]?.netCreditAmount).toBeNull();
  });

  it("treats missing FX details as optional for otherwise complete bank statements", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reconpilot-uploads-"));
    const extractedDir = await mkdtemp(join(tmpdir(), "reconpilot-extracted-"));
    const extractor: StructuredExtractor = async (input) => ({
      role: input.role,
      selectedTool: "parse_pdf_text",
      confidence: 0.62,
      summary: "Extracted normal local bank statement",
      invoices: [],
      bankTransactions: [
        {
          transactionDate: "2026-05-24",
          valueDate: null,
          description: "TRANSFER FROM ABC INC INV-1001",
          payerName: null,
          amount: { value: "425.00", currency: "MYR" },
          creditDebitIndicator: "CRDT",
          reference: "INV-1001"
        }
      ],
      paymentProofs: [],
      warnings: []
    });

    const result = await extractRoleDocuments(
      "bank_statement",
      [textUpload("bank-statement.txt", "TRANSFER FROM ABC INC INV-1001 RM425.00")],
      { storageDir, extractedDir, extractor }
    );

    expect(result.extractions[0]?.confidence).toBe(0.9);
    expect(result.extractions[0]?.summary).toContain("missing FX/source/fee fields were treated as optional");
  });

  it("stores and extracts many reconciliation inputs through the provided extractor", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reconpilot-workflow-"));
    const calls: StructuredExtractionInput[] = [];
    const extractor: StructuredExtractor = async (input) => {
      calls.push(input);
      if (input.role === "bank_statement") {
        return {
          role: input.role,
          selectedTool: "parse_csv_text",
          confidence: 0.91,
          summary: "Extracted bank FX transaction",
          invoices: [],
          bankTransactions: [
            {
              transactionDate: "2026-05-24",
              valueDate: "2026-05-25",
              description: "TT INWARD FROM ABC INC USD 10 @ FX 4.25 LESS RM0.50 FEE NET RM42.00",
              payerName: "ABC Inc.",
              amount: { value: "42.00", currency: "MYR" },
              amountReceived: { value: "42.50", currency: "MYR" },
              sourceAmount: { value: "10.00", currency: "USD" },
              exchangeRateApplied: "4.25",
              bankFeeDeducted: { value: "0.50", currency: "MYR" },
              feeCurrency: "MYR",
              netCreditAmount: { value: "42.00", currency: "MYR" },
              reference: "TT20260524XYZ",
              referenceNo: "TT20260524XYZ",
              ttNo: "TT20260524XYZ",
              remarks: "USD 10 @ FX 4.25 Less RM0.50 Fee"
            }
          ],
          paymentProofs: [],
          warnings: []
        };
      }
      if (input.role === "payment_proof") {
        return {
          role: input.role,
          selectedTool: "parse_pdf_text",
          confidence: 0.91,
          summary: "Extracted proof with upstream fee",
          invoices: [],
          bankTransactions: [],
          paymentProofs: [
            {
              payerName: "ABC Inc.",
              creditorName: "ReconPilot Sdn Bhd",
              paymentDate: "2026-05-24",
              paidAmount: { value: "10.00", currency: "USD" },
              grossAmount: { value: "10.00", currency: "USD" },
              feeAmount: { value: "0.25", currency: "USD" },
              feeCurrency: "USD",
              netAmount: { value: "9.75", currency: "USD" },
              reference: "TT20260524XYZ",
              paymentStatus: "ACSC",
              providerOrBankName: "Sender Bank",
              exchangeRate: null
            }
          ],
          warnings: []
        };
      }

      return {
        role: input.role,
        selectedTool: "parse_pdf_text",
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
        textUpload("invoice-1001.txt", "Invoice INV-1001\nAmount: MYR 425.00"),
        textUpload("invoice-1002.txt", "Invoice INV-1002\nAmount: SGD 200.00")
      ],
      bankStatements: [
        textUpload(
          "bank-may.csv",
          "date,description,amount,direction,payer\n2026-05-24,TT20260524XYZ TT INWARD FROM ABC INC USD 10.00 @ FX 4.25 LESS RM0.50 FEE NET RM42.00,42.00,CR,ABC Inc.",
          "text/csv"
        ),
        textUpload("bank-wise.csv", "date,description,amount\n2026-05-22,INV-1002,670.00", "text/csv")
      ],
      paymentProofs: [
        textUpload("proof-1001.txt", "Paid MYR 425.00 for INV-1001"),
        textUpload("proof-1002.txt", "Paid SGD 200.00 for INV-1002")
      ]
    };

    const result = await extractReconciliationDocuments(request, { storageDir, extractor });

    expect(Object.keys(result.documents).sort()).toEqual(["bank_statement", "invoice", "payment_proof"]);
    expect(calls.map((call) => call.role).sort()).toEqual(["invoice", "invoice", "payment_proof", "payment_proof"]);
    expect(result.extractions.bank_statement[0]?.selectedTool).toBe("parse_csv_text");
    expect(result.documents.invoice).toHaveLength(2);
    expect(result.documents.bank_statement).toHaveLength(2);
    expect(result.documents.payment_proof).toHaveLength(2);
    expect(result.documents.invoice[0]?.readableTextLength).toBeGreaterThan(0);
    expect(result.documents.bank_statement[0]?.toolObservations).toContain("CSV text is available");
    expect(result.codeTools.parsedInputBatch.batchId).toBe(result.batchId);
    expect(result.codeTools.normalizedInputBatch.batchId).toBe(result.batchId);
    expect(result.codeTools.normalizedInputBatch.timelines[0]?.agent).toBe("Code Tools");
    expect(result.codeTools.parsedInputBatch.bankTransactions[0]).toMatchObject({
      amountReceived: { value: "42.50", currency: "MYR" },
      sourceAmount: { value: "10.00", currency: "USD" },
      exchangeRateApplied: "4.25",
      bankFeeDeducted: { value: "0.50", currency: "MYR" },
      feeCurrency: "MYR",
      netCreditAmount: { value: "42.00", currency: "MYR" },
      referenceNo: "TT20260524XYZ",
      ttNo: "TT20260524XYZ",
      remarks: "TT20260524XYZ TT INWARD FROM ABC INC USD 10.00 @ FX 4.25 LESS RM0.50 FEE NET RM42.00"
    });
    expect(result.codeTools.parsedInputBatch.paymentProofExtractions[0]?.financialPayload).toMatchObject({
      paidAmount: { value: "10.00", currency: "USD" },
      feeAmount: { value: "0.25", currency: "USD" },
      feeCurrency: "USD",
      netAmount: { value: "9.75", currency: "USD" },
      sourceAmount: { value: "9.75", currency: "USD" }
    });

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
