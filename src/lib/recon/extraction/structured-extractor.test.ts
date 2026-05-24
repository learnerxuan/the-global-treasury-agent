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

  it("accepts bank statement FX, fee, net credit, and TT fields", () => {
    const result = structuredDocumentExtractionSchema.parse({
      role: "bank_statement",
      selectedTool: "parse_csv_text",
      confidence: 0.92,
      summary: "Extracted MYR bank credit with FX narration.",
      invoices: [],
      bankTransactions: [
        {
          transactionDate: "2026-05-24",
          valueDate: "2026-05-25",
          description: "TT INWARD FROM ABC INC USD 10 @ FX 4.25 LESS RM0.50 FEE NET RM42.00",
          payerName: "ABC Inc.",
          amount: { value: "42.00", currency: "MYR" },
          creditDebitIndicator: "CRDT",
          amountReceived: { value: "42.50", currency: "MYR" },
          sourceAmount: { value: 10, currency: "USD" },
          exchangeRateApplied: "4.25",
          bankFeeDeducted: { value: 0.5, currency: "MYR" },
          feeCurrency: "MYR",
          netCreditAmount: { value: 42, currency: "MYR" },
          reference: "TT20260524XYZ",
          referenceNo: "TT20260524XYZ",
          ttNo: "TT20260524XYZ",
          remarks: "USD 10 @ FX 4.25 Less RM0.50 Fee"
        }
      ],
      paymentProofs: [],
      warnings: []
    });

    expect(result.bankTransactions[0]?.sourceAmount?.value).toBe("10");
    expect(result.bankTransactions[0]?.creditDebitIndicator).toBe("CRDT");
    expect(result.bankTransactions[0]?.exchangeRateApplied).toBe("4.25");
    expect(result.bankTransactions[0]?.bankFeeDeducted?.value).toBe("0.5");
    expect(result.bankTransactions[0]?.feeCurrency).toBe("MYR");
    expect(result.bankTransactions[0]?.netCreditAmount?.value).toBe("42");
    expect(result.bankTransactions[0]?.ttNo).toBe("TT20260524XYZ");
  });

  it("accepts payment proof upstream fee currency and net sent amount", () => {
    const result = structuredDocumentExtractionSchema.parse({
      role: "payment_proof",
      selectedTool: "parse_pdf_text",
      confidence: 0.91,
      summary: "Extracted SWIFT proof with upstream fee.",
      invoices: [],
      bankTransactions: [],
      paymentProofs: [
        {
          payerName: "ABC Inc.",
          creditorName: "ReconPilot Sdn Bhd",
          paymentDate: "2026-05-24",
          paidAmount: { value: "10.00", currency: "USD" },
          grossAmount: { value: 10, currency: "USD" },
          feeAmount: { value: 0.25, currency: "USD" },
          feeCurrency: "USD",
          netAmount: { value: 9.75, currency: "USD" },
          reference: "TT20260524XYZ",
          paymentStatus: "ACSC",
          providerOrBankName: "Sender Bank",
          exchangeRate: null
        }
      ],
      warnings: []
    });

    expect(result.paymentProofs[0]?.feeAmount?.value).toBe("0.25");
    expect(result.paymentProofs[0]?.feeCurrency).toBe("USD");
    expect(result.paymentProofs[0]?.netAmount?.value).toBe("9.75");
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

  it("repairs malformed JSON returned by the extraction provider", async () => {
    const calls: string[] = [];
    const extractor = createChutesStructuredExtractor({
      chat: async ({ messages }) => {
        calls.push(messages.at(-1)?.content ?? "");
        if (calls.length === 1) {
          return `{
            "role":"payment_proof",
            "selectedTool":"parse_pdf_text",
            "confidence":0.9,
            "summary":"Extracted proof",
            "invoices":[],
            "bankTransactions":[],
            "paymentProofs":[
              {
                "payerName":"ABC Inc.",
                "creditorName":"ReconPilot Sdn Bhd",
                "paymentDate":"2026-05-24",
                "paidAmount":{"value":"10.00","currency":"USD"},
                "reference":"TT20260524XYZ",
                "paymentStatus":"ACSC",
                "providerOrBankName":"Sender Bank",
                "exchangeRate":null
              }
              {
                "payerName":"ABC Inc.",
                "creditorName":"ReconPilot Sdn Bhd",
                "paymentDate":"2026-05-24",
                "paidAmount":{"value":"9.75","currency":"USD"},
                "reference":"TT20260524XYZ",
                "paymentStatus":"ACSC",
                "providerOrBankName":"Sender Bank",
                "exchangeRate":null
              }
            ],
            "warnings":[]
          }`;
        }

        return JSON.stringify({
          role: "payment_proof",
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
              reference: "TT20260524XYZ",
              paymentStatus: "ACSC",
              providerOrBankName: "Sender Bank",
              exchangeRate: null
            }
          ],
          warnings: []
        });
      }
    });

    const result = await extractor({
      role: "payment_proof",
      fileName: "proof.txt",
      mimeType: "text/plain",
      text: "Gross sent USD 10.00 Ref TT20260524XYZ",
      toolObservations: ["Plain text is available"]
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("Repair this extraction response");
    expect(result.paymentProofs).toHaveLength(1);
    expect(result.paymentProofs[0]?.reference).toBe("TT20260524XYZ");
  });
});
