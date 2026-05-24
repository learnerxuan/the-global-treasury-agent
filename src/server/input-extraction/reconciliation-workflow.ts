import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import { readSheet } from "read-excel-file/node";
import { extractImageText } from "../../lib/recon/extraction/image-ocr";
import { extractPdfText } from "../../lib/recon/extraction/pdf-text";
import { createChutesStructuredExtractor, type DocumentRole, type StructuredDocumentExtraction, type StructuredExtractor } from "../../lib/recon/extraction/structured-extractor";

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

  return {
    batchId: `batch_${randomUUID()}`,
    uploadedAt: new Date().toISOString(),
    documents: {
      invoice: invoices.map((document) => document.stored),
      bank_statement: bankStatements.map((document) => document.stored),
      payment_proof: paymentProofs.map((document) => document.stored)
    },
    extractions: {
      invoice: invoiceExtractions,
      bank_statement: bankExtractions,
      payment_proof: proofExtractions
    }
  };
}
