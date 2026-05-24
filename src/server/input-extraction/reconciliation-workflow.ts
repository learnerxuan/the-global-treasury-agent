import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import { readSheet } from "read-excel-file/node";
import { extractImageText } from "../../lib/recon/extraction/image-ocr";
import { extractPdfText } from "../../lib/recon/extraction/pdf-text";
import { createChutesStructuredExtractor, type DocumentRole, type StructuredDocumentExtraction, type StructuredExtractor } from "../../lib/recon/extraction/structured-extractor";
import { normalizeInputBatch } from "../../lib/recon/normalize-input-batch";
import { normalize_currency_amount, normalize_date, normalize_party_name, normalize_reference } from "../../lib/recon/normalizers";
import type {
  BankStatementTransaction,
  CurrencyCode,
  ExpectedPaymentRecord,
  FieldEvidence,
  InputBatch,
  InputFileDescriptor,
  MoneyAmount,
  NormalizedInputBatch,
  PaymentProofExtractionOutput,
  PaymentProofInputDescriptor,
  Warning
} from "../../lib/recon/types";

const maxUploadBytes = 10 * 1024 * 1024;
const defaultStorageDir = join(/* turbopackIgnore: true */ process.cwd(), "runtime", "uploads");

const supportedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

export type UploadedDocument = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
};

export type ReconciliationExtractionRequest = {
  invoices: UploadedDocument[];
  bankStatements: UploadedDocument[];
  paymentProofs: UploadedDocument[];
};

export type StoredDocument = {
  documentId: string;
  role: DocumentRole;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageRef: {
    kind: "local_path";
    uri: string;
  };
  readableTextLength: number;
  toolObservations: string[];
  warnings: string[];
};

export type ReconciliationExtractionResponse = {
  batchId: string;
  uploadedAt: string;
  documents: Record<DocumentRole, StoredDocument[]>;
  extractions: Record<DocumentRole, StructuredDocumentExtraction[]>;
  codeTools: {
    parsedInputBatch: InputBatch;
    normalizedInputBatch: NormalizedInputBatch;
  };
};

export type ReconciliationExtractionOptions = {
  storageDir?: string;
  extractor?: StructuredExtractor;
};

function resolveStorageDir(storageDir?: string): string {
  if (!storageDir) return defaultStorageDir;
  return isAbsolute(storageDir) ? storageDir : resolve(/* turbopackIgnore: true */ process.cwd(), storageDir);
}

function sanitizeFileName(fileName: string): string {
  const cleaned = fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned.length > 0 ? cleaned : "uploaded-document";
}

function decodeContent(contentBase64: string): Buffer {
  const bytes = Buffer.from(contentBase64, "base64");
  if (bytes.length === 0) throw new Error("Uploaded document is empty.");
  if (bytes.length > maxUploadBytes) throw new Error(`Uploaded document exceeds ${maxUploadBytes} bytes.`);
  return bytes;
}

function assertSupportedMimeType(mimeType: string): void {
  if (!supportedMimeTypes.has(mimeType)) {
    throw new Error(`Unsupported document type: ${mimeType}. Supported types: PDF, image, XLSX, CSV, Markdown, and TXT.`);
  }
}

function ensureExtension(fileName: string, mimeType: string): string {
  if (extname(fileName)) return fileName;
  const extensions: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/tiff": ".tiff",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "text/csv": ".csv",
    "application/csv": ".csv",
    "application/vnd.ms-excel": ".csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx"
  };

  return `${fileName}${extensions[mimeType] ?? ".txt"}`;
}

function isCsvLike(mimeType: string, fileName = ""): boolean {
  return mimeType === "text/csv" || mimeType === "application/csv" || fileName.toLowerCase().endsWith(".csv");
}

function isSpreadsheetLike(mimeType: string, fileName = ""): boolean {
  const lowerName = fileName.toLowerCase();
  return mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || lowerName.endsWith(".xlsx");
}

function spreadsheetRowsToText(rows: unknown[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell instanceof Date) return cell.toISOString().slice(0, 10);
          if (cell === null || cell === undefined) return "";
          return String(cell).trim();
        })
        .join(",")
    )
    .filter((line) => line.replace(/,/g, "").trim().length > 0)
    .join("\n");
}

function looksTableLike(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return false;
  const delimitedRows = lines.filter((line) => line.includes(",") || line.includes("\t") || line.includes("|")).length;
  const keyValueRows = lines.filter((line) => line.includes(":")).length;
  return delimitedRows >= Math.min(2, lines.length) || keyValueRows >= Math.min(3, lines.length);
}

async function readableTextFromStoredFile(path: string, mimeType: string, bytes: Buffer): Promise<{ text: string; warnings: string[]; observations: string[] }> {
  if (mimeType === "application/pdf") {
    try {
      const text = await extractPdfText(bytes);
      return {
        text,
        warnings: [],
        observations: [looksTableLike(text) ? "PDF text appears table-like" : "PDF text layer is readable"]
      };
    } catch (error) {
      return {
        text: "",
        warnings: [`Could not read PDF text: ${error instanceof Error ? error.message : "unknown error"}`],
        observations: ["PDF text extraction failed"]
      };
    }
  }

  if (mimeType.startsWith("image/")) {
    try {
      const text = await extractImageText(path);
      return { text, warnings: [], observations: ["Image OCR text is available"] };
    } catch (error) {
      return {
        text: "",
        warnings: [`Could not OCR image: ${error instanceof Error ? error.message : "unknown error"}`],
        observations: ["Image OCR failed"]
      };
    }
  }

  if (isSpreadsheetLike(mimeType, path)) {
    try {
      const rows = await readSheet(bytes);
      const text = spreadsheetRowsToText(rows);
      return {
        text,
        warnings: [],
        observations: ["Spreadsheet rows are available", looksTableLike(text) ? "Spreadsheet appears table-like" : "Spreadsheet has sparse rows"]
      };
    } catch (error) {
      return {
        text: "",
        warnings: [`Could not read spreadsheet rows: ${error instanceof Error ? error.message : "unknown error"}`],
        observations: ["Spreadsheet extraction failed"]
      };
    }
  }

  const text = bytes.toString("utf8");
  return {
    text,
    warnings: [],
    observations: [
      isCsvLike(mimeType) ? "CSV text is available" : "Plain text is available",
      looksTableLike(text) ? "Text appears table-like" : "Text appears freeform"
    ]
  };
}

async function storeDocument(role: DocumentRole, upload: UploadedDocument, storageDir: string): Promise<{ stored: StoredDocument; text: string }> {
  assertSupportedMimeType(upload.mimeType);
  const bytes = decodeContent(upload.contentBase64);
  const fileName = ensureExtension(sanitizeFileName(upload.fileName), upload.mimeType);
  const storedFileName = `${role}-${randomUUID()}-${fileName}`;
  const storagePath = resolve(storageDir, storedFileName);

  await mkdir(storageDir, { recursive: true });
  await writeFile(storagePath, bytes);

  const readable = await readableTextFromStoredFile(storagePath, upload.mimeType, bytes);
  return {
    text: readable.text,
    stored: {
      documentId: `${role}_${randomUUID()}`,
      role,
      fileName,
      mimeType: upload.mimeType,
      sizeBytes: bytes.length,
      storageRef: { kind: "local_path", uri: storagePath },
      readableTextLength: readable.text.length,
      toolObservations: readable.observations,
      warnings: readable.warnings
    }
  };
}

const mvpCurrencies = new Set<CurrencyCode>(["MYR", "USD", "SGD", "EUR"]);

function toCurrency(value: string | null | undefined, fallback: CurrencyCode): CurrencyCode {
  const normalized = value?.trim().toUpperCase();
  return normalized && mvpCurrencies.has(normalized as CurrencyCode) ? (normalized as CurrencyCode) : fallback;
}

function toMoneyAmount(value: string | null | undefined, currency: string | null | undefined, fallbackCurrency: CurrencyCode): MoneyAmount | null {
  if (value === null || value === undefined) return null;
  const normalizedCurrency = toCurrency(currency, fallbackCurrency);
  const normalizedValue = normalize_currency_amount(value);
  if (!normalizedValue) return null;
  return { value: normalizedValue, currency: normalizedCurrency };
}

function toWarning(message: string, field: string | null): Warning {
  return { code: "LOW_CONFIDENCE_EXTRACTION", message, field };
}

function evidence(field: string, value: string | null, source: FieldEvidence["source"], confidence: number): FieldEvidence {
  return {
    field,
    value,
    originalValue: value,
    normalizedValue: null,
    confidence,
    source,
    evidenceText: value,
    page: source.startsWith("pdf") ? 1 : null,
    bbox: null,
    warnings: []
  };
}

function sourceFromTool(tool: string): FieldEvidence["source"] {
  if (tool === "parse_csv_text") return "csv";
  if (tool === "parse_spreadsheet") return "xlsx";
  if (tool === "parse_pdf_table") return "pdf_table";
  if (tool === "parse_image_ocr") return "image_ocr";
  if (tool === "manual_correction") return "manual";
  return "pdf_text";
}

function inputFileDescriptor(stored: StoredDocument, inputKind: InputFileDescriptor["inputKind"], uploadedAt: string): InputFileDescriptor {
  return {
    schemaVersion: "1.0.0",
    fileId: stored.documentId,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    inputKind,
    sizeBytes: stored.sizeBytes,
    storageRef: stored.storageRef,
    uploadedAt,
    parseStatus: stored.warnings.length > 0 ? "NEEDS_MAPPING" : "PARSED",
    warnings: stored.warnings.map((warning) => toWarning(warning, null))
  };
}

function paymentProofInputDescriptor(stored: StoredDocument, uploadedAt: string): PaymentProofInputDescriptor {
  const tableLikely = stored.toolObservations.some((observation) => observation.toLowerCase().includes("table"));
  return {
    ...inputFileDescriptor(stored, "payment_proof", uploadedAt),
    mimeType: stored.mimeType as PaymentProofInputDescriptor["mimeType"],
    inputKind: "payment_proof",
    textLayer: stored.mimeType === "application/pdf" || stored.mimeType === "text/plain",
    tableLikely,
    imageQuality: stored.mimeType.startsWith("image/") ? "unknown" : "high"
  };
}

function buildExpectedPayments(extraction: StructuredDocumentExtraction, stored: StoredDocument): ExpectedPaymentRecord[] {
  const source = sourceFromTool(extraction.selectedTool);
  return extraction.invoices.map((invoice, index) => {
    const invoiceNumber = invoice.invoiceNumber ?? `UNKNOWN-${index + 1}`;
    const issueDate = normalize_date(invoice.issueDate) ?? new Date().toISOString().slice(0, 10);
    const dueDate = normalize_date(invoice.dueDate);
    const amountDue = toMoneyAmount(invoice.amountDue.value, invoice.amountDue.currency, "USD") ?? { value: "0.00", currency: "USD" };
    const rawReference = invoice.paymentReference ?? invoice.invoiceNumber;
    const warnings = [...extraction.warnings.map((warning) => toWarning(warning, null))];

    if (!invoice.invoiceNumber) warnings.push({ code: "MISSING_PAYMENT_REFERENCE", message: "Invoice number is missing.", field: "invoiceNumber" });
    if (!invoice.customerName) warnings.push({ code: "MISSING_DEBTOR", message: "Customer/debtor name is missing.", field: "customerName" });
    if (!invoice.amountDue.value) warnings.push({ code: "MISSING_PAID_AMOUNT", message: "Invoice amount is missing.", field: "amountDue.value" });

    return {
      schemaVersion: "1.0.0",
      expectedPaymentId: `exp_${stored.documentId}_${String(index + 1).padStart(3, "0")}`,
      invoiceNumber,
      issueDate,
      dueDate,
      creditor: { name: null, normalizedName: null },
      debtor: { name: invoice.customerName, normalizedName: normalize_party_name(invoice.customerName) },
      creditorAccount: null,
      debtorAccount: null,
      invoiceCurrency: amountDue.currency,
      amountDue,
      expectedSettlementCurrency: "MYR",
      paymentReference: { raw: rawReference, normalized: normalize_reference(rawReference) },
      reconciliationStatus: "OPEN",
      debtorReference: null,
      purchaseOrderReference: null,
      paymentTerms: null,
      outstandingAmount: amountDue,
      sourceFileId: stored.documentId,
      sourceRowNumber: index + 1,
      fieldConfidence: {
        invoiceNumber: invoice.invoiceNumber ? extraction.confidence : 0,
        "debtor.name": invoice.customerName ? extraction.confidence : 0,
        "amountDue.value": invoice.amountDue.value ? extraction.confidence : 0,
        "amountDue.currency": invoice.amountDue.currency ? extraction.confidence : 0
      },
      evidenceSpans: [
        evidence("invoiceNumber", invoice.invoiceNumber, source, extraction.confidence),
        evidence("customerName", invoice.customerName, source, extraction.confidence),
        evidence("amountDue.value", invoice.amountDue.value, source, extraction.confidence)
      ],
      warnings
    };
  });
}

function buildBankTransactions(extraction: StructuredDocumentExtraction, stored: StoredDocument): BankStatementTransaction[] {
  return extraction.bankTransactions.map((transaction, index) => {
    const rawValue = transaction.amount.value ?? "0.00";
    const isDebit = rawValue.trim().startsWith("-");
    const absoluteValue = isDebit ? rawValue.trim().slice(1) : rawValue;
    const amount = toMoneyAmount(absoluteValue, transaction.amount.currency, "MYR") ?? { value: "0.00", currency: "MYR" };
    const reference = transaction.reference ?? transaction.description;
    const invoiceNumber = normalize_reference(reference) ? transaction.reference : null;
    const bookingDate = normalize_date(transaction.transactionDate) ?? new Date().toISOString().slice(0, 10);

    return {
      schemaVersion: "1.0.0",
      internalTxId: `txn_${stored.documentId}_${String(index + 1).padStart(3, "0")}`,
      accountId: "MYR_MAIN_ACCOUNT",
      bookingDate,
      valueDate: normalize_date(transaction.valueDate),
      creditDebitIndicator: isDebit ? "DBIT" : "CRDT",
      amount,
      acctSvcrRef: transaction.reference,
      normalizedReference: normalize_reference(reference),
      endToEndId: null,
      txId: null,
      debtorName: transaction.payerName,
      debtorNormalizedName: normalize_party_name(transaction.payerName),
      debtorAccount: null,
      creditorName: null,
      creditorNormalizedName: null,
      creditorAccount: null,
      remittanceInformation: {
        raw: transaction.description ?? transaction.reference,
        structured: {
          invoiceNumber,
          creditorReference: transaction.reference,
          additionalInfo: transaction.description
        }
      },
      description: transaction.description,
      rawDescription: transaction.description,
      sourceFileId: stored.documentId,
      sourceRowNumber: index + 1,
      warnings: extraction.warnings.map((warning) => toWarning(warning, null))
    };
  });
}

function mapPaymentStatus(status: string | null): PaymentProofExtractionOutput["financialPayload"]["paymentStatus"] {
  const normalized = status?.trim().toUpperCase();
  if (!normalized) return "UNKNOWN";
  if (["ACSC", "COMPLETED", "COMPLETE", "PAID", "SETTLED", "SUCCESS", "SUCCESSFUL"].includes(normalized)) return "ACSC";
  if (["ACSP", "PROCESSING"].includes(normalized)) return "ACSP";
  if (["PNDG", "PENDING", "SCHEDULED"].includes(normalized)) return "PNDG";
  if (["RJCT", "REJECTED", "FAILED", "FAILURE"].includes(normalized)) return "RJCT";
  if (["CANC", "CANCELLED", "CANCELED"].includes(normalized)) return "CANC";
  return "UNKNOWN";
}

function parseExchangeRate(rate: string | null): PaymentProofExtractionOutput["financialPayload"]["exchangeRateInformation"] {
  if (!rate) return null;
  const match = rate.match(/1\s+([A-Z]{3})\s*=\s*([0-9]+(?:\.[0-9]+)?)\s+([A-Z]{3})/i);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return {
    unitCurrency: toCurrency(match[1], "USD"),
    quotedCurrency: toCurrency(match[3], "MYR"),
    exchangeRate: match[2],
    rateType: "AGREED",
    source: "payment_proof",
    contractId: null,
    evidenceText: rate
  };
}

function buildPaymentProofExtractions(extraction: StructuredDocumentExtraction, stored: StoredDocument): PaymentProofExtractionOutput[] {
  const source = sourceFromTool(extraction.selectedTool);
  return extraction.paymentProofs.map((proof, index) => {
    const paidAmount = toMoneyAmount(proof.paidAmount.value, proof.paidAmount.currency, "MYR");
    const paymentStatus = mapPaymentStatus(proof.paymentStatus);
    const reference = proof.reference;
    const fieldConfidence: Record<string, number> = {
      "financialPayload.paidAmount.value": paidAmount ? extraction.confidence : 0,
      "financialPayload.paidAmount.currency": paidAmount ? extraction.confidence : 0,
      "financialPayload.paymentDate": proof.paymentDate ? extraction.confidence : 0,
      "financialPayload.reference.raw": reference ? extraction.confidence : 0,
      "financialPayload.debtor.rawName": proof.payerName ? extraction.confidence : 0,
      "financialPayload.creditor.rawName": proof.creditorName ? extraction.confidence : 0
    };
    const warnings = [...extraction.warnings.map((warning) => toWarning(warning, null))];
    if (!paidAmount) warnings.push({ code: "MISSING_PAID_AMOUNT", message: "Payment proof amount is missing.", field: "financialPayload.paidAmount" });
    if (!proof.paymentDate) warnings.push({ code: "MISSING_PAYMENT_DATE", message: "Payment proof date is missing.", field: "financialPayload.paymentDate" });
    if (!reference) warnings.push({ code: "MISSING_PAYMENT_REFERENCE", message: "Payment proof reference is missing.", field: "financialPayload.reference.raw" });
    if (!proof.payerName) warnings.push({ code: "MISSING_DEBTOR", message: "Payment proof payer is missing.", field: "financialPayload.debtor.rawName" });
    if (!proof.creditorName) warnings.push({ code: "MISSING_CREDITOR", message: "Payment proof creditor is missing.", field: "financialPayload.creditor.rawName" });

    return {
      schemaVersion: "1.0.0",
      proofId: `proof_${stored.documentId}_${String(index + 1).padStart(3, "0")}`,
      sourceFileId: stored.documentId,
      financialPayload: {
        documentType: "provider_receipt",
        paymentStatus,
        paymentStatusLabel: paymentStatus === "ACSC" ? "Settled" : proof.paymentStatus,
        rawPaymentStatus: proof.paymentStatus,
        debtor: { rawName: proof.payerName },
        creditor: { rawName: proof.creditorName },
        debtorAccount: null,
        creditorAccount: null,
        paidAmount,
        paymentDate: normalize_date(proof.paymentDate),
        valueDate: null,
        bookingDate: null,
        reference: { raw: reference },
        providerTransactionId: null,
        providerOrBankName: proof.providerOrBankName,
        invoiceIds: reference ? [reference] : [],
        endToEndId: null,
        uetr: null,
        feeAmount: null,
        netAmount: null,
        sourceAmount: null,
        targetAmount: null,
        exchangeRateInformation: parseExchangeRate(proof.exchangeRate),
        remittanceInformation: {
          raw: reference ? `Payment for ${reference}` : null,
          structured: reference ? { invoiceNumber: reference } : null
        },
        rawText: null
      },
      aiMetadata: {
        extractionRoute: extraction.selectedTool,
        overallConfidence: extraction.confidence,
        fieldConfidence,
        evidenceSpans: [
          evidence("financialPayload.paidAmount.value", proof.paidAmount.value, source, extraction.confidence),
          evidence("financialPayload.paymentDate", proof.paymentDate, source, extraction.confidence),
          evidence("financialPayload.reference.raw", reference, source, extraction.confidence),
          evidence("financialPayload.debtor.rawName", proof.payerName, source, extraction.confidence),
          evidence("financialPayload.creditor.rawName", proof.creditorName, source, extraction.confidence)
        ],
        requiresManualReview: extraction.confidence < 0.85 || paymentStatus !== "ACSC" || warnings.length > 0,
        warnings
      }
    };
  });
}

function buildParsedInputBatch(input: {
  batchId: string;
  uploadedAt: string;
  documents: Record<DocumentRole, StoredDocument[]>;
  extractions: Record<DocumentRole, StructuredDocumentExtraction[]>;
}): InputBatch {
  const invoiceFiles = input.documents.invoice.map((document) => inputFileDescriptor(document, "expected_payment_records", input.uploadedAt));
  const bankFiles = input.documents.bank_statement.map((document) => inputFileDescriptor(document, "bank_statement", input.uploadedAt));
  const proofFiles = input.documents.payment_proof.map((document) => paymentProofInputDescriptor(document, input.uploadedAt));

  return {
    schemaVersion: "1.0.0",
    batchId: input.batchId,
    uploadedAt: input.uploadedAt,
    files: [...invoiceFiles, ...bankFiles, ...proofFiles],
    expectedPayments: input.extractions.invoice.flatMap((extraction, index) => {
      const stored = input.documents.invoice[index];
      return stored ? buildExpectedPayments(extraction, stored) : [];
    }),
    bankTransactions: input.extractions.bank_statement.flatMap((extraction, index) => {
      const stored = input.documents.bank_statement[index];
      return stored ? buildBankTransactions(extraction, stored) : [];
    }),
    paymentProofInputs: proofFiles,
    paymentProofExtractions: input.extractions.payment_proof.flatMap((extraction, index) => {
      const stored = input.documents.payment_proof[index];
      return stored ? buildPaymentProofExtractions(extraction, stored) : [];
    }),
    warnings: [
      ...input.documents.invoice.flatMap((document) => document.warnings.map((warning) => toWarning(warning, "invoice"))),
      ...input.documents.bank_statement.flatMap((document) => document.warnings.map((warning) => toWarning(warning, "bank_statement"))),
      ...input.documents.payment_proof.flatMap((document) => document.warnings.map((warning) => toWarning(warning, "payment_proof")))
    ]
  };
}

async function storeDocuments(role: DocumentRole, uploads: UploadedDocument[], storageDir: string): Promise<Array<{ stored: StoredDocument; text: string }>> {
  if (uploads.length === 0) {
    throw new Error(`Upload at least one ${role.replace("_", " ")} document.`);
  }

  const storedDocuments: Array<{ stored: StoredDocument; text: string }> = [];
  for (const upload of uploads) {
    storedDocuments.push(await storeDocument(role, upload, storageDir));
  }
  return storedDocuments;
}

async function extractStoredDocuments(
  extractor: StructuredExtractor,
  documents: Array<{ stored: StoredDocument; text: string }>
): Promise<StructuredDocumentExtraction[]> {
  const extractions: StructuredDocumentExtraction[] = [];
  for (const document of documents) {
    extractions.push(
      await extractor({
        role: document.stored.role,
        fileName: document.stored.fileName,
        mimeType: document.stored.mimeType,
        text: document.text,
        toolObservations: [...document.stored.toolObservations, ...document.stored.warnings]
      })
    );
  }
  return extractions;
}

export async function extractReconciliationDocuments(
  request: ReconciliationExtractionRequest,
  options: ReconciliationExtractionOptions = {}
): Promise<ReconciliationExtractionResponse> {
  const storageDir = resolveStorageDir(options.storageDir);
  const extractor = options.extractor ?? createChutesStructuredExtractor();

  const invoices = await storeDocuments("invoice", request.invoices, storageDir);
  const bankStatements = await storeDocuments("bank_statement", request.bankStatements, storageDir);
  const paymentProofs = await storeDocuments("payment_proof", request.paymentProofs, storageDir);

  const invoiceExtractions = await extractStoredDocuments(extractor, invoices);
  const bankExtractions = await extractStoredDocuments(extractor, bankStatements);
  const proofExtractions = await extractStoredDocuments(extractor, paymentProofs);

  const batchId = `batch_${randomUUID()}`;
  const uploadedAt = new Date().toISOString();
  const documents = {
    invoice: invoices.map((document) => document.stored),
    bank_statement: bankStatements.map((document) => document.stored),
    payment_proof: paymentProofs.map((document) => document.stored)
  };
  const extractions = {
    invoice: invoiceExtractions,
    bank_statement: bankExtractions,
    payment_proof: proofExtractions
  };
  const parsedInputBatch = buildParsedInputBatch({ batchId, uploadedAt, documents, extractions });

  return {
    batchId,
    uploadedAt,
    documents,
    extractions,
    codeTools: {
      parsedInputBatch,
      normalizedInputBatch: normalizeInputBatch(parsedInputBatch)
    }
  };
}
