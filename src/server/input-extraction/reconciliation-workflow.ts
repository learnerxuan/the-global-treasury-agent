import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { readSheet } from "read-excel-file/node";
import { extractImageText } from "../../lib/recon/extraction/image-ocr";
import { extractPdfOcrText, extractPdfText } from "../../lib/recon/extraction/pdf-text";
import { createChutesStructuredExtractor, type DocumentRole, type StructuredDocumentExtraction, type StructuredExtractor } from "../../lib/recon/extraction/structured-extractor";
import { normalizeInputBatch } from "../../lib/recon/normalize-input-batch";
import { normalize_currency_amount, normalize_date, normalize_party_name, normalize_reference } from "../../lib/recon/normalizers";
import { parseBankStatements, parseBankStatementText } from "../../lib/recon/parsers/bank-statements";
import { runReconciliationForWaitingProof, type ProofReconciliationRun } from "../reconciliation/waiting-reconciliation";
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
const defaultExtractedDir = join(/* turbopackIgnore: true */ process.cwd(), "runtime", "extracted");

const supportedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "text/plain",
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
  extractedDir?: string;
  extractor?: StructuredExtractor;
};

export type LocalExtractionStorage = {
  ingestionDir: string;
  documentsPath: string;
  extractionsPath: string;
  parsedInputBatchPath: string;
  normalizedInputBatchPath: string;
  jobsPath: string;
  summaryPath: string;
  rawTextDir: string;
  waitingRecordPaths: string[];
};

export type MockReconciliationRun = {
  runId: string;
  status: "queued_mock";
  trigger: "payment_proof_uploaded";
  createdAt: string;
  paymentProofRecordPaths: string[];
  message: string;
  nextStep: string;
  path: string;
};

export type ExtractionOutcome = {
  fileName: string;
  status: "extracted" | "failed";
  records: number;
  error: string | null;
};

export type ExtractionSummary = {
  total: number;
  extracted: number;
  failed: number;
  outcomes: ExtractionOutcome[];
};

export type RoleExtractionResponse = {
  ingestionId: string;
  role: DocumentRole;
  uploadedAt: string;
  documents: StoredDocument[];
  extractions: StructuredDocumentExtraction[];
  extractionSummary: ExtractionSummary;
  codeTools: {
    parsedInputBatch: InputBatch;
    normalizedInputBatch: NormalizedInputBatch;
  };
  storage: LocalExtractionStorage;
  mockReconciliationRun: MockReconciliationRun | null;
  reconciliationRuns: ProofReconciliationRun[];
  debugResponsePath: string;
};

function resolveStorageDir(storageDir?: string): string {
  if (!storageDir) return defaultStorageDir;
  return isAbsolute(storageDir) ? storageDir : resolve(/* turbopackIgnore: true */ process.cwd(), storageDir);
}

function resolveExtractedDir(extractedDir?: string): string {
  if (!extractedDir) return defaultExtractedDir;
  return isAbsolute(extractedDir) ? extractedDir : resolve(/* turbopackIgnore: true */ process.cwd(), extractedDir);
}

function toProjectRelativePath(path: string): string {
  if (!isAbsolute(path)) return path.replace(/\\/g, "/");
  const relativePath = relative(/* turbopackIgnore: true */ process.cwd(), path);
  return relativePath.startsWith("..") ? path.replace(/\\/g, "/") : relativePath.replace(/\\/g, "/");
}

function toPublicJson<T>(value: T): T {
  if (typeof value === "string") return toProjectRelativePath(value) as T;
  if (Array.isArray(value)) return value.map((item) => toPublicJson(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toPublicJson(item)])
    ) as T;
  }
  return value;
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
    throw new Error(`Unsupported document type: ${mimeType}. Supported types: PDF, image, XLSX, CSV, and TXT.`);
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
      if (text.trim().length < 40) {
        try {
          const ocrText = await extractPdfOcrText(bytes);
          if (ocrText.trim().length > 0) {
            return {
              text: ocrText,
              warnings: ["PDF text layer was empty or too short; OCR fallback was used."],
              observations: ["Scanned PDF likely", "PDF page screenshots were OCR processed", "OCR text is available"]
            };
          }
        } catch (ocrError) {
          return {
            text,
            warnings: [
              "PDF text layer was empty or too short.",
              `Could not OCR PDF pages: ${ocrError instanceof Error ? ocrError.message : "unknown error"}`
            ],
            observations: ["Scanned PDF likely", "PDF OCR failed"]
          };
        }
      }
      return {
        text,
        warnings: [],
        observations: [looksTableLike(text) ? "PDF text appears table-like" : "PDF text layer is readable"]
      };
    } catch (error) {
      try {
        const ocrText = await extractPdfOcrText(bytes);
        if (ocrText.trim().length > 0) {
          return {
            text: ocrText,
            warnings: [`Could not read PDF text layer: ${error instanceof Error ? error.message : "unknown error"}; OCR fallback was used.`],
            observations: ["PDF text extraction failed", "PDF page screenshots were OCR processed", "OCR text is available"]
          };
        }
      } catch (ocrError) {
        return {
          text: "",
          warnings: [
            `Could not read PDF text: ${error instanceof Error ? error.message : "unknown error"}`,
            `Could not OCR PDF pages: ${ocrError instanceof Error ? ocrError.message : "unknown error"}`
          ],
          observations: ["PDF text extraction failed", "PDF OCR failed"]
        };
      }

      return {
        text: "",
        warnings: [`Could not read PDF text: ${error instanceof Error ? error.message : "unknown error"}`],
        observations: ["PDF text extraction failed"]
      };
    }
  }

  if (mimeType.startsWith("image/")) {
    try {
      const ocrResult = await extractImageText(path);
      return { text: ocrResult.text, warnings: [], observations: ["Image OCR text is available"] };
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

type StoredDocumentContent = { stored: StoredDocument; text: string; bytes: Buffer };

async function storeDocument(role: DocumentRole, upload: UploadedDocument, storageDir: string): Promise<StoredDocumentContent> {
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
    bytes,
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

function toCurrency(value: string | null | undefined, fallback: CurrencyCode): CurrencyCode {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : fallback;
}

function toMoneyAmount(value: string | null | undefined, currency: string | null | undefined, fallbackCurrency: CurrencyCode): MoneyAmount | null {
  if (value === null || value === undefined) return null;
  const normalizedCurrency = toCurrency(currency, fallbackCurrency);
  const normalizedValue = normalize_currency_amount(value);
  if (!normalizedValue) return null;
  return { value: normalizedValue, currency: normalizedCurrency };
}

function extractedMoneyToAmount(
  amount: { value: string | null; currency: string | null } | null | undefined,
  fallbackCurrency: CurrencyCode
): MoneyAmount | null {
  return toMoneyAmount(amount?.value, amount?.currency, fallbackCurrency);
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
    const netCreditAmount = extractedMoneyToAmount(transaction.netCreditAmount, "MYR");
    const amountReceived = extractedMoneyToAmount(transaction.amountReceived, "MYR");
    const sourceAmount = extractedMoneyToAmount(transaction.sourceAmount, "USD");
    const bankFeeDeducted = extractedMoneyToAmount(transaction.bankFeeDeducted, "MYR");
    const feeCurrency = bankFeeDeducted?.currency ?? (transaction.feeCurrency ? toCurrency(transaction.feeCurrency, "MYR") : null);
    const primaryAmount = netCreditAmount ?? amountReceived ?? extractedMoneyToAmount(transaction.amount, "MYR");
    const rawValue = primaryAmount?.value ?? transaction.amount.value ?? "0.00";
    const isDebit = rawValue.trim().startsWith("-");
    const creditDebitIndicator = transaction.creditDebitIndicator ?? (isDebit ? "DBIT" : "CRDT");
    const absoluteValue = isDebit ? rawValue.trim().slice(1) : rawValue;
    const amount = toMoneyAmount(absoluteValue, primaryAmount?.currency ?? transaction.amount.currency, "MYR") ?? { value: "0.00", currency: "MYR" };
    const reference = transaction.referenceNo ?? transaction.reference ?? transaction.ttNo ?? transaction.description;
    const invoiceNumber = normalize_reference(reference) ? reference : null;
    const bookingDate = normalize_date(transaction.transactionDate) ?? new Date().toISOString().slice(0, 10);
    const remarks = transaction.remarks ?? transaction.description;

    return {
      schemaVersion: "1.0.0",
      internalTxId: `txn_${stored.documentId}_${String(index + 1).padStart(3, "0")}`,
      accountId: "MYR_MAIN_ACCOUNT",
      bookingDate,
      valueDate: normalize_date(transaction.valueDate),
      creditDebitIndicator,
      amount,
      amountReceived: creditDebitIndicator === "CRDT" ? amountReceived : null,
      sourceAmount,
      exchangeRateApplied: transaction.exchangeRateApplied ?? null,
      bankFeeDeducted,
      feeCurrency,
      netCreditAmount: creditDebitIndicator === "CRDT" ? netCreditAmount : null,
      acctSvcrRef: transaction.referenceNo ?? transaction.reference ?? transaction.ttNo ?? null,
      referenceNo: transaction.referenceNo ?? transaction.reference ?? null,
      ttNo: transaction.ttNo ?? null,
      normalizedReference: normalize_reference(reference),
      endToEndId: null,
      txId: transaction.ttNo ?? null,
      debtorName: transaction.payerName,
      debtorNormalizedName: normalize_party_name(transaction.payerName),
      debtorAccount: null,
      creditorName: null,
      creditorNormalizedName: null,
      creditorAccount: null,
      remittanceInformation: {
        raw: remarks ?? transaction.reference ?? transaction.referenceNo ?? transaction.ttNo ?? null,
        structured: {
          invoiceNumber,
          creditorReference: transaction.referenceNo ?? transaction.reference ?? transaction.ttNo ?? null,
          additionalInfo: remarks
        }
      },
      description: transaction.description,
      rawDescription: transaction.description,
      remarks,
      sourceFileId: stored.documentId,
      sourceRowNumber: index + 1,
      warnings: extraction.warnings.map((warning) => toWarning(warning, null))
    };
  });
}

function mapPaymentStatus(status: string | null): PaymentProofExtractionOutput["financialPayload"]["paymentStatus"] {
  const normalized = status?.trim().toUpperCase();
  if (!normalized) return "UNKNOWN";
  if (["ACSC", "COMPLETED", "COMPLETE", "PAID", "SETTLED", "SUCCESS", "SUCCESSFUL", "TRANSFER COMPLETED", "DEPOSIT ACKNOWLEDGED"].includes(normalized)) return "ACSC";
  if (["ACSP", "PROCESSING", "IN PROCESS", "IN PROGRESS"].includes(normalized)) return "ACSP";
  if (["PNDG", "PENDING", "SCHEDULED", "PENDING RELEASE", "AWAITING RELEASE", "HELD"].includes(normalized)) return "PNDG";
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
    const explicitPaidAmount = toMoneyAmount(proof.paidAmount.value, proof.paidAmount.currency, "MYR");
    const grossAmount = extractedMoneyToAmount(proof.grossAmount, explicitPaidAmount?.currency ?? "USD");
    const feeAmount = extractedMoneyToAmount(proof.feeAmount, explicitPaidAmount?.currency ?? "USD");
    const netAmount = extractedMoneyToAmount(proof.netAmount, explicitPaidAmount?.currency ?? grossAmount?.currency ?? "USD");
    const paidAmount = explicitPaidAmount ?? netAmount ?? grossAmount;
    const feeCurrency = feeAmount?.currency ?? (proof.feeCurrency ? toCurrency(proof.feeCurrency, paidAmount?.currency ?? "USD") : null);
    const paymentStatus = mapPaymentStatus(proof.paymentStatus);
    const reference = proof.reference;
    const invoiceIds = [...new Set([...(proof.invoiceIds ?? []), ...(reference ? [reference] : [])].filter((value): value is string => Boolean(value)))];
    const remittanceLineItems = (proof.remittanceLineItems ?? []).map((item) => ({
      invoiceNumber: item.invoiceNumber,
      paidAmount: extractedMoneyToAmount(item.paidAmount ?? null, paidAmount?.currency ?? "USD"),
      discountAmount: extractedMoneyToAmount(item.discountAmount ?? null, paidAmount?.currency ?? "USD"),
      feeAmount: extractedMoneyToAmount(item.feeAmount ?? null, paidAmount?.currency ?? "USD"),
      note: item.note ?? null
    }));
    const isRemittanceAdvice = invoiceIds.length > 1 || remittanceLineItems.length > 0;
    const fieldConfidence: Record<string, number> = {
      "financialPayload.paidAmount.value": paidAmount ? extraction.confidence : 0,
      "financialPayload.paidAmount.currency": paidAmount ? extraction.confidence : 0,
      "financialPayload.paymentDate": proof.paymentDate ? extraction.confidence : 0,
      "financialPayload.reference.raw": reference || invoiceIds.length > 0 ? extraction.confidence : 0,
      "financialPayload.invoiceIds": invoiceIds.length > 0 ? extraction.confidence : 0,
      "financialPayload.debtor.rawName": proof.payerName ? extraction.confidence : 0,
      "financialPayload.creditor.rawName": proof.creditorName ? extraction.confidence : 0
    };
    const warnings = [...extraction.warnings.map((warning) => toWarning(warning, null))];
    if (!paidAmount) warnings.push({ code: "MISSING_PAID_AMOUNT", message: "Payment proof amount is missing.", field: "financialPayload.paidAmount" });
    if (!proof.paymentDate) warnings.push({ code: "MISSING_PAYMENT_DATE", message: "Payment proof date is missing.", field: "financialPayload.paymentDate" });
    if (!reference && invoiceIds.length === 0) warnings.push({ code: "MISSING_PAYMENT_REFERENCE", message: "Payment proof reference is missing.", field: "financialPayload.reference.raw" });
    if (!proof.payerName) warnings.push({ code: "MISSING_DEBTOR", message: "Payment proof payer is missing.", field: "financialPayload.debtor.rawName" });
    if (!proof.creditorName) warnings.push({ code: "MISSING_CREDITOR", message: "Payment proof creditor is missing.", field: "financialPayload.creditor.rawName" });

    return {
      schemaVersion: "1.0.0",
      proofId: `proof_${stored.documentId}_${String(index + 1).padStart(3, "0")}`,
      sourceFileId: stored.documentId,
      financialPayload: {
        documentType: isRemittanceAdvice ? "remittance_advice" : "provider_receipt",
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
        invoiceIds,
        remittanceLineItems,
        endToEndId: null,
        uetr: null,
        feeAmount,
        feeCurrency,
        netAmount,
        sourceAmount: grossAmount ?? netAmount ?? paidAmount,
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

async function storeDocuments(role: DocumentRole, uploads: UploadedDocument[], storageDir: string): Promise<StoredDocumentContent[]> {
  if (uploads.length === 0) {
    throw new Error(`Upload at least one ${role.replace("_", " ")} document.`);
  }

  const storedDocuments: StoredDocumentContent[] = [];
  for (const upload of uploads) {
    storedDocuments.push(await storeDocument(role, upload, storageDir));
  }
  return storedDocuments;
}

function bankStatementFormatForDocument(document: StoredDocument): "csv" | "xlsx" | "text" | null {
  if (isCsvLike(document.mimeType, document.fileName)) return "csv";
  if (isSpreadsheetLike(document.mimeType, document.fileName)) return "xlsx";
  if (document.mimeType === "application/pdf" || document.mimeType === "text/plain") return "text";
  return null;
}

function hasUsableBankParserRecords(records: BankStatementTransaction[]): boolean {
  return records.some(
    (record) =>
      record.amount.value !== "0.00" &&
      Boolean(record.bookingDate) &&
      Boolean(record.description ?? record.rawDescription ?? record.acctSvcrRef)
  );
}

function bankParserExtraction(document: StoredDocumentContent): StructuredDocumentExtraction | null {
  if (document.stored.role !== "bank_statement") return null;

  const format = bankStatementFormatForDocument(document.stored);
  if (!format) return null;

  const parsed = format === "text"
    ? parseBankStatementText(document.text, document.stored.documentId, "MYR_MAIN_ACCOUNT")
    : parseBankStatements(
        format === "xlsx" ? document.bytes : document.text,
        format,
        document.stored.documentId,
        "MYR_MAIN_ACCOUNT"
      );

  if (!hasUsableBankParserRecords(parsed.records)) return null;

  const warnings = [
    ...parsed.warnings.map((warning) => warning.message),
    ...parsed.records.flatMap((record) => record.warnings.map((warning) => warning.message))
  ];

  return {
    role: "bank_statement",
    selectedTool: format === "xlsx" ? "parse_spreadsheet" : format === "csv" ? "parse_csv_text" : "parse_pdf_text",
    confidence: 0.98,
    summary: `Code parser extracted ${parsed.records.length} bank transaction(s); LLM call skipped.`,
    invoices: [],
    bankTransactions: parsed.records.map((record) => ({
      transactionDate: record.bookingDate,
      valueDate: record.valueDate,
      description: record.description,
      payerName: record.debtorName,
      amount: record.amount,
      creditDebitIndicator: record.creditDebitIndicator,
      amountReceived: record.amountReceived ?? null,
      sourceAmount: record.sourceAmount ?? null,
      exchangeRateApplied: record.exchangeRateApplied ?? null,
      bankFeeDeducted: record.bankFeeDeducted ?? null,
      feeCurrency: record.feeCurrency ?? null,
      netCreditAmount: record.netCreditAmount ?? null,
      reference: record.acctSvcrRef ?? record.normalizedReference ?? null,
      referenceNo: record.referenceNo ?? record.acctSvcrRef ?? null,
      ttNo: record.ttNo ?? record.txId ?? null,
      remarks: record.remarks ?? record.remittanceInformation.raw ?? null
    })),
    paymentProofs: [],
    warnings
  };
}

function hasBankCoreFields(transaction: StructuredDocumentExtraction["bankTransactions"][number]): boolean {
  return Boolean(
    transaction.transactionDate &&
    transaction.amount.value &&
    (transaction.description || transaction.reference || transaction.referenceNo || transaction.ttNo)
  );
}

function calibrateExtractionConfidence(extraction: StructuredDocumentExtraction): StructuredDocumentExtraction {
  if (extraction.role !== "bank_statement" || extraction.selectedTool === "manual_correction") {
    return extraction;
  }

  const hasCoreBankFields = extraction.bankTransactions.some(hasBankCoreFields);
  if (!hasCoreBankFields || extraction.confidence >= 0.9) return extraction;

  return {
    ...extraction,
    confidence: 0.9,
    summary: `${extraction.summary} Core bank statement fields are present, so missing FX/source/fee fields were treated as optional.`
  };
}

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function extractStoredDocuments(
  extractor: StructuredExtractor,
  documents: StoredDocumentContent[]
): Promise<StructuredDocumentExtraction[]> {
  const extractions: StructuredDocumentExtraction[] = [];
  for (const document of documents) {
    try {
      const codeExtraction = bankParserExtraction(document);
      if (codeExtraction) {
        extractions.push(codeExtraction);
        continue;
      }

      const extraction = await extractor({
        role: document.stored.role,
        fileName: document.stored.fileName,
        mimeType: document.stored.mimeType,
        text: document.text,
        toolObservations: [...document.stored.toolObservations, ...document.stored.warnings]
      });
      extractions.push(calibrateExtractionConfidence(extraction));
      await sleep(6000);
    } catch (error) {
      extractions.push({
        role: document.stored.role,
        selectedTool: "manual_correction",
        confidence: 0,
        summary: `Extraction failed for ${document.stored.fileName}.`,
        invoices: [],
        bankTransactions: [],
        paymentProofs: [],
        warnings: [`Extraction failed: ${error instanceof Error ? error.message : "unknown error"}`]
      });
    }
  }
  return extractions;
}

function emptyStoredDocuments(): Record<DocumentRole, StoredDocument[]> {
  return { invoice: [], bank_statement: [], payment_proof: [] };
}

function emptyExtractions(): Record<DocumentRole, StructuredDocumentExtraction[]> {
  return { invoice: [], bank_statement: [], payment_proof: [] };
}

function documentsForRole(role: DocumentRole, documents: StoredDocument[]): Record<DocumentRole, StoredDocument[]> {
  return { ...emptyStoredDocuments(), [role]: documents };
}

function extractionsForRole(role: DocumentRole, extractions: StructuredDocumentExtraction[]): Record<DocumentRole, StructuredDocumentExtraction[]> {
  return { ...emptyExtractions(), [role]: extractions };
}

function extractedRoleFolder(role: DocumentRole): string {
  if (role === "invoice") return "invoices";
  if (role === "bank_statement") return "bank_transactions";
  return "payment_proofs";
}

function recordCountForRole(role: DocumentRole, extraction: StructuredDocumentExtraction): number {
  if (role === "invoice") return extraction.invoices.length;
  if (role === "bank_statement") return extraction.bankTransactions.length;
  return extraction.paymentProofs.length;
}

// A file is treated as failed when the extractor could not produce a usable
// result — i.e. it fell back to manual_correction with zero confidence (LLM
// error / rate limit, or unreadable text). The first warning carries the reason.
function isFailedExtraction(extraction: StructuredDocumentExtraction): boolean {
  return extraction.selectedTool === "manual_correction" && extraction.confidence === 0;
}

function buildExtractionSummary(
  role: DocumentRole,
  storedDocuments: StoredDocumentContent[],
  extractions: StructuredDocumentExtraction[]
): ExtractionSummary {
  const outcomes: ExtractionOutcome[] = storedDocuments.map((document, index) => {
    const extraction = extractions[index];
    const failed = !extraction || isFailedExtraction(extraction);
    return {
      fileName: document.stored.fileName,
      status: failed ? "failed" : "extracted",
      records: extraction ? recordCountForRole(role, extraction) : 0,
      error: failed ? extraction?.warnings[0] ?? "Extraction failed." : null
    };
  });

  const failed = outcomes.filter((outcome) => outcome.status === "failed").length;
  return {
    total: outcomes.length,
    extracted: outcomes.length - failed,
    failed,
    outcomes
  };
}

function waitingRecordsForRole(role: DocumentRole, normalizedInputBatch: NormalizedInputBatch): Array<{ recordId: string; record: unknown }> {
  if (role === "invoice") {
    return normalizedInputBatch.expectedPayments.map((record) => ({ recordId: record.expectedPaymentId, record }));
  }

  if (role === "bank_statement") {
    return normalizedInputBatch.bankTransactions.map((record) => ({ recordId: record.internalTxId, record }));
  }

  return normalizedInputBatch.paymentProofs.map((record) => ({ recordId: record.proofId, record }));
}

function safeJsonFileName(value: string): string {
  return `${value.replace(/[^a-zA-Z0-9._-]/g, "-")}.json`;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function persistRoleExtraction(input: {
  extractedDir: string;
  ingestionId: string;
  role: DocumentRole;
  uploadedAt: string;
  storedDocuments: StoredDocumentContent[];
  extractions: StructuredDocumentExtraction[];
  parsedInputBatch: InputBatch;
  normalizedInputBatch: NormalizedInputBatch;
}): Promise<LocalExtractionStorage> {
  const roleFolder = extractedRoleFolder(input.role);
  const ingestionDir = join(input.extractedDir, "ingestions", input.ingestionId);
  const rawTextDir = join(ingestionDir, "raw_text");
  const documentsPath = join(ingestionDir, "documents.json");
  const extractionsPath = join(ingestionDir, "extractions.json");
  const parsedInputBatchPath = join(ingestionDir, "parsed_input_batch.json");
  const normalizedInputBatchPath = join(ingestionDir, "normalized_input_batch.json");
  const jobsPath = join(ingestionDir, "jobs.json");
  const summaryPath = join(ingestionDir, "summary.json");
  const waitingDir = join(input.extractedDir, "waiting", roleFolder);

  await mkdir(rawTextDir, { recursive: true });
  await mkdir(waitingDir, { recursive: true });

  await Promise.all(
    input.storedDocuments.map((document) =>
      writeFile(join(rawTextDir, `${document.stored.documentId}.txt`), document.text, "utf8")
    )
  );

  const documents = input.storedDocuments.map((document) => toPublicJson(document.stored));
  const jobs = documents.map((document, index) => {
    const extraction = input.extractions[index];
    const failed = !extraction || isFailedExtraction(extraction);
    return {
      jobId: `job_${document.documentId}`,
      ingestionId: input.ingestionId,
      documentId: document.documentId,
      role: input.role,
      status: failed ? "failed" : "completed",
      selectedTool: extraction?.selectedTool ?? null,
      confidence: extraction?.confidence ?? null,
      uploadedAt: input.uploadedAt,
      completedAt: new Date().toISOString(),
      error: failed ? extraction?.warnings[0] ?? "Extraction failed." : null
    };
  });

  const waitingRecordPaths: string[] = [];
  for (const { recordId, record } of waitingRecordsForRole(input.role, input.normalizedInputBatch)) {
    const recordPath = join(waitingDir, safeJsonFileName(recordId));
    waitingRecordPaths.push(toProjectRelativePath(recordPath));
    await writeJson(recordPath, {
      stage: "waiting",
      role: input.role,
      ingestionId: input.ingestionId,
      storedAt: new Date().toISOString(),
      record
    });
  }

  await writeJson(documentsPath, documents);
  await writeJson(extractionsPath, input.extractions);
  await writeJson(parsedInputBatchPath, input.parsedInputBatch);
  await writeJson(normalizedInputBatchPath, input.normalizedInputBatch);
  await writeJson(jobsPath, jobs);
  await writeJson(summaryPath, {
    ingestionId: input.ingestionId,
    role: input.role,
    uploadedAt: input.uploadedAt,
    documentCount: documents.length,
    extractionCount: input.extractions.length,
    waitingRecordCount: waitingRecordPaths.length,
    waitingDir: toProjectRelativePath(waitingDir)
  });

  return {
    ingestionDir: toProjectRelativePath(ingestionDir),
    documentsPath: toProjectRelativePath(documentsPath),
    extractionsPath: toProjectRelativePath(extractionsPath),
    parsedInputBatchPath: toProjectRelativePath(parsedInputBatchPath),
    normalizedInputBatchPath: toProjectRelativePath(normalizedInputBatchPath),
    jobsPath: toProjectRelativePath(jobsPath),
    summaryPath: toProjectRelativePath(summaryPath),
    rawTextDir: toProjectRelativePath(rawTextDir),
    waitingRecordPaths
  };
}

export async function extractRoleDocuments(
  role: DocumentRole,
  uploads: UploadedDocument[],
  options: ReconciliationExtractionOptions = {}
): Promise<RoleExtractionResponse> {
  const storageDir = resolveStorageDir(options.storageDir);
  const extractedDir = resolveExtractedDir(options.extractedDir);
  const extractor = options.extractor ?? createChutesStructuredExtractor();
  const storedDocuments = await storeDocuments(role, uploads, storageDir);
  const extractions = await extractStoredDocuments(extractor, storedDocuments);
  const uploadedAt = new Date().toISOString();
  const ingestionId = `ing_${role}_${randomUUID()}`;
  const documents = documentsForRole(role, storedDocuments.map((document) => document.stored));
  const extractionRecord = extractionsForRole(role, extractions);
  const parsedInputBatch = buildParsedInputBatch({ batchId: ingestionId, uploadedAt, documents, extractions: extractionRecord });
  const normalizedInputBatch = normalizeInputBatch(parsedInputBatch);
  const storage = await persistRoleExtraction({
    extractedDir,
    ingestionId,
    role,
    uploadedAt,
    storedDocuments,
    extractions,
    parsedInputBatch,
    normalizedInputBatch
  });
  // Reconcile proofs sequentially. Each AUTO_MATCHED run moves invoice/bank
  // records from waiting -> completed, so running them one at a time ensures
  // every match commits its file moves before the next proof reads the waiting
  // store. Running concurrently could race on the same invoice/bank record.
  const reconciliationRuns: ProofReconciliationRun[] = [];
  if (role === "payment_proof") {
    for (const path of storage.waitingRecordPaths) {
      reconciliationRuns.push(
        await runReconciliationForWaitingProof(path, { extractedDir, trigger: "payment_proof_uploaded" })
      );
    }
  }
  const debugResponsePath = join(extractedDir, "debug_responses", `${ingestionId}_response.json`);

  const response: RoleExtractionResponse = {
    ingestionId,
    role,
    uploadedAt,
    documents: toPublicJson(documents[role]),
    extractions,
    extractionSummary: buildExtractionSummary(role, storedDocuments, extractions),
    codeTools: {
      parsedInputBatch: toPublicJson(parsedInputBatch),
      normalizedInputBatch: toPublicJson(normalizedInputBatch)
    },
    storage,
    mockReconciliationRun: null,
    reconciliationRuns: toPublicJson(reconciliationRuns),
    debugResponsePath: toProjectRelativePath(debugResponsePath)
  };

  await writeJson(debugResponsePath, response);
  return response;
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
    documents: toPublicJson(documents),
    extractions,
    codeTools: {
      parsedInputBatch: toPublicJson(parsedInputBatch),
      normalizedInputBatch: toPublicJson(normalizeInputBatch(parsedInputBatch))
    }
  };
}
