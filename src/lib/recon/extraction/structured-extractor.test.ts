import { describe, expect, it } from "vitest";
import { createChutesStructuredExtractor, structuredDocumentExtractionSchema } from "./structured-extractor";

describe("structuredDocumentExtractionSchema", () => {
  it("coerces numeric money values from LLM JSON into strings", () => {
    const result = structuredDocumentExtractionSchema.parse({
      role: "invoice",
      selectedTool: "parse_pdf_text",
      confidence: 0.9,
      summary: "Extracted invoice.",
      invoices: [
        {
          invoiceNumber: "INV-1001",
          customerName: "Acme Pte Ltd",
          issueDate: "2026-05-20",
          dueDate: null,
          amountDue: { value: 425, currency: "MYR" },
          paymentReference: "INV-1001"
        }
      ],
      bankTransactions: [],
      paymentProofs: [],
      warnings: []
    });

    expect(result.invoices[0]?.amountDue.value).toBe("425");
  });

  it("keeps only records for the expected document role", async () => {
    const extractor = createChutesStructuredExtractor({
      chat: async () =>
        JSON.stringify({
          role: "bank_statement",
          selectedTool: "parse_spreadsheet",
          confidence: 0.9,
          summary: "Extracted records.",
          invoices: [
            {
              invoiceNumber: "INV-1001",
              customerName: "Acme Pte Ltd",
              issueDate: "2026-05-20",
              dueDate: null,
              amountDue: { value: "425.00", currency: "MYR" },
              paymentReference: "INV-1001"
            }
          ],
          bankTransactions: [
            {
              transactionDate: "2026-05-21",
              valueDate: null,
              description: "INV-1001 ACME",
              payerName: "Acme Pte Ltd",
              amount: { value: "425.00", currency: "MYR" },
              reference: "INV-1001"
            }
          ],
          paymentProofs: [
            {
              payerName: "Acme Pte Ltd",
              creditorName: "ReconPilot Sdn Bhd",
              paymentDate: "2026-05-20",
              paidAmount: { value: "100.00", currency: "USD" },
              reference: "INV-1001",
              paymentStatus: "Paid",
              providerOrBankName: "Wise",
              exchangeRate: "4.25"
            }
          ],
          warnings: []
        })
    });

    const result = await extractor({
      role: "bank_statement",
      fileName: "bank.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      text: "Date,Description,Amount\n2026-05-21,INV-1001 ACME,425.00",
      toolObservations: ["Spreadsheet rows are available"]
    });

    expect(result.invoices).toEqual([]);
    expect(result.bankTransactions).toHaveLength(1);
    expect(result.paymentProofs).toEqual([]);
  });
});
