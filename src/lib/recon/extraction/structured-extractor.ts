import { z } from "zod";
import { ChutesClient } from "../chutes/client";

export const documentRoleSchema = z.enum(["invoice", "bank_statement", "payment_proof"]);
export type DocumentRole = z.infer<typeof documentRoleSchema>;

export const extractionToolNameSchema = z.enum(["parse_pdf_text", "parse_pdf_table", "parse_csv_text", "parse_spreadsheet", "parse_image_ocr", "manual_correction"]);
export type ExtractionToolName = z.infer<typeof extractionToolNameSchema>;

const moneyValueSchema = z.preprocess(
  (value) => (typeof value === "number" ? String(value) : value),
  z.string().nullable()
);

export const moneyExtractionSchema = z.object({
  value: moneyValueSchema,
  currency: z.string().nullable()
});

export const invoiceExtractionSchema = z.object({
  invoiceNumber: z.string().nullable(),
  customerName: z.string().nullable(),
  issueDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  amountDue: moneyExtractionSchema,
  paymentReference: z.string().nullable()
});

export const bankTransactionExtractionSchema = z.object({
  transactionDate: z.string().nullable(),
  valueDate: z.string().nullable(),
  description: z.string().nullable(),
  payerName: z.string().nullable(),
  amount: moneyExtractionSchema,
  reference: z.string().nullable()
});

export const paymentProofExtractionSchema = z.object({
  payerName: z.string().nullable(),
  creditorName: z.string().nullable(),
  paymentDate: z.string().nullable(),
  paidAmount: moneyExtractionSchema,
  reference: z.string().nullable(),
  paymentStatus: z.string().nullable(),
  providerOrBankName: z.string().nullable(),
  exchangeRate: z.string().nullable()
});

export const structuredDocumentExtractionSchema = z.object({
  role: documentRoleSchema,
  selectedTool: extractionToolNameSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  invoices: z.array(invoiceExtractionSchema),
  bankTransactions: z.array(bankTransactionExtractionSchema),
  paymentProofs: z.array(paymentProofExtractionSchema),
  warnings: z.array(z.string())
});

export type StructuredDocumentExtraction = z.infer<typeof structuredDocumentExtractionSchema>;

export type StructuredExtractionInput = {
  role: DocumentRole;
  fileName: string;
  mimeType: string;
  text: string;
  toolObservations: string[];
};

export type StructuredExtractor = (input: StructuredExtractionInput) => Promise<StructuredDocumentExtraction>;
export type StructuredExtractionClient = Pick<ChutesClient, "chat">;

const roleInstructions: Record<DocumentRole, string> = {
  invoice:
    "Extract invoice or accounts receivable expected payment records. Focus on invoice number, customer/debtor name, issue date, due date, amount due, currency, and payment reference.",
  bank_statement:
    "Extract bank statement credit/deposit transactions. Focus on transaction date, value date, description, payer/debtor name, received amount, currency, and remittance/reference.",
  payment_proof:
    "Extract customer payment proof or remittance evidence. Focus on payer, creditor/beneficiary, payment date, paid amount, currency, reference, payment status, bank/provider, and exchange rate if present."
};

function extractJsonObject(value: string): unknown {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Chutes extraction response did not contain a JSON object.");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

function truncateText(text: string): string {
  const maxChars = 18000;
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n[TRUNCATED]` : text;
}

function keepOnlyExpectedRoleRecords(
  extraction: StructuredDocumentExtraction,
  expectedRole: DocumentRole
): StructuredDocumentExtraction {
  return {
    ...extraction,
    invoices: expectedRole === "invoice" ? extraction.invoices : [],
    bankTransactions: expectedRole === "bank_statement" ? extraction.bankTransactions : [],
    paymentProofs: expectedRole === "payment_proof" ? extraction.paymentProofs : []
  };
}

export function createChutesStructuredExtractor(client: StructuredExtractionClient = new ChutesClient()): StructuredExtractor {
  return async (input) => {
    if (input.text.trim().length === 0) {
      return {
        role: input.role,
        selectedTool: "manual_correction",
        confidence: 0,
        summary: "No readable text was available for extraction.",
        invoices: [],
        bankTransactions: [],
        paymentProofs: [],
        warnings: ["No readable document text was available."]
      };
    }

    const content = await client.chat({
      maxTokens: 2200,
      messages: [
        {
          role: "system",
          content:
            "You are ReconPilot's extraction agent. Return only valid JSON. Do not normalize names or references. Do not match records. Do not invent missing values; use null and warnings."
        },
        {
          role: "user",
          content: [
            roleInstructions[input.role],
            "",
            "First choose the best extraction tool from this list based on the file metadata and observations:",
            "- parse_pdf_text: digital PDF or plain-text proof with readable text",
            "- parse_pdf_table: PDF or text that appears table-like or key-value row based",
            "- parse_csv_text: CSV-style invoice or bank statement export",
            "- parse_spreadsheet: XLSX invoice or bank statement export",
            "- parse_image_ocr: image/scanned proof after OCR text is available",
            "- manual_correction: unreadable, empty, or unsafe extraction",
            "",
            "Fill only the array for the current document role:",
            "- role invoice: fill invoices only; bankTransactions and paymentProofs must be [].",
            "- role bank_statement: fill bankTransactions only; invoices and paymentProofs must be [].",
            "- role payment_proof: fill paymentProofs only; invoices and bankTransactions must be [].",
            "",
            "Return JSON with this exact shape:",
            '{"role":"invoice|bank_statement|payment_proof","selectedTool":"parse_pdf_text|parse_pdf_table|parse_csv_text|parse_spreadsheet|parse_image_ocr|manual_correction","confidence":0.0,"summary":"","invoices":[{"invoiceNumber":null,"customerName":null,"issueDate":null,"dueDate":null,"amountDue":{"value":null,"currency":null},"paymentReference":null}],"bankTransactions":[{"transactionDate":null,"valueDate":null,"description":null,"payerName":null,"amount":{"value":null,"currency":null},"reference":null}],"paymentProofs":[{"payerName":null,"creditorName":null,"paymentDate":null,"paidAmount":{"value":null,"currency":null},"reference":null,"paymentStatus":null,"providerOrBankName":null,"exchangeRate":null}],"warnings":[]}',
            "",
            `Document role: ${input.role}`,
            `File name: ${input.fileName}`,
            `MIME type: ${input.mimeType}`,
            `Tool observations: ${input.toolObservations.join("; ") || "none"}`,
            "",
            "Document text:",
            truncateText(input.text)
          ].join("\n")
        }
      ]
    });

    const parsed = structuredDocumentExtractionSchema.parse(extractJsonObject(content));
    if (parsed.role !== input.role) {
      return keepOnlyExpectedRoleRecords(
        { ...parsed, role: input.role, warnings: [...parsed.warnings, `Model returned role ${parsed.role}; server expected ${input.role}.`] },
        input.role
      );
    }

    return keepOnlyExpectedRoleRecords(parsed, input.role);
  };
}
