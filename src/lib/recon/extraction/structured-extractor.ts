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
  creditDebitIndicator: z.enum(["CRDT", "DBIT"]).nullable().optional(),
  amountReceived: moneyExtractionSchema.nullable().optional(),
  sourceAmount: moneyExtractionSchema.nullable().optional(),
  exchangeRateApplied: z.string().nullable().optional(),
  bankFeeDeducted: moneyExtractionSchema.nullable().optional(),
  feeCurrency: z.string().nullable().optional(),
  netCreditAmount: moneyExtractionSchema.nullable().optional(),
  reference: z.string().nullable().optional(),
  referenceNo: z.string().nullable().optional(),
  ttNo: z.string().nullable().optional(),
  remarks: z.string().nullable().optional()
});

export const paymentProofExtractionSchema = z.object({
  payerName: z.string().nullable(),
  creditorName: z.string().nullable(),
  paymentDate: z.string().nullable(),
  paidAmount: moneyExtractionSchema,
  reference: z.string().nullable(),
  invoiceIds: z.array(z.string()).optional(),
  remittanceLineItems: z.array(z.object({
    invoiceNumber: z.string().nullable(),
    paidAmount: moneyExtractionSchema.nullable().optional(),
    discountAmount: moneyExtractionSchema.nullable().optional(),
    feeAmount: moneyExtractionSchema.nullable().optional(),
    note: z.string().nullable().optional()
  })).optional(),
  paymentStatus: z.string().nullable(),
  providerOrBankName: z.string().nullable(),
  exchangeRate: z.string().nullable(),
  grossAmount: moneyExtractionSchema.nullable().optional(),
  feeAmount: moneyExtractionSchema.nullable().optional(),
  feeCurrency: z.string().nullable().optional(),
  netAmount: moneyExtractionSchema.nullable().optional()
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

// ─── Role-specific instructions ──────────────────────────────────────────────

const roleInstructions: Record<DocumentRole, string> = {
  invoice:
    "Extract invoice or accounts receivable expected payment records. Focus on invoice number, customer/debtor name, issue date, due date, amount due, ISO 4217 currency code, and payment reference.",
  bank_statement:
    "Extract bank statement credit/deposit transactions. Focus on transaction date, value date, description/narration, payer/debtor name, account currency amount received, source foreign amount when mentioned, exchange rate applied, local bank fee deducted, fee currency, net credit amount, reference number, TT/SWIFT number, and remarks.",
  payment_proof:
    "Extract customer payment proof or remittance evidence. Focus on payer, creditor/beneficiary, payment date, gross sent amount, upstream/intermediary fee amount, fee currency, net sent amount, paid amount, currency, reference, invoice IDs, remittance line items, payment status, bank/provider, and exchange rate if present."
};

// ─── Role-specific JSON shapes (only the relevant array populated) ───────────

const ROLE_SCHEMAS: Record<DocumentRole, string> = {
  invoice: `{"role":"invoice","selectedTool":"parse_pdf_text|parse_pdf_table|parse_csv_text|parse_spreadsheet|parse_image_ocr|manual_correction","confidence":0.0,"summary":"","invoices":[{"invoiceNumber":null,"customerName":null,"issueDate":null,"dueDate":null,"amountDue":{"value":null,"currency":null},"paymentReference":null}],"bankTransactions":[],"paymentProofs":[],"warnings":[]}`,
  bank_statement: `{"role":"bank_statement","selectedTool":"parse_pdf_text|parse_pdf_table|parse_csv_text|parse_spreadsheet|parse_image_ocr|manual_correction","confidence":0.0,"summary":"","invoices":[],"bankTransactions":[{"transactionDate":null,"valueDate":null,"description":null,"payerName":null,"amount":{"value":null,"currency":null},"creditDebitIndicator":"CRDT|DBIT|null","amountReceived":{"value":null,"currency":null},"sourceAmount":{"value":null,"currency":null},"exchangeRateApplied":null,"bankFeeDeducted":{"value":null,"currency":null},"feeCurrency":null,"netCreditAmount":{"value":null,"currency":null},"reference":null,"referenceNo":null,"ttNo":null,"remarks":null}],"paymentProofs":[],"warnings":[]}`,
  payment_proof: `{"role":"payment_proof","selectedTool":"parse_pdf_text|parse_pdf_table|parse_csv_text|parse_spreadsheet|parse_image_ocr|manual_correction","confidence":0.0,"summary":"","invoices":[],"bankTransactions":[],"paymentProofs":[{"payerName":null,"creditorName":null,"paymentDate":null,"paidAmount":{"value":null,"currency":null},"reference":null,"invoiceIds":[],"remittanceLineItems":[{"invoiceNumber":null,"paidAmount":{"value":null,"currency":null},"discountAmount":{"value":null,"currency":null},"feeAmount":{"value":null,"currency":null},"note":null}],"paymentStatus":null,"providerOrBankName":null,"exchangeRate":null,"grossAmount":{"value":null,"currency":null},"feeAmount":{"value":null,"currency":null},"feeCurrency":null,"netAmount":{"value":null,"currency":null}}],"warnings":[]}`
};

// ─── Role-specific field guidance ────────────────────────────────────────────

const ROLE_GUIDANCE: Record<DocumentRole, string> = {
  invoice: [
    "Fill only the invoices array; bankTransactions and paymentProofs must be [].",
    "Use uppercase 3-letter ISO currency codes."
  ].join("\n"),
  bank_statement: [
    "Fill only the bankTransactions array; invoices and paymentProofs must be [].",
    "For bank statements, amount is the final transaction amount shown by the bank.",
    "Fill creditDebitIndicator as CRDT for incoming credits/deposits and DBIT for outgoing debits/withdrawals/charges.",
    "If the narration contains FX and local receiver-bank fees, also fill sourceAmount, exchangeRateApplied, bankFeeDeducted, feeCurrency, netCreditAmount, referenceNo, ttNo, and remarks.",
    "Use uppercase 3-letter ISO currency codes."
  ].join("\n"),
  payment_proof: [
    "Fill only the paymentProofs array; invoices and bankTransactions must be [].",
    "The 'paidAmount' field is mandatory and must always be filled with the primary transaction amount.",
    "If the proof is remittance advice, fill invoiceIds with every listed invoice and remittanceLineItems with invoiceNumber, paidAmount, discountAmount, feeAmount, and note when visible.",
    "If the proof shows upstream/intermediary fees before conversion, optionally fill grossAmount, feeAmount, feeCurrency, and netAmount.",
    "Use uppercase 3-letter ISO currency codes.",
    "For payment status, explicitly look for status text like 'Completed', 'Successful', or 'Pending' (often in badges or headers)."
  ].join("\n")
};

// ─── Extraction tool choices ─────────────────────────────────────────────────

const TOOL_CHOICES = [
  "First choose the best extraction tool from this list based on the file metadata and observations:",
  "- parse_pdf_text: digital PDF or plain-text proof with readable text",
  "- parse_pdf_table: PDF or text that appears table-like or key-value row based",
  "- parse_csv_text: CSV-style invoice or bank statement export",
  "- parse_spreadsheet: XLSX invoice or bank statement export",
  "- parse_image_ocr: image/scanned proof after OCR text is available",
  "- manual_correction: unreadable, empty, or unsafe extraction"
].join("\n");

// ─── Text processing helpers ─────────────────────────────────────────────────

function extractJsonObject(value: string): unknown {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Chutes extraction response did not contain a JSON object.");
  }

  const json = candidate.slice(start, end + 1);
  try {
    return JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error";
    const position = message.match(/position (\d+)/)?.[1];
    const index = position ? Number(position) : -1;
    const nearby = index >= 0 ? json.slice(Math.max(0, index - 180), Math.min(json.length, index + 180)) : json.slice(0, 360);
    throw new Error(`Extraction agent returned malformed JSON: ${message}. Nearby content: ${nearby}`);
  }
}

/**
 * Smart truncation that preserves both the document head (headers, early data)
 * and tail (totals, summaries, payment status). Critical for financial documents
 * where totals and grand totals are typically at the bottom.
 */
function smartTruncateText(text: string): string {
  const MAX_CHARS = 18000;
  if (text.length <= MAX_CHARS) return text;

  const HEAD = 12000;
  const TAIL = 5500;
  const head = text.slice(0, HEAD);
  const tail = text.slice(-TAIL);
  const omitted = text.length - HEAD - TAIL;
  return `${head}\n\n[... ${omitted} characters omitted ...]\n\n${tail}`;
}

/**
 * Attempts lightweight programmatic JSON repair before falling back to
 * the expensive LLM repair call. Fixes common LLM JSON issues:
 * - Markdown fencing
 * - Trailing commas
 * - Control characters
 */
function tryProgrammaticRepair(raw: string): string {
  let s = raw;
  // Strip markdown fencing
  s = s.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  // Remove control characters (but keep newlines and tabs for readability)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/g, " ");
  // Fix trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");
  // Extract the JSON object
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
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

async function parseStructuredExtractionWithRepair(
  client: StructuredExtractionClient,
  content: string,
  expectedRole: DocumentRole
): Promise<StructuredDocumentExtraction> {
  // Step 1: Try parsing the raw response directly
  try {
    return structuredDocumentExtractionSchema.parse(extractJsonObject(content));
  } catch {
    // Step 1 failed — continue to programmatic repair
  }

  // Step 2: Try programmatic repair (cheap, no LLM call)
  try {
    const repaired = tryProgrammaticRepair(content);
    return structuredDocumentExtractionSchema.parse(JSON.parse(repaired));
  } catch {
    // Step 2 failed — continue to LLM repair
  }

  // Step 3: LLM-based repair removed to prevent rate limits
  throw new Error("Unable to parse extraction JSON. Fallback to manual correction.");
}

// ─── Role-specific prompt builder ────────────────────────────────────────────

function buildRoleSpecificUserMessage(input: StructuredExtractionInput): string {
  return [
    roleInstructions[input.role],
    "",
    TOOL_CHOICES,
    "",
    ROLE_GUIDANCE[input.role],
    "",
    "Return JSON with this exact shape:",
    ROLE_SCHEMAS[input.role],
    "",
    `Document role: ${input.role}`,
    `File name: ${input.fileName}`,
    `MIME type: ${input.mimeType}`,
    `Tool observations: ${input.toolObservations.join("; ") || "none"}`,
    "",
    "Document text:",
    smartTruncateText(input.text)
  ].join("\n");
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

    const messages = [
      {
        role: "system",
        content:
          "You are ReconPilot's extraction agent. Return only valid JSON. Do not normalize names or references. Do not match records. Do not invent missing values; use null. Only populate the 'warnings' array for critical unreadable text or severely damaged documents, NOT for standard fine-print disclosures or missing optional fees."
      },
      {
        role: "user",
        content: buildRoleSpecificUserMessage(input)
      }
    ] as const;

    const maxParseAttempts = 2;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxParseAttempts; attempt++) {
      try {
        const content = await client.chat({
          maxTokens: 2200,
          messages: [...messages]
        });

        const parsed = await parseStructuredExtractionWithRepair(client, content, input.role);
        if (parsed.role !== input.role) {
          return keepOnlyExpectedRoleRecords(
            { ...parsed, role: input.role, warnings: [...parsed.warnings, `Model returned role ${parsed.role}; server expected ${input.role}.`] },
            input.role
          );
        }

        return keepOnlyExpectedRoleRecords(parsed, input.role);
      } catch (error) {
        lastError = error;
        // If it's a transient formatting issue, wait briefly and try the exact same prompt again
        if (attempt < maxParseAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Unable to parse extraction JSON. Fallback to manual correction.");
  };
}
